import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Trash2, AlertCircle, ShieldAlert, Image as ImageIcon, Calendar, User, Search, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface DeletedMessage {
  id: number;
  sessionId: string;
  messageId: string;
  senderJid: string;
  senderName: string | null;
  text: string | null;
  mediaType: string | null;
  cloudinaryUrl: string | null;
  deletedAt: string;
}

export default function DeletedMessages() {
  const { activeSessionId } = useSessionStore();
  const [messages, setMessages] = useState<DeletedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchDeletedMessages();
  }, [activeSessionId]);

  const fetchDeletedMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/deleted-messages');
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Error fetching deleted messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearLogs = async () => {
    const confirmClear = window.confirm(
      'WARNING: This will permanently delete all logged deleted messages from SQLite AND completely wipe their recovered images from Cloudinary storage. Proceed?'
    );
    if (!confirmClear) return;

    setLoading(true);
    try {
      const res = await fetch('/api/deleted-messages', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessages([]);
        alert('All logs and Cloudinary assets successfully purged.');
      } else {
        alert(`Error clearing logs: ${data.error}`);
      }
    } catch (err) {
      alert('Error clearing deleted messages logs.');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserExpand = (userJid: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userJid)) {
      newExpanded.delete(userJid);
    } else {
      newExpanded.add(userJid);
    }
    setExpandedUsers(newExpanded);
  };

  // Group messages by user
  const messagesByUser = messages.reduce((acc: Record<string, DeletedMessage[]>, msg) => {
    const key = msg.senderJid;
    if (!acc[key]) acc[key] = [];
    acc[key].push(msg);
    return acc;
  }, {});

  // Filter users based on search
  const filteredUsers = Object.entries(messagesByUser).filter(([jid, msgs]) => {
    const firstMsg = msgs[0];
    return (
      (firstMsg.senderName && firstMsg.senderName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      jid.includes(searchQuery) ||
      msgs.some(msg => msg.text && msg.text.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-gradient-to-r from-red-950/20 to-transparent border-red-500/20">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-7 h-7 text-red-400" /> Revoked Messages Logger
            </h1>
            <p className="text-sm text-slate-300 max-w-xl mt-2">
              Intercept and log messages deleted by other users. Decrypts and backs up image media payloads directly to Cloudinary.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchDeletedMessages}
              disabled={loading}
              className="p-3 bg-bg-secondary hover:bg-white/5 border border-wa-green/10 text-slate-300 rounded-xl transition-all"
              title="Refresh Logs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleClearLogs}
              disabled={loading || messages.length === 0}
              className="bg-red-500/20 hover:bg-red-500 border border-red-500/30 hover:border-red-500 disabled:opacity-50 text-red-300 hover:text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Purge Anti-Delete logs
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-wa-green/15 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" /> Intercept Logs List
          </h2>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-bg-secondary border border-wa-green/10 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-100 outline-none focus:border-wa-green placeholder-slate-500 w-64"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredUsers.map(([userJid, msgs]) => {
            const firstMsg = msgs[0];
            const isExpanded = expandedUsers.has(userJid);
            const sortedMsgs = [...msgs].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
            
            return (
              <div key={userJid} className="border border-wa-green/15 rounded-xl overflow-hidden">
                {/* User Header - Clickable */}
                <button
                  onClick={() => toggleUserExpand(userJid)}
                  className="w-full bg-wa-green/10 hover:bg-wa-green/20 p-4 flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-3 text-left">
                    <User className="w-5 h-5 text-wa-green flex-shrink-0" />
                    <div>
                      <p className="font-bold text-slate-200 text-sm">
                        {firstMsg.senderName || userJid}
                      </p>
                      <p className="text-xs text-slate-400">{msgs.length} deleted message{msgs.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-wa-green bg-wa-green/20 px-2 py-1 rounded-full">
                      Recently deleted
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-wa-green" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Messages List */}
                {isExpanded && (
                  <div className="bg-bg-primary/30 p-4 space-y-3 max-h-96 overflow-y-auto">
                    {sortedMsgs.map((msg) => (
                      <div key={msg.id} className="bg-white/5 p-3 rounded-lg border border-white/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <Calendar className="w-3.5 h-3.5" />
                            <span className="font-semibold">{new Date(msg.deletedAt).toLocaleString()}</span>
                          </div>
                          {msg.mediaType && (
                            <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
                              {msg.mediaType.toUpperCase()}
                            </span>
                          )}
                        </div>

                        {msg.text && (
                          <div className="p-2 bg-bg-primary/50 rounded border border-white/5 text-xs text-slate-300 line-clamp-3">
                            {msg.text}
                          </div>
                        )}

                        {msg.mediaType === 'image' && msg.cloudinaryUrl && (
                          <div className="flex items-center gap-2">
                            <a
                              href={msg.cloudinaryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group relative rounded-lg overflow-hidden border border-white/10 w-24 h-24 bg-black/40 hover:border-wa-green/45 transition-all"
                            >
                              <img
                                src={msg.cloudinaryUrl}
                                alt="Deleted media"
                                className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                              />
                            </a>
                            <span className="text-[9px] text-slate-400">Recovered from Cloudinary</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <div className="text-center text-slate-500 py-16 text-xs space-y-2">
              <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto" />
              <p>No deleted messages logged under search filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
