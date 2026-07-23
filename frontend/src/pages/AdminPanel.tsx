import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { AlertTriangle, Trash2, ShieldAlert, CheckCircle2, Camera, ShieldCheck, Database, MessageSquare } from 'lucide-react';

interface AiChatLog {
  id: number;
  sessionId: string;
  senderJid: string;
  prompt: string;
  aiResponse: string;
  tokensUsed: number;
  createdAt: string;
}

export default function AdminPanel() {
  const { activeSessionId, setSessions, updateSessionStatus } = useSessionStore();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Profile settings update state
  const [profileName, setProfileName] = useState('');
  const [profileAbout, setProfileAbout] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // Cloudinary credentials config state
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState('');
  const [cloudinaryApiKey, setCloudinaryApiKey] = useState('');
  const [cloudinaryApiSecret, setCloudinaryApiSecret] = useState('');
  const [cloudinaryLoading, setCloudinaryLoading] = useState(false);

  // Security AI limit state
  const [dailyLimit, setDailyLimit] = useState(500);
  const [aiStats, setAiStats] = useState({ todayCount: 0, totalCount: 0 });
  const [aiLogs, setAiLogs] = useState<AiChatLog[]>([]);

  useEffect(() => {
    fetchAiStatsAndLogs();
    fetchAiConfig();
    fetchCloudinaryConfig();
  }, []);

  const fetchAiConfig = async () => {
    try {
      const res = await fetch('/api/ai-config');
      const data = await res.json();
      if (data.success && data.config) {
        setDailyLimit(data.config.dailyLimit || 500);
      }
    } catch (err) {}
  };

  const fetchAiStatsAndLogs = async () => {
    try {
      const res = await fetch('/api/ai-logs');
      const data = await res.json();
      if (data.success) {
        setAiLogs(data.logs);
        setAiStats(data.stats);
      }
    } catch (err) {}
  };

  const fetchCloudinaryConfig = async () => {
    try {
      const res = await fetch('/api/cloudinary-config');
      const data = await res.json();
      if (data.success && data.config) {
        setCloudinaryCloudName(data.config.cloudName || '');
        setCloudinaryApiKey(data.config.apiKey || '');
        setCloudinaryApiSecret(data.config.apiSecret || '');
      }
    } catch (err) {}
  };

  const saveCloudinaryConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloudinaryLoading(true);
    setSuccessMsg('');
    try {
      const res = await fetch('/api/cloudinary-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cloudName: cloudinaryCloudName,
          apiKey: cloudinaryApiKey,
          apiSecret: cloudinaryApiSecret
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Cloudinary credentials saved successfully!');
      } else {
        alert('Failed to save Cloudinary configuration');
      }
    } catch (err) {
      alert('Error saving Cloudinary config');
    } finally {
      setCloudinaryLoading(false);
    }
  };

  const saveProfileSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/sessions/${activeSessionId}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName || undefined,
          about: profileAbout || undefined,
          photo: profilePhoto || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Profile updated successfully for session: ${activeSessionId}`);
        setProfilePhoto('');
      } else {
        alert(`Failed to update profile: ${data.error}`);
      }
    } catch (err: any) {
      alert('Error updating profile settings');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveSecurityLimit = async () => {
    try {
      const configRes = await fetch('/api/ai-config');
      const configData = await configRes.json();
      const currentConfig = configData.config || {};

      await fetch('/api/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentConfig,
          dailyLimit
        })
      });
      setSuccessMsg(`AI Security Daily Limit updated to ${dailyLimit} requests/day!`);
    } catch (err) {}
  };

  const cleanAll = async () => {
    const doubleConfirm = window.confirm(
      'CRITICAL ACTION: Are you sure you want to clean ALL sessions? This will wipe the credentials folder completely and restart the default bot fresh.'
    );
    if (!doubleConfirm) return;

    setLoading(true);
    setSuccessMsg('');
    try {
      const res = await fetch('/api/sessions/clean', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSessions([{ id: 'default', status: 'connecting' }]);
        updateSessionStatus('default', 'connecting');
        setSuccessMsg('All active session credentials and temporary directory cache cleared successfully!');
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-gradient-to-r from-purple-900/20 via-emerald-950/10 to-transparent border-purple-500/20">
        <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <ShieldAlert className="w-7 h-7 text-purple-400" /> Admin Controls & Security Hub
        </h1>
        <p className="text-sm text-slate-300 max-w-xl mt-2">
          Manage Profile Picture (DP), LLM security request limits, AI chat logs database, and system sessions.
        </p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-wa-green/10 border border-wa-green/20 text-wa-green rounded-xl text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p>{successMsg}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* WhatsApp Profile Settings Manager */}
        <div className="glass-panel p-6 rounded-2xl space-y-4 border border-wa-green/20">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Camera className="w-5 h-5 text-wa-green" /> Profile Settings Manager
          </h2>
          <p className="text-xs text-slate-400">
            Update Name, Status/About, and Profile Picture directly on WhatsApp for session <code className="text-wa-green">{activeSessionId}</code>.
          </p>
          <form onSubmit={saveProfileSettings} className="space-y-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">WhatsApp Name</label>
              <input
                type="text"
                placeholder="Enter profile name..."
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2 text-xs text-slate-100 outline-none focus:border-wa-green"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Status / About Info</label>
              <input
                type="text"
                placeholder="Enter bio status/about..."
                value={profileAbout}
                onChange={(e) => setProfileAbout(e.target.value)}
                className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2 text-xs text-slate-100 outline-none focus:border-wa-green"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Profile Photo (Local File)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-wa-green/20 file:text-wa-green hover:file:bg-wa-green/30"
              />
            </div>
            <button
              type="submit"
              disabled={profileLoading}
              className="w-full bg-wa-green hover:bg-wa-green-dark disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> {profileLoading ? 'Updating Profile...' : 'Save Profile Settings'}
            </button>
          </form>
        </div>

        {/* AI Security Limits */}
        <div className="glass-panel p-6 rounded-2xl space-y-4 border border-purple-500/20">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-400" /> LLM AI Security & Rate Limits
          </h2>
          <p className="text-xs text-slate-400">
            Set maximum allowed AI chat messages per day to prevent spam or token abuse.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10 text-xs">
              <span className="text-slate-300">Today's Usage:</span>
              <span className="font-bold text-purple-300">{aiStats.todayCount} / {dailyLimit} reqs</span>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Max AI Requests Per Day</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(parseInt(e.target.value) || 0)}
                  className="flex-1 bg-bg-secondary border border-purple-500/30 rounded-xl px-4 py-2 text-xs text-slate-100 outline-none"
                />
                <button
                  type="button"
                  onClick={saveSecurityLimit}
                  className="px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-all"
                >
                  Save Limit
                </button>
              </div>
            </div>
          </div>
      </div>
      </div>

      {/* Cloudinary Integration Settings */}
      <div className="glass-panel p-6 rounded-2xl space-y-4 border border-wa-green/15">
        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
          <Database className="w-5 h-5 text-wa-green" /> Cloudinary Media Storage Integration
        </h2>
        <p className="text-xs text-slate-400">
          Configure Cloudinary credentials to secure and host media files recovered from deleted/revoked WhatsApp messages.
        </p>
        <form onSubmit={saveCloudinaryConfig} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Cloud Name</label>
            <input
              type="text"
              placeholder="Cloud Name"
              value={cloudinaryCloudName}
              onChange={(e) => setCloudinaryCloudName(e.target.value)}
              className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2 text-xs text-slate-100 outline-none focus:border-wa-green"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">API Key</label>
            <input
              type="text"
              placeholder="API Key"
              value={cloudinaryApiKey}
              onChange={(e) => setCloudinaryApiKey(e.target.value)}
              className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2 text-xs text-slate-100 outline-none focus:border-wa-green"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">API Secret</label>
            <input
              type="password"
              placeholder="API Secret"
              value={cloudinaryApiSecret}
              onChange={(e) => setCloudinaryApiSecret(e.target.value)}
              className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2 text-xs text-slate-100 outline-none focus:border-wa-green"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={cloudinaryLoading}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2"
            >
              {cloudinaryLoading ? 'Saving Credentials...' : 'Save Cloudinary Credentials'}
            </button>
          </div>
        </form>
      </div>

      {/* AI Chat Logs DB Table */}
      <div className="glass-panel p-6 rounded-2xl space-y-4 border border-wa-green/10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Database className="w-5 h-5 text-wa-green" /> LLM AI Chat History DB Logs
          </h2>
          <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full font-semibold">
            Total {aiStats.totalCount} AI Messages Recorded
          </span>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
          {aiLogs.map((log) => (
            <div key={log.id} className="bg-white/5 p-3 rounded-xl border border-white/10 text-xs space-y-1">
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span className="font-bold text-wa-green">{log.senderJid}</span>
                <span>{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-slate-300"><strong>User:</strong> {log.prompt}</p>
              <p className="text-purple-300"><strong>AI:</strong> {log.aiResponse}</p>
            </div>
          ))}
          {aiLogs.length === 0 && (
            <div className="text-center text-slate-500 py-6 text-xs">
              No AI chat logs recorded in SQLite database yet.
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="glass-panel p-6 rounded-2xl border-red-500/20 space-y-4">
        <h2 className="text-lg font-bold text-slate-200">Force Purge Credentials Storage</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Wiping sessions will drop every active WhatsApp connection, clear authorization tokens under the 
          <code>sessions/</code> directory, and clean active database status logs.
        </p>
        <div className="pt-2">
          <button
            onClick={cleanAll}
            disabled={loading}
            className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-red-500/25 flex items-center gap-2 text-xs"
          >
            <Trash2 className="w-4 h-4" /> {loading ? 'Cleaning credentials...' : 'Clean All Sessions'}
          </button>
        </div>
      </div>
    </div>
  );
}
