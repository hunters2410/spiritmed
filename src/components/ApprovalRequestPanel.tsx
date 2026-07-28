import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Check, X, FileEdit, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { approvalService, EditApprovalRequest } from '../utils/approvalService';
import { useAuth } from '../contexts/AuthContext';

function formatRelativeTime(date: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return 'just now';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function formatCountdown(expiresAt: string): string {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ApprovalRequestPanel() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<EditApprovalRequest[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // used to re-render countdowns

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  // Load initial pending requests
  const loadRequests = useCallback(async () => {
    if (!profile?.branch_id || !isAdmin) return;
    const pending = await approvalService.getPendingRequests(profile.branch_id);
    setRequests(pending);
  }, [profile?.branch_id, isAdmin]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Countdown ticker
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Remove expired requests from the list
  useEffect(() => {
    setRequests(prev =>
      prev.filter(r => new Date(r.expires_at).getTime() > Date.now())
    );
  }, [tick]);

  // Realtime subscription
  useEffect(() => {
    if (!profile?.branch_id || !isAdmin) return;

    const unsub = approvalService.subscribeToBranchRequests(
      profile.branch_id,
      // onInsert — add to list
      (newRequest) => {
        setRequests(prev => {
          if (prev.some(r => r.id === newRequest.id)) return prev;
          return [newRequest, ...prev];
        });
      },
      // onUpdate — remove from list if no longer pending
      (updatedRequest) => {
        if (updatedRequest.status !== 'pending') {
          setRequests(prev => prev.filter(r => r.id !== updatedRequest.id));
        }
      }
    );

    return unsub;
  }, [profile?.branch_id, isAdmin]);

  const handleApprove = async (request: EditApprovalRequest) => {
    if (!profile) return;
    setProcessingId(request.id);
    await approvalService.approveRequest(request.id, profile.id, profile.full_name);
    setRequests(prev => prev.filter(r => r.id !== request.id));
    setProcessingId(null);
  };

  const handleDeny = async (request: EditApprovalRequest) => {
    if (!profile) return;
    setProcessingId(request.id);
    await approvalService.denyRequest(request.id, profile.id, profile.full_name);
    setRequests(prev => prev.filter(r => r.id !== request.id));
    setProcessingId(null);
  };

  // Only render for admins with pending requests
  if (!isAdmin || requests.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[150] w-full max-w-sm">
      {/* Header toggle */}
      <button
        onClick={() => setIsExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-amber-500 text-white rounded-xl shadow-2xl shadow-amber-500/40 hover:bg-amber-600 transition"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 animate-pulse" />
          <span className="text-sm font-black uppercase tracking-wide">
            Edit Approval Requests
          </span>
          <span className="bg-white text-amber-600 rounded-full text-xs font-black w-5 h-5 flex items-center justify-center">
            {requests.length}
          </span>
        </div>
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {/* Requests list */}
      {isExpanded && (
        <div className="mt-2 space-y-2 max-h-[70vh] overflow-y-auto">
          {requests.map(request => {
            const isProcessing = processingId === request.id;
            const countdown = formatCountdown(request.expires_at);
            const isAlmostExpired = new Date(request.expires_at).getTime() - Date.now() < 60000;

            return (
              <div
                key={request.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-amber-100 dark:border-amber-900/30 overflow-hidden"
              >
                {/* Request header */}
                <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileEdit className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                        {request.record_type === 'payment' ? 'Payment Edit' : 'Invoice Edit'}
                      </span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-black font-mono ${
                      isAlmostExpired ? 'text-rose-600' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      <Clock className="w-3 h-3" />
                      {countdown}
                    </div>
                  </div>
                </div>

                {/* Request body */}
                <div className="px-4 py-3 space-y-2">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Requested by</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{request.requestor_name}</p>
                    <p className="text-[10px] text-gray-400">{formatRelativeTime(request.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Record</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{request.record_context}</p>
                  </div>
                  {request.reason && (
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase mb-0.5">Reason</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 italic">"{request.reason}"</p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="px-4 pb-3 flex gap-2">
                  <button
                    onClick={() => handleDeny(request)}
                    disabled={isProcessing}
                    className="flex-1 py-2 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-black hover:bg-rose-50 dark:hover:bg-rose-900/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Deny
                  </button>
                  <button
                    onClick={() => handleApprove(request)}
                    disabled={isProcessing}
                    className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black hover:bg-emerald-700 transition flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-md shadow-emerald-500/30"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
