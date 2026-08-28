/**
 * batchUploadService.ts
 *
 * Core engine for bulk uploading thousands of patient files to Supabase.
 *
 * Key design decisions for 4500-file scale:
 * ─────────────────────────────────────────
 * 1. CONCURRENCY: Uploads CONCURRENT_LIMIT files at a time (not one-by-one).
 *    Supabase allows many simultaneous connections; we use 5 to stay safe.
 *
 * 2. RETRY: Each file gets up to MAX_RETRIES attempts with exponential back-off.
 *    Network blips at this scale are inevitable.
 *
 * 3. MEMORY: We never hold all 4500 base64 strings in memory.
 *    We read → upload → discard one file at a time within each worker slot.
 *
 * 4. RESUME: Failed file URIs are saved to AsyncStorage.
 *    User can tap "Resume" after a crash or network outage.
 *
 * 5. BATCH DB INSERT: Instead of one INSERT per file, we batch insert
 *    records in groups of 50 to reduce round-trips.
 *
 * 6. NO PDF COMPILATION in bulk mode: Converting 4500 scans to PDF one-by-one
 *    is too slow. Files are uploaded as JPEG directly.
 */

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseAdmin } from './supabase';

// ─── Configuration ──────────────────────────────────────────────────────────
export const CONCURRENT_LIMIT = 5;   // Upload N files at the same time
export const MAX_RETRIES = 3;         // Retry failed uploads this many times
export const DB_BATCH_SIZE = 50;      // Insert DB records in chunks of 50

const RESUME_KEY = '@spiritmed_bulk_upload_resume';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface BulkFileItem {
  uri: string;
  fileName: string;
  mimeType: string;
  patientId: string;
  branchId?: string | null;
}

export interface BulkProgress {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentBatch: string[];    // Filenames currently uploading
  estimatedSecondsLeft: number;
  speedPerMinute: number;    // Files per minute
}

export interface BulkResult {
  successful: BulkFileItem[];
  failed: Array<{ item: BulkFileItem; error: string }>;
}

export type ProgressCallback = (progress: BulkProgress) => void;

// ─── Resume state ─────────────────────────────────────────────────────────────
export async function saveResumeState(remaining: BulkFileItem[]) {
  try {
    await AsyncStorage.setItem(RESUME_KEY, JSON.stringify(remaining));
  } catch (_) {}
}

export async function loadResumeState(): Promise<BulkFileItem[] | null> {
  try {
    const json = await AsyncStorage.getItem(RESUME_KEY);
    return json ? JSON.parse(json) : null;
  } catch (_) {
    return null;
  }
}

export async function clearResumeState() {
  await AsyncStorage.removeItem(RESUME_KEY).catch(() => {});
}

// ─── Read file bytes with triple-failsafe ────────────────────────────────────
async function readFileBytes(uri: string): Promise<Uint8Array> {
  let base64 = '';

  try {
    base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (_) {
    // Fallback: copy to documentDirectory first
    try {
      const tmp = `${FileSystem.documentDirectory}bulk_tmp_${Date.now()}`;
      await FileSystem.copyAsync({ from: uri, to: tmp });
      base64 = await FileSystem.readAsStringAsync(tmp, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
    } catch (_) {
      // Last resort: fetch as blob
      const resp = await fetch(uri);
      const blob = await resp.blob();
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl ? dataUrl.split(',')[1] || '' : '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  }

  const clean = base64.replace(/[\r\n\s]/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Upload one file with retry ───────────────────────────────────────────────
async function uploadOneFile(item: BulkFileItem, attempt = 1): Promise<string> {
  const safeName = item.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const storagePath = `${item.patientId}/${Date.now()}_${safeName}`;

  const bytes = await readFileBytes(item.uri);

  const { error: storageError } = await supabaseAdmin.storage
    .from('patient-files')
    .upload(storagePath, bytes.buffer, {
      contentType: item.mimeType,
      upsert: true,
    });

  if (storageError) {
    if (attempt < MAX_RETRIES) {
      // Exponential back-off: 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      return uploadOneFile(item, attempt + 1);
    }
    throw storageError;
  }

  const { data: urlData } = supabaseAdmin.storage
    .from('patient-files')
    .getPublicUrl(storagePath);

  return urlData.publicUrl;
}

// ─── Batch-insert DB records ──────────────────────────────────────────────────
async function flushDbBatch(
  batch: Array<{
    patient_id: string;
    branch_id: string | null;
    file_name: string;
    title: string;
    file_url: string;
    file_type: string;
    upload_date: string;
  }>
) {
  if (batch.length === 0) return;
  const { error } = await supabaseAdmin.from('patient_files').insert(batch);
  if (error) {
    console.warn('[batchUpload] DB batch insert error:', error.message);
  }
}

// ─── Main bulk upload engine ──────────────────────────────────────────────────
export async function runBulkUpload(
  items: BulkFileItem[],
  onProgress: ProgressCallback,
  signal: { cancelled: boolean }
): Promise<BulkResult> {
  const total = items.length;
  let completed = 0;
  let failed = 0;
  const startTime = Date.now();

  const successful: BulkFileItem[] = [];
  const failedItems: Array<{ item: BulkFileItem; error: string }> = [];
  let dbBatch: any[] = [];

  const today = new Date().toISOString().split('T')[0];

  // Track which items are still pending (for resume)
  const remaining = [...items];

  const emitProgress = (currentBatch: string[] = []) => {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = elapsed > 0 ? completed / elapsed : 0;  // files per second
    const left = rate > 0 ? (total - completed - failed) / rate : 0;

    onProgress({
      total,
      completed,
      failed,
      skipped: 0,
      currentBatch,
      estimatedSecondsLeft: Math.round(left),
      speedPerMinute: Math.round(rate * 60),
    });
  };

  // Semaphore: process CONCURRENT_LIMIT items at a time
  const queue = [...items];
  const inFlight: Promise<void>[] = [];

  const processOne = async (item: BulkFileItem) => {
    if (signal.cancelled) return;

    try {
      const publicUrl = await uploadOneFile(item);

      successful.push(item);
      completed++;

      // Accumulate DB record
      dbBatch.push({
        patient_id: item.patientId,
        branch_id: item.branchId || null,
        file_name: item.fileName,
        title: item.fileName,
        file_url: publicUrl,
        file_type: item.mimeType,
        upload_date: today,
      });

      // Flush DB batch when it reaches threshold
      if (dbBatch.length >= DB_BATCH_SIZE) {
        const toFlush = [...dbBatch];
        dbBatch = [];
        await flushDbBatch(toFlush);
      }

      // Remove from resume list
      const idx = remaining.findIndex((r) => r.uri === item.uri);
      if (idx !== -1) remaining.splice(idx, 1);
      await saveResumeState(remaining);
    } catch (e: any) {
      failed++;
      failedItems.push({ item, error: e?.message || 'Unknown error' });
    }

    emitProgress();
  };

  // Controlled concurrency loop
  while (queue.length > 0 && !signal.cancelled) {
    const batch = queue.splice(0, CONCURRENT_LIMIT);
    const currentNames = batch.map((b) => b.fileName);
    emitProgress(currentNames);

    await Promise.all(batch.map(processOne));
  }

  // Flush any remaining DB records
  if (dbBatch.length > 0) {
    await flushDbBatch(dbBatch);
  }

  if (completed + failed === total) {
    await clearResumeState();
  }

  return { successful, failed: failedItems };
}
