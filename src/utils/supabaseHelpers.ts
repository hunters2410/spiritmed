/**
 * supabaseHelpers.ts
 * ==================
 * Helper utilities for bypassing Supabase PostgREST default 1,000-row limits.
 */

export async function fetchAllPages<T = any>(
  fetchPageFn: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize: number = 1000
): Promise<T[]> {
  let allRecords: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await fetchPageFn(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRecords = allRecords.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRecords;
}
