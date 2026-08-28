import { supabase } from '../lib/supabase';
import { Patient } from '../types';

let cachedPatients: Patient[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Fetch ALL patients from Supabase in chunks of 1000.
 * Guarantees that all 8,500+ patients are returned without the 1000 PostgREST limit.
 */
export const fetchAllPatients = async (forceRefresh = false): Promise<Patient[]> => {
  const now = Date.now();
  if (!forceRefresh && cachedPatients && cachedPatients.length > 0 && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedPatients;
  }

  try {
    const CHUNK_SIZE = 1000;
    let allPatients: Patient[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('patients')
        .select('id, full_name, patient_number, file_number, national_id, phone, email, gender, date_of_birth, title, status')
        .order('full_name', { ascending: true })
        .range(from, from + CHUNK_SIZE - 1);

      if (error) {
        console.error('Error fetching patient chunk:', error);
        break;
      }

      if (data && data.length > 0) {
        allPatients = allPatients.concat(data as Patient[]);
        from += data.length;
        if (data.length < CHUNK_SIZE) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    if (allPatients.length > 0) {
      cachedPatients = allPatients;
      lastFetchTime = now;
    }

    return allPatients;
  } catch (err) {
    console.error('Failed to fetch all patients:', err);
    return cachedPatients || [];
  }
};

/**
 * Invalidate the local cache when a patient is created or updated.
 */
export const invalidatePatientsCache = () => {
  cachedPatients = null;
  lastFetchTime = 0;
};

/**
 * Filter patients across all fields (name, patient #, file #, phone, national ID).
 */
export const filterPatients = (patients: Patient[], query: string): Patient[] => {
  if (!query || !query.trim()) return patients;
  const q = query.toLowerCase().trim();

  return patients.filter((p) => {
    const nameMatch = p.full_name ? p.full_name.toLowerCase().includes(q) : false;
    const numMatch = p.patient_number ? p.patient_number.toLowerCase().includes(q) : false;
    const fileMatch = p.file_number ? p.file_number.toLowerCase().includes(q) : false;
    const phoneMatch = p.phone ? p.phone.toLowerCase().includes(q) : false;
    const natIdMatch = p.national_id ? p.national_id.toLowerCase().includes(q) : false;
    return nameMatch || numMatch || fileMatch || phoneMatch || natIdMatch;
  });
};
