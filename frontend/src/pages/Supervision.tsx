import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Eye, Plus, Trash2, Clock, Play, UserCheck, Search, Info } from 'lucide-react';

interface SupervisionTarget {
  id: number;
  sessionId: string;
  jid: string;
  name: string;
  isActive: boolean;
}

interface SupervisionLog {
  id: number;
  targetJid: string;
  startedAt: string;
  endedAt: string | null;
  duration: number;
}

interface SupervisionStats {
  jid: string;
  name: string;
  isActive: boolean;
  totalDuration: number; // in seconds
  sessionsCount: number;
  lastSeen: string | null;
}

export default function Supervision() {
  const { activeSessionId } = useSessionStore();
  const [targets, setTargets] = useState<SupervisionTarget[]>([]);
  const [stats, setStats] = useState<SupervisionStats[]>([]);
  const [logs, setLogs] = useState<SupervisionLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [newJid, setNewJid] = useState('');
  const [newName, setNewName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000); // refresh statistics every 8 seconds
    return () => clearInterval(interval);
  }, [activeSessionId]);

  const fetchData = async () => {
    try {
      // Fetch targets
      const targetRes = await fetch('/api/supervision');
      const targetData = await targetRes.json();
      if (targetData.success) {
        setTargets(targetData.targets);
      }

      // Fetch stats & logs
      const statsRes = await fetch('/api/supervision/stats');
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats);
        setLogs(statsData.logs);
      }
    } catch (err) {
      console.error('Error fetching supervision data:', err);
    }
  };

  const handleAddTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJid.trim() || !newName.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/supervision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          jid: newJid.trim(),
          name: newName.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewJid('');
        setNewName('');
        fetchData();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert('Error adding supervision target.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTarget = async (id: number) => {
    if (!window.confirm('Are you sure you want to stop tracking this user?')) return;
    try {
      const res = await fetch(`/api/supervision/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      alert('Error deleting supervision target.');
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSec = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSec}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMin = minutes % 60;
    return `${hours}h ${remainingMin}m`;
  };

  const filteredStats = stats.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.jid.includes(searchQuery)
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-gradient-to-r from-emerald-950/20 to-transparent border-wa-green/20">
        <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <Eye className="w-7 h-7 text-wa-green animate-pulse" /> User Presence Supervision
        </h1>
        <p className="text-sm text-slate-300 max-w-xl mt-2">
          Monitor contact online activity. Track total hours active today, session counts, and precise duration timestamps in real-time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Supervision Setup Form */}
        <div className="glass-panel p-6 rounded-2xl border border-wa-green/20 space-y-4 h-fit">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Plus className="w-5 h-5 text-wa-green" /> Add Supervision Target
          </h2>
          <form onSubmit={handleAddTarget} className="space-y-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                WhatsApp Phone / JID (e.g. 919999999999)
              </label>
              <input
                type="text"
                placeholder="Number without '+' or '@s.whatsapp.net'"
                value={newJid}
                onChange={(e) => setNewJid(e.target.value)}
                className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2 text-xs text-slate-100 outline-none focus:border-wa-green"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Supervision Display Name
              </label>
              <input
                type="text"
                placeholder="e.g. Sales Manager, Client A"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2 text-xs text-slate-100 outline-none focus:border-wa-green"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !newJid.trim() || !newName.trim()}
              className="w-full bg-wa-green hover:bg-wa-green-dark disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" /> {loading ? 'Adding target...' : 'Start Supervision'}
            </button>
          </form>

          {/* Quick Target list */}
          <div className="pt-2 border-t border-wa-green/10">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Currently Supervised</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {targets.map((t) => (
                <div key={t.id} className="flex justify-between items-center p-2.5 bg-white/5 rounded-xl border border-white/10 text-xs">
                  <div>
                    <p className="font-bold text-slate-200">{t.name}</p>
                    <p className="text-[10px] text-slate-400">{t.jid}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteTarget(t.id)}
                    className="p-1 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {targets.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">No users supervised yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* supervision dashboards and statistics */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-wa-green/15 space-y-4">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-wa-green" /> Activity Reports Dashboard
              </h2>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search name or number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-bg-secondary border border-wa-green/10 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-100 outline-none focus:border-wa-green placeholder-slate-500 w-full md:w-56"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredStats.map((s) => {
                const isOnline = logs.some((l) => l.targetJid === s.jid && l.endedAt === null);
                return (
                  <div key={s.jid} className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-3 relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                          {s.name}
                          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-wa-green animate-ping' : 'bg-slate-600'}`} />
                        </h3>
                        <p className="text-xs text-slate-400">{s.jid}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isOnline ? 'bg-wa-green/20 text-wa-green' : 'bg-slate-700/50 text-slate-400'
                      }`}>
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="bg-bg-primary/50 p-2 rounded-lg border border-white/5">
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">Active Hours Today</p>
                        <p className="font-bold text-wa-green mt-0.5">{formatDuration(s.totalDuration)}</p>
                      </div>
                      <div className="bg-bg-primary/50 p-2 rounded-lg border border-white/5">
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">Sessions Logged</p>
                        <p className="font-bold text-purple-300 mt-0.5">{s.sessionsCount} times</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>Last Seen: {s.lastSeen ? new Date(s.lastSeen).toLocaleString() : 'Never'}</span>
                    </div>
                  </div>
                );
              })}
              {filteredStats.length === 0 && (
                <div className="col-span-2 text-center text-slate-500 py-12 text-xs">
                  No monitored targets matching search criteria.
                </div>
              )}
            </div>
          </div>

          {/* Detailed Activity Logs */}
          <div className="glass-panel p-6 rounded-2xl border border-wa-green/10 space-y-4">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Clock className="w-5 h-5 text-wa-green" /> Historical Log Audits
            </h2>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {logs.map((log) => {
                const targetName = targets.find((t) => t.jid === log.targetJid)?.name || log.targetJid;
                return (
                  <div key={log.id} className="bg-white/5 p-3 rounded-xl border border-white/10 text-xs flex justify-between items-center">
                    <div>
                      <p className="font-bold text-slate-200">{targetName}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(log.startedAt).toLocaleString()} -{' '}
                        {log.endedAt ? new Date(log.endedAt).toLocaleTimeString() : 'Active Now'}
                      </p>
                    </div>
                    <div className="text-right">
                      {log.endedAt ? (
                        <span className="bg-wa-green/10 text-wa-green border border-wa-green/20 px-2 py-0.5 rounded-lg font-semibold text-[10px]">
                          {formatDuration(log.duration)}
                        </span>
                      ) : (
                        <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-lg font-semibold text-[10px] animate-pulse">
                          Active Now
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {logs.length === 0 && (
                <div className="text-center text-slate-500 py-6 text-xs">
                  No active presence logs recorded today.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
