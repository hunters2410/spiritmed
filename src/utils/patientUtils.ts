import { supabase } from '../lib/supabase';

export interface PatientFetchOptions {
  branchId?: string | null;
  select?: string;
  activeOnly?: boolean;
}

// ── Module-level cache for patient list (keyed by cacheKey) ──
const _patientCacheMap = new Map<string, { data: any[]; ts: number }>();
const PATIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches all patients from Supabase by paginating in chunks of 1,000.
 * This completely bypasses PostgREST's default 1,000 row max limit per request.
 *
 * Results are cached in memory for 5 minutes (keyed by branchId + select + activeOnly).
 * Call `invalidatePatientCache()` after adding/editing a patient to force a refresh.
 */
export async function fetchAllPatients(options: PatientFetchOptions = {}) {
  const {
    branchId,
    select = 'id, full_name, patient_number, file_number, national_id, phone, gender, date_of_birth, medical_aid_id, status',
    activeOnly = false
  } = options;

  // Build a cache key from the options
  const cacheKey = `${branchId || 'all'}|${select}|${activeOnly}`;

  // Return cached data if fresh
  const cached = _patientCacheMap.get(cacheKey);
  if (cached && Date.now() - cached.ts < PATIENT_CACHE_TTL && cached.data.length > 0) {
    return cached.data;
  }

  let allPatients: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from('patients')
      .select(select)
      .range(from, from + pageSize - 1);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    if (activeOnly) {
      query = query.eq('status', 'active');
    }

    // Deterministic ordering to prevent shifting rows during multi-page pagination
    query = query
      .order('full_name', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching patients chunk at offset', from, error);
      break;
    }

    if (data && data.length > 0) {
      allPatients = allPatients.concat(data);
      if (data.length < pageSize) {
        break; // Reached the last page
      }
      from += pageSize;
    } else {
      break;
    }
  }

  // Populate cache
  if (allPatients.length > 0) {
    _patientCacheMap.set(cacheKey, { data: allPatients, ts: Date.now() });
  }

  return allPatients;
}

/** Force the patient cache to refresh on next fetch (call after add/edit/delete). */
export function invalidatePatientCache() {
  _patientCacheMap.clear();
}

/**
 * Formats a patient file number for display, stripping any DB collision suffixes (e.g. '-2', '-3').
 * Returns 'NO FILE' if no file number is available.
 */
export function formatFileNumber(fileNumber: string | null | undefined): string {
  if (!fileNumber) return 'NO FILE';
  const clean = fileNumber.split('-')[0].trim();
  return clean || 'NO FILE';
}

/**
 * Formats a patient ID/number for display, stripping any legacy 'P' or 'P-' prefixes.
 */
export function formatPatientNumber(patientNumber: string | null | undefined): string {
  if (!patientNumber) return '';
  let clean = String(patientNumber).trim();
  if (clean.startsWith('P-') || clean.startsWith('p-')) {
    clean = clean.slice(2);
  } else if (clean.startsWith('P') || clean.startsWith('p')) {
    clean = clean.slice(1);
  }
  return clean;
}


/**
 * Fetches all referral doctors without 1,000 limit limit by chunking.
 */
export async function fetchAllReferralDoctors(branchId?: string | null) {
  let allDoctors: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from('referral_doctors')
      .select('id, full_name, name, contact, email, address, affiliation')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
      .range(from, from + pageSize - 1);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching referral doctors:', error);
      break;
    }

    if (data && data.length > 0) {
      const mapped = data.map((doc: any) => ({
        ...doc,
        full_name: doc.full_name || doc.name || 'Referral Doctor',
        phone: doc.contact || doc.phone || '',
        specialization: doc.affiliation || doc.specialization || ''
      }));
      allDoctors = allDoctors.concat(mapped);
      if (data.length < pageSize) break;
      from += pageSize;
    } else {
      break;
    }
  }

  return allDoctors;
}
