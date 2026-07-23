import React, { useRef, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Terminal, Trash2 } from 'lucide-react';

export default function LogsConsole() {
  const { logs, activeSessionId, setLogs } = useSessionStore();
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Filter logs for active session
  const filteredLogs = logs.filter((log) => log.sessionId === activeSessionId);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredLogs]);

  const clearBacklog = () => {
    setLogs(logs.filter((log) => log.sessionId !== activeSessionId));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Logger Console</h1>
          <p className="text-sm text-slate-400">Real-time telemetry and state tracking logs.</p>
        </div>
        <button
          onClick={clearBacklog}
          className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-500 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all"
        >
          <Trash2 className="w-4 h-4" /> Clear Terminal
        </button>
      </div>

      <div className="glass-panel rounded-2xl p-6 bg-black/60 border border-wa-green/20 font-mono text-xs md:text-sm h-[500px] flex flex-col justify-between">
        
        {/* Terminal logs screen */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-wa-green">
          {filteredLogs.map((log, idx) => (
            <div key={`log-${idx}`} className="flex gap-4 hover:bg-white/5 p-1 rounded transition-all">
              <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
              <span className={`font-bold ${
                log.level === 'error' ? 'text-red-500' :
                log.level === 'warn' ? 'text-amber-500' :
                'text-wa-green'
              }`}>
                {log.level.toUpperCase()}
              </span>
              <span className="text-slate-300 break-all">{log.message}</span>
            </div>
          ))}
          {filteredLogs.length === 0 && (
            <p className="text-slate-500 italic text-center py-12">Console ready. Awaiting socket logs...</p>
          )}
          <div ref={terminalEndRef} />
        </div>

        <div className="border-t border-wa-green/10 pt-4 mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Terminal className="w-3.5 h-3.5 text-wa-green" />
          <span>Active listening room: session_telemetry:{activeSessionId}</span>
        </div>
      </div>
    </div>
  );
}
