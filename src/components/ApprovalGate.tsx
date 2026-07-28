import { useState, useEffect, useRef } from 'react';
import { Clock, Send, X, Loader2, FileEdit, AlertCircle } from 'lucide-react';
import { approvalService, EditApprovalRequest } from '../utils/approvalService';

interface ApprovalGateProps {
  /** The pending request returned from approvalService.requestApproval() */
  request: EditApprovalRequest;
  /** Called when the admin approves — opens the edit modal */
  onApproved: () => void;
  /** Called when the admin denies or the request expires */
  onDenied: (reason?: string) => void;
  /** Called when the accountant cancels the request themselves */
  onCancelled: () => void;
}

function formatCountdown(expiresAt: string): string {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ApprovalGate({ request, onApproved, onDenied, onCancelled }: ApprovalGateProps) {
  const [countdown, setCountdown] = useState(() => formatCountdown(request.expires_at));
  const [isCancelling, setIsCancelling] = useState(false);
  const [status, setStatus] = useState<EditApprovalRequest['status']>('pending');
  const [reviewerName, setReviewerName] = useState<string | null>(null);
  const unsubRef = useRef<() => void>();

  // Subscribe to real-time status updates
  useEffect(() => {
    unsubRef.current = approvalService.subscribeToRequest(request.id, (updated) => {
      setStatus(updated.status);
      setReviewerName(updated.reviewer_name);

      if (updated.status === 'approved') {
        setTimeout(() => onApproved(), 800); // Brief delay so the user sees the "Approved" state
      } else if (updated.status === 'denied') {
        setTimeout(() => onDenied(`Denied by ${updated.reviewer_name || 'admin'}`), 1200);
      }
    });

    return () => unsubRef.current?.();
  }, [request.id]);

  // Countdown timer + auto-expiry
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = new Date(request.expires_at).getTime() - Date.now();
      if (remaining <= 0) {
        clearInterval(interval);
        setCountdown('0:00');
        if (status === 'pending') {
          setStatus('expired');
          setTimeout(() => onDenied('Request expired — no admin responded in time.'), 1500);
        }
      } else {
        setCountdown(formatCountdown(request.expires_at));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request.expires_at, status]);

  const handleCancel = async () => {
    setIsCancelling(true);
    await approvalService.cancelRequest(request.id);
    onCancelled();
  };

  const isExpired = status === 'expired' || new Date(request.expires_at).getTime() < Date.now();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className={`px-6 py-5 ${
          status === 'approved' ? 'bg-emerald-500' :
          status === 'denied' || status === 'expired' ? 'bg-rose-500' :
          'bg-amber-500'
        } text-white`}>
          <div className="flex items-center gap-3">
            {status === 'approved' ? (
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <FileEdit className="w-5 h-5" />
              </div>
            ) : status === 'denied' || status === 'expired' ? (
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-black uppercase tracking-wide">
                {status === 'approved' ? 'Request Approved!' :
                 status === 'denied' ? 'Request Denied' :
                 status === 'expired' ? 'Request Expired' :
                 'Waiting for Approval'}
              </h2>
              <p className="text-white/80 text-xs font-medium">
                {status === 'approved' ? `Approved by ${reviewerName}. Opening editor…` :
                 status === 'denied' ? `Denied by ${reviewerName}.` :
                 status === 'expired' ? 'No admin responded in time.' :
                 'Your request has been sent to the admin.'}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Request details */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-gray-400 font-bold uppercase text-[10px] w-20 pt-0.5 flex-shrink-0">Record</span>
              <span className="text-gray-800 dark:text-gray-200 font-semibold">{request.record_context}</span>
            </div>
            {request.reason && (
              <div className="flex items-start gap-2">
                <span className="text-gray-400 font-bold uppercase text-[10px] w-20 pt-0.5 flex-shrink-0">Reason</span>
                <span className="text-gray-700 dark:text-gray-300 italic">"{request.reason}"</span>
              </div>
            )}
          </div>

          {/* Countdown (only while pending) */}
          {status === 'pending' && (
            <div className="flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-bold">Expires in</span>
              </div>
              <span className={`font-black text-xl font-mono tabular-nums ${
                isExpired ? 'text-rose-600' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {countdown}
              </span>
            </div>
          )}

          {/* Info note */}
          {status === 'pending' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              An admin has been notified via system notification and email.
              <br />They must approve within 5 minutes.
            </p>
          )}
        </div>

        {/* Footer */}
        {status === 'pending' && (
          <div className="px-6 pb-5">
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="w-full py-2.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              {isCancelling ? 'Cancelling…' : 'Cancel Request'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: The "Request Edit" modal with reason input
// ─────────────────────────────────────────────────────────────────────────────

interface RequestEditModalProps {
  recordType: 'payment' | 'bill';
  recordContext: string;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function RequestEditModal({
  recordType,
  recordContext,
  onSubmit,
  onCancel,
  isSubmitting,
}: RequestEditModalProps) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <FileEdit className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wide">Request Edit Permission</h2>
              <p className="text-white/80 text-xs">Admin approval is required to edit this {recordType}.</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Record context */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-medium">
            {recordContext}
          </div>

          {/* Reason input */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              Reason for Editing <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong amount captured, incorrect payment method, patient correction request…"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none min-h-[100px]"
              autoFocus
            />
            <p className="text-[10px] text-gray-400 mt-1">{reason.length}/300 characters</p>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Your request and reason will be sent to all branch admins via system notification and email.
          </p>
        </div>

        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(reason.trim())}
            disabled={isSubmitting || reason.trim().length < 5}
            className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-black hover:bg-amber-600 transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-amber-500/30"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
            ) : (
              <><Send className="w-4 h-4" /> Send Request</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
