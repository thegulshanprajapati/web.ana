import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Users, Info, Shield, MessageSquare, AlertCircle } from 'lucide-react';

interface GroupInfo {
  id: string;
  subject: string;
  desc: string;
  size: number;
  participants: any[];
  admins: string[];
}

export default function Groups() {
  const { activeSessionId, sessions } = useSessionStore();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeSessionObj = sessions.find((s) => s.id === activeSessionId);
  const isConnected = activeSessionObj?.status === 'connected';

  useEffect(() => {
    if (isConnected) {
      fetchGroups();
    } else {
      setGroups([]);
    }
  }, [activeSessionId, isConnected]);

  const fetchGroups = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/groups/${activeSessionId}`);
      const data = await res.json();
      if (data.success) {
        setGroups(data.groups);
      } else {
        setError(data.error || 'Failed to fetch groups.');
      }
    } catch (err) {
      setError('Internal server query failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-gradient-to-r from-wa-green/10 to-transparent">
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp Groups</h1>
        <p className="text-sm text-slate-300 max-w-lg mt-2">
          Monitor group details, size, administrative status, and descriptions.
        </p>
      </div>

      {!isConnected ? (
        <div className="flex items-center gap-3 p-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl">
          <AlertCircle className="w-6 h-6 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-sm">Session Disconnected</h3>
            <p className="text-xs mt-1">Please connect the active session on the Dashboard page to view group records.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="text-center text-slate-400 py-12">
          <div className="w-8 h-8 rounded-full border-4 border-wa-green/30 border-t-wa-green animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium">Fetching groups participating list...</p>
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-6 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl">
          <AlertCircle className="w-6 h-6 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map((group) => (
            <div key={group.id} className="glass-panel p-6 rounded-2xl space-y-4 flex flex-col justify-between hover:border-wa-green/35 transition-all">
              <div className="space-y-2">
                <div className="flex justify-between items-start gap-4">
                  <h3 className="font-bold text-lg text-slate-100 line-clamp-1">{group.subject}</h3>
                  <span className="bg-wa-green/15 text-wa-green text-xs font-semibold px-2 py-0.5 rounded-full border border-wa-green/20">
                    {group.size} Members
                  </span>
                </div>
                <p className="text-xs text-slate-500">JID: {group.id}</p>
                <p className="text-xs text-slate-400 line-clamp-2 italic">
                  {group.desc || 'No group description provided.'}
                </p>
              </div>

              <div className="border-t border-white/5 pt-3 flex justify-between items-center text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-wa-green" /> Admins Count: {group.admins.length}
                </span>
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="col-span-full text-center text-slate-500 py-12">
              No WhatsApp groups found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
