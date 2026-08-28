import { supabase } from '../lib/supabase';

/**
 * queryHelpers.ts
 * ───────────────
 * Centralised Supabase query utilities used across all pages.
 *
 *  • queryWithRetry   – wraps any Supabase query with 1 automatic retry
 *  • paginatedFetch   – server-side paginated fetch with count
 *  • safeErrorMessage – extracts a human-readable string from any error shape
 */

// ─── Safe error message extraction ───────────────────────────────────────────
export function safeErrorMessage(err: unknown): string {
  if (!err) return 'An unknown error occurred.';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, any>;
    return obj.message || obj.error_description || obj.msg || JSON.stringify(err);
  }
  return String(err);
}

// ─── Retry wrapper ───────────────────────────────────────────────────────────
/**
 * Executes a Supabase query function and retries once on failure.
 * Prevents a single network blip from crashing an entire page.
 *
 * Usage:
 *   const { data, error, count } = await queryWithRetry(() =>
 *     supabase.from('patients').select('*', { count: 'exact' }).range(0, 24)
 *   );
 */
export async function queryWithRetry<T>(
  queryFn: () => PromiseLike<{ data: T; error: any; count?: number | null }>,
  retries = 1,
  delayMs = 1000
): Promise<{ data: T; error: any; count?: number | null }> {
  let lastResult: { data: T; error: any; count?: number | null };

  for (let attempt = 0; attempt <= retries; attempt++) {
    lastResult = await queryFn();
    if (!lastResult.error) return lastResult;

    // Don't retry on auth / permission errors — those won't self-heal
    const code = lastResult.error?.code;
    if (code === '42501' || code === 'PGRST301' || code === '401') {
      return lastResult;
    }

    if (attempt < retries) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return lastResult!;
}

// ─── Server-side paginated fetch ─────────────────────────────────────────────
export interface PaginatedResult<T> {
  data: T[];
  count: number;
  error: string | null;
}

/**
 * Convenience wrapper for server-side paginated Supabase queries.
 * Returns typed data, total count, and a safe error string.
 *
 * Usage:
 *   const result = await paginatedFetch<Payment>(() => {
 *     let q = supabase.from('payments').select('id, amount, ...', { count: 'exact' });
 *     q = q.order('payment_date', { ascending: false });
 *     return q;
 *   }, page, pageSize);
 */
export async function paginatedFetch<T>(
  buildQuery: () => any, // SupabaseFilterBuilder — typed as any for flexibility
  page: number,
  pageSize: number
): Promise<PaginatedResult<T>> {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const query = buildQuery().range(from, to);
    const { data, error, count } = await queryWithRetry(() => query);

    if (error) {
      return { data: [], count: 0, error: safeErrorMessage(error) };
    }

    return {
      data: (data || []) as T[],
      count: count ?? 0,
      error: null,
    };
  } catch (err) {
    return { data: [], count: 0, error: safeErrorMessage(err) };
  }
}

// ─── Module-level cache helper ───────────────────────────────────────────────
/**
 * Creates a simple module-level cache with TTL.
 * Survives React navigation but is cleared after `ttlMs` milliseconds.
 */
export function createCache<T>(ttlMs = 5 * 60 * 1000) {
  let _data: T | null = null;
  let _ts = 0;
  let _key = '';

  return {
    get(key: string): T | null {
      if (_data !== null && _key === key && Date.now() - _ts < ttlMs) return _data;
      return null;
    },
    set(key: string, data: T) {
      _data = data;
      _key = key;
      _ts = Date.now();
    },
    invalidate() {
      _data = null;
      _ts = 0;
    },
  };
}
