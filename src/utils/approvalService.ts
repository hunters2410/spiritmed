import { supabase } from '../lib/supabase';
import { notificationService } from './notificationService';
import { emailService } from './emailService';

export interface EditApprovalRequest {
  id: string;
  branch_id: string;
  requestor_id: string;
  requestor_name: string;
  record_type: 'payment' | 'bill';
  record_id: string;
  record_context: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  expires_at: string;
  created_at: string;
}

export const approvalService = {
  /**
   * Creates a new pending approval request and notifies all branch admins.
   */
  async requestApproval({
    branchId,
    requestorId,
    requestorName,
    recordType,
    recordId,
    recordContext,
    reason,
  }: {
    branchId: string;
    requestorId: string;
    requestorName: string;
    recordType: 'payment' | 'bill';
    recordId: string;
    recordContext: string;
    reason: string;
  }): Promise<EditApprovalRequest | null> {
    try {
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('edit_approval_requests')
        .insert([{
          branch_id: branchId,
          requestor_id: requestorId,
          requestor_name: requestorName,
          record_type: recordType,
          record_id: recordId,
          record_context: recordContext,
          reason,
          status: 'pending',
          expires_at: expiresAt,
        }])
        .select()
        .single();

      if (error) throw error;

      // --- In-app notification to all admins ---
      await notificationService.notifyAdmins(
        branchId,
        `Edit Approval Required — ${recordType === 'payment' ? 'Payment' : 'Invoice'}`,
        `${requestorName} is requesting permission to edit ${recordContext}.\n\nReason: "${reason}"\n\nThis request expires in 5 minutes.`,
        'warning'
      );

      // --- Email notification to all admins ---
      const { data: admins } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('branch_id', branchId)
        .in('role', ['admin', 'super_admin'])
        .not('email', 'is', null);

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          if (!admin.email) continue;
          await emailService.sendEmail({
            recipientEmail: admin.email,
            recipientName: admin.full_name,
            subject: `[Action Required] Edit Approval Request from ${requestorName}`,
            body: `Dear ${admin.full_name},\n\n${requestorName} is requesting permission to edit the following record:\n\n  • Type: ${recordType === 'payment' ? 'Payment' : 'Invoice/Bill'}\n  • Record: ${recordContext}\n  • Reason: "${reason}"\n\nPlease log in to the system to approve or deny this request within 5 minutes.\n\nThis is an automated message from Spiritmed.`,
            branchId,
            referenceId: data.id,
            referenceType: 'edit_approval_request',
          }).catch(console.warn); // Non-blocking
        }
      }

      return data as EditApprovalRequest;
    } catch (error) {
      console.error('approvalService.requestApproval error:', error);
      return null;
    }
  },

  /**
   * Admin approves a pending request.
   */
  async approveRequest(requestId: string, adminId: string, adminName: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('edit_approval_requests')
        .update({
          status: 'approved',
          reviewed_by: adminId,
          reviewer_name: adminName,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('approvalService.approveRequest error:', error);
      return false;
    }
  },

  /**
   * Admin denies a pending request.
   */
  async denyRequest(requestId: string, adminId: string, adminName: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('edit_approval_requests')
        .update({
          status: 'denied',
          reviewed_by: adminId,
          reviewer_name: adminName,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('approvalService.denyRequest error:', error);
      return false;
    }
  },

  /**
   * Accountant cancels their own pending request.
   */
  async cancelRequest(requestId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('edit_approval_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('approvalService.cancelRequest error:', error);
      return false;
    }
  },

  /**
   * Subscribe to a specific request for real-time status changes.
   * Returns the unsubscribe function.
   */
  subscribeToRequest(
    requestId: string,
    onUpdate: (request: EditApprovalRequest) => void
  ): () => void {
    const channel = supabase
      .channel(`approval_request_${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'edit_approval_requests',
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          onUpdate(payload.new as EditApprovalRequest);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  /**
   * Subscribe to all pending requests for the branch (for the admin panel).
   * Returns the unsubscribe function.
   */
  subscribeToBranchRequests(
    branchId: string,
    onInsert: (request: EditApprovalRequest) => void,
    onUpdate: (request: EditApprovalRequest) => void
  ): () => void {
    const channel = supabase
      .channel(`branch_approvals_${branchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'edit_approval_requests',
          filter: `branch_id=eq.${branchId}`,
        },
        (payload) => onInsert(payload.new as EditApprovalRequest)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'edit_approval_requests',
          filter: `branch_id=eq.${branchId}`,
        },
        (payload) => onUpdate(payload.new as EditApprovalRequest)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  /**
   * Load all currently pending requests for the branch (for the admin panel initial load).
   */
  async getPendingRequests(branchId: string): Promise<EditApprovalRequest[]> {
    const { data, error } = await supabase
      .from('edit_approval_requests')
      .select('*')
      .eq('branch_id', branchId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('approvalService.getPendingRequests error:', error);
      return [];
    }
    return (data || []) as EditApprovalRequest[];
  },
};
