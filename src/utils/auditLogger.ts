import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Log a user activity to the audit_logs table.
 * 
 * @param supabase - The Supabase client instance
 * @param params - The logging parameters
 */
export async function logActivity(
  supabase: SupabaseClient,
  params: {
    userId: string;
    branchId: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'LOGIN' | 'LOGOUT' | 'ADJUSTMENT' | 'PROCESS';
    tableName: string;
    recordId?: string;
    details: string;
    oldValues?: any;
    newValues?: any;
  }
) {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: params.userId,
      branch_id: params.branchId,
      action: params.action,
      table_name: params.tableName,
      record_id: params.recordId,
      details: params.details,
      old_values: params.oldValues,
      new_values: params.newValues,
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error('Audit Log Insertion Failed:', error.message);
    }
  } catch (err) {
    console.error('Audit Log System Error:', err);
  }
}
