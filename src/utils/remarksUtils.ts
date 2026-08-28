import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'spiritmed_frequent_remarks_v1';

export const DEFAULT_REMARKS: string[] = [
  'Review',
  'R/V',
  'Review PSA',
  'uroflow bloods',
  'Initial Consultation',
  'Follow up after lab results',
  'Post-op review',
  'Routine checkup',
  'Medication refill',
  'Biopsy review',
  'Ultrasound review',
  'Catheter change'
];

interface RemarkFrequency {
  text: string;
  count: number;
  lastUsed: number;
}

let _cachedRemarks: string[] = [];

/**
 * Retrieve saved frequent remarks from localStorage merged with clinical defaults.
 */
export function getStoredRemarks(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_REMARKS;
    const parsed: RemarkFrequency[] = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_REMARKS;

    // Sort by count descending, then lastUsed
    const sorted = [...parsed].sort(
      (a, b) => (b.count || 0) - (a.count || 0) || (b.lastUsed || 0) - (a.lastUsed || 0)
    );
    const list = sorted.map(item => (item.text || '').trim()).filter(Boolean);

    // Merge with defaults
    const combined = Array.from(new Set([...list, ...DEFAULT_REMARKS]));
    return combined;
  } catch (e) {
    return DEFAULT_REMARKS;
  }
}

/**
 * Record a used/typed remark to increase its frequency in localStorage.
 */
export function recordRemarkUsage(remark: string) {
  if (!remark || !remark.trim()) return;
  const trimmed = remark.trim();
  if (trimmed.length < 2) return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let items: RemarkFrequency[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) items = [];

    // Check if whole remark exists
    const existingIndex = items.findIndex(
      i => i.text.toLowerCase() === trimmed.toLowerCase()
    );

    if (existingIndex >= 0) {
      items[existingIndex].count = (items[existingIndex].count || 1) + 1;
      items[existingIndex].lastUsed = Date.now();
    } else {
      items.push({
        text: trimmed,
        count: 1,
        lastUsed: Date.now()
      });
    }

    // Keep top 30 most typed phrases
    items.sort((a, b) => b.count - a.count);
    if (items.length > 30) {
      items = items.slice(0, 30);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    _cachedRemarks = getStoredRemarks();
  } catch (e) {
    console.error('Error saving remark frequency:', e);
  }
}

/**
 * Dynamically queries recent appointment notes from the Supabase DB
 * and counts occurrences to identify the hospital's most typed phrases.
 */
export async function fetchMostTypedRemarksFromDb(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('notes')
      .not('notes', 'is', null)
      .limit(300);

    if (error || !data) return getStoredRemarks();

    const frequencyMap = new Map<string, number>();

    data.forEach((row: any) => {
      const note = (row.notes || '').trim();
      if (
        note &&
        note.length >= 2 &&
        note.length <= 60 &&
        !note.startsWith('{') &&
        !note.startsWith('[')
      ) {
        frequencyMap.set(note, (frequencyMap.get(note) || 0) + 1);
      }
    });

    // Sort DB phrases by frequency
    const dbPhrases = Array.from(frequencyMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    // Merge DB phrases + local storage + defaults
    const local = getStoredRemarks();
    const merged = Array.from(new Set([...local, ...dbPhrases, ...DEFAULT_REMARKS]));
    _cachedRemarks = merged;
    return merged;
  } catch (err) {
    console.error('Error loading DB remarks:', err);
    return getStoredRemarks();
  }
}
