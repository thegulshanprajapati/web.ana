import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { CheckCircle, XCircle, AlertCircle, Clock, Check, X } from 'lucide-react';

interface JoinRequest {
  id: number;
  name?: string;
  jid: string;
  groupId: string;
  college?: string;
  branch?: string;
  semester?: string;
  status: string;
  requestTime: string;
}

export default function JoinRequests() {
  const { activeSessionId, sessions } = useSessionStore();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeSessionObj = sessions.find((s) => s.id === activeSessionId);
  const isConnected = activeSessionObj?.status === 'connected';

  useEffect(() => {
    if (isConnected) {
      fetchRequests();
    } else {
      setRequests([]);
    }
  }, [activeSessionId, isConnected]);

  const fetchRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/join-requests/${activeSessionId}`);
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests);
      } else {
        setError(data.error || 'Failed to fetch join requests.');
      }
    } catch (err) {
      setError('Internal server query failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/join-requests/${activeSessionId}/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (data.success) {
        fetchRequests();
      }
    } catch (err) {}
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-gradient-to-r from-wa-green/10 to-transparent">
        <h1 className="text-2xl font-bold tracking-tight">Participant Join Approvals</h1>
        <p className="text-sm text-slate-300 max-w-lg mt-2">
          Verify context credentials (College, Branch, Semester) and approve or reject participants.
        </p>
      </div>

      {!isConnected ? (
        <div className="flex items-center gap-3 p-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl">
          <AlertCircle className="w-6 h-6 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-sm">Session Disconnected</h3>
            <p className="text-xs mt-1">Please connect the active session on the Dashboard page to manage approvals.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="text-center text-slate-400 py-12">
          <div className="w-8 h-8 rounded-full border-4 border-wa-green/30 border-t-wa-green animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium">Loading approvals backlog...</p>
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-6 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl">
          <AlertCircle className="w-6 h-6 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : (
        <div className="glass-panel p-6 rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-wa-green/10 text-slate-400">
                  <th className="py-3 px-4 font-semibold">Requester</th>
                  <th className="py-3 px-4 font-semibold">Details</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-white/5 transition-all text-xs md:text-sm">
                    <td className="py-3.5 px-4 font-semibold text-slate-200">
                      <p>{req.name || 'Unknown'}</p>
                      <p className="text-xs font-normal text-slate-500 mt-0.5">@{req.jid.split('@')[0]}</p>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {req.college ? (
                        <p>{req.college} • {req.branch} • Sem {req.semester}</p>
                      ) : (
                        <p className="text-slate-500 italic">No college details provided</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-2xs font-bold uppercase border ${
                        req.status === 'Approved' ? 'bg-wa-green/10 text-wa-green border-wa-green/20' :
                        req.status === 'Pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                        'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {req.status === 'Pending' && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleAction(req.id, 'approve')}
                            className="bg-wa-green hover:bg-wa-green-dark text-black p-1.5 rounded-lg transition-all"
                            title="Approve"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleAction(req.id, 'reject')}
                            className="bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-red-500 p-1.5 rounded-lg transition-all"
                            title="Reject"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      No group join requests saved.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
