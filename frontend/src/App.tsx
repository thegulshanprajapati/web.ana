import React, { useEffect, useState } from 'react';
import { useSessionStore } from './store/sessionStore';
import io from 'socket.io-client';
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Users,
  CheckSquare,
  Terminal,
  Settings,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  Wifi,
  Loader,
  PanelLeftClose,
  PanelLeftOpen,
  GitBranch,
  Eye,
  LogOut
} from 'lucide-react';

// Subpages
import Dashboard from './pages/Dashboard';
import Broadcaster from './pages/Broadcaster';
import AutoReplies from './pages/AutoReplies';
import Groups from './pages/Groups';
import JoinRequests from './pages/JoinRequests';
import LogsConsole from './pages/LogsConsole';
import AdminPanel from './pages/AdminPanel';
import WorkflowBuilder from './pages/WorkflowBuilder';
import Supervision from './pages/Supervision';
import DeletedMessages from './pages/DeletedMessages';
import Login from './pages/Login';
import { CustomSelect } from './components/CustomSelect';

export default function App() {
  const {
    sessions,
    activeSessionId,
    setSessions,
    setActiveSessionId,
    updateSessionStatus,
    addLog,
    setLogs
  } = useSessionStore();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [newSessionName, setNewSessionName] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('wa_token');
    const userId = localStorage.getItem('wa_userId');
    if (token && userId) {
      setIsAuthenticated(true);
      setCurrentUser(userId);
    }
  }, []);

  // Fetch init sessions and logs
  useEffect(() => {
    if (!isAuthenticated) return;
    const loadInitialData = async () => {
      try {
        // Fetch DB sessions list
        const sessRes = await fetch('/api/sessions');
        const sessData = await sessRes.json();
        if (sessData.success && sessData.sessions.length > 0) {
          setSessions(sessData.sessions);
        } else {
          // ensure default session is in list even if not in DB yet
          setSessions([{ id: 'default', status: 'connecting' }]);
        }

        // Fetch live in-memory statuses (QR, pairing code, phone, name)
        const liveRes = await fetch('/api/sessions/live');
        const liveData = await liveRes.json();
        if (liveData.success) {
          liveData.sessions.forEach((s: any) => {
            updateSessionStatus(s.id, s.status, { qr: s.qr, code: s.code, phone: s.phone, name: s.name });
          });
        }
      } catch (e) {}
    };

    loadInitialData();

    // Poll live statuses every 3 seconds to always pick up QR
    const poll = setInterval(async () => {
      try {
        const liveRes = await fetch('/api/sessions/live');
        const liveData = await liveRes.json();
        if (liveData.success) {
          liveData.sessions.forEach((s: any) => {
            updateSessionStatus(s.id, s.status, { qr: s.qr, code: s.code, phone: s.phone, name: s.name });
          });
        }
      } catch (e) {}
    }, 3000);

    fetch('/api/logs')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setLogs(data.logs);
      });

    return () => clearInterval(poll);
  }, []);

  // Connect socket.io channel
  useEffect(() => {
    const socket = io();

    socket.on('telemetry', (payload: any) => {
      if (payload.type === 'status') {
        updateSessionStatus(payload.session, payload.status, {
          phone: payload.phone,
          name: payload.name
        });
      } else if (payload.type === 'qr') {
        updateSessionStatus(payload.session, 'qr', { qr: payload.qr });
      } else if (payload.type === 'pairing_code') {
        updateSessionStatus(payload.session, 'qr', { code: payload.code });
      } else if (payload.type === 'log') {
        addLog({
          sessionId: payload.session,
          level: payload.level,
          message: payload.message,
          timestamp: payload.timestamp || new Date().toISOString()
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: newSessionName.trim() })
      });
      const data = await res.json();
      if (data.success) {
        updateSessionStatus(newSessionName.trim(), 'connecting');
        setActiveSessionId(newSessionName.trim());
        setNewSessionName('');
      }
    } catch (err) {}
  };

  const handleLogout = () => {
    localStorage.removeItem('wa_token');
    localStorage.removeItem('wa_userId');
    localStorage.removeItem('wa_rememberMe');
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login onLoginSuccess={(userId) => {
      setIsAuthenticated(true);
      setCurrentUser(userId);
    }} />;
  }

  const activeSessionObj = sessions.find((s) => s.id === activeSessionId) || {
    id: activeSessionId,
    status: 'disconnected'
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'broadcaster':
        return <Broadcaster />;
      case 'replies':
        return <AutoReplies />;
      case 'workflow':
        return <WorkflowBuilder />;
      case 'groups':
        return <Groups />;
      case 'requests':
        return <JoinRequests />;
      case 'logs':
        return <LogsConsole />;
      case 'supervision':
        return <Supervision />;
      case 'deleted':
        return <DeletedMessages />;
      case 'admin':
        return <AdminPanel />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary text-slate-100">
      
      {/* Sidebar Navigation */}
      <aside className={`${isCollapsed ? 'w-20' : 'w-80'} glass-panel border-r flex flex-col transition-all duration-300 relative z-20 overflow-y-auto overflow-x-hidden`}>
        <div className="flex-1 overflow-y-auto">
          {/* Header Branding */}
          <div className="p-5 border-b border-wa-green/10 flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-wa-green/20 flex items-center justify-center border border-wa-green/30 flex-shrink-0">
                <Bot className="w-5 h-5 text-wa-green animate-pulse" />
              </div>
              {!isCollapsed && (
                <div className="truncate">
                  <h1 className="font-bold text-lg leading-tight truncate">WA Automate</h1>
                  <p className="text-xs text-slate-400 truncate">Enterprise Control</p>
                </div>
              )}
            </div>

            {/* Collapse Toggle Button */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2 text-slate-400 hover:text-wa-green hover:bg-white/5 rounded-xl transition-all flex-shrink-0"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>
          </div>

          {/* Session Selector */}
          {!isCollapsed ? (
            <div className="p-4 border-b border-wa-green/10 flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Session</label>
              <div className="flex items-center gap-2">
                <CustomSelect
                  value={activeSessionId}
                  onChange={(val) => setActiveSessionId(val)}
                  options={sessions.map((s) => ({
                    value: s.id,
                    label: `${s.id} (${s.status})`
                  }))}
                />
              </div>

              {/* Quick Add Session Form */}
              <form onSubmit={createSession} className="flex gap-2 mt-2">
                <input
                  type="text"
                  placeholder="New session ID..."
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  className="flex-1 bg-bg-secondary border border-wa-green/15 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-wa-green placeholder-slate-500"
                />
                <button
                  type="submit"
                  className="bg-wa-green hover:bg-wa-green-dark text-black font-semibold rounded-lg px-2 flex items-center justify-center transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>
            </div>
          ) : (
            <div className="p-3 border-b border-wa-green/10 flex justify-center">
              <div
                className="w-10 h-10 rounded-xl bg-wa-green/10 border border-wa-green/20 flex items-center justify-center text-wa-green text-xs font-bold"
                title={`Active Session: ${activeSessionId}`}
              >
                {activeSessionId.substring(0, 2).toUpperCase()}
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="p-3 flex flex-col gap-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'workflow', label: 'Workflow Builder', icon: GitBranch },
              { id: 'broadcaster', label: 'Broadcaster', icon: MessageSquare },
              { id: 'replies', label: 'Auto Replies', icon: Bot },
              { id: 'groups', label: 'Group Features', icon: Users },
              { id: 'requests', label: 'Join Requests', icon: CheckSquare },
              { id: 'supervision', label: 'User Supervision', icon: Eye },
              { id: 'deleted', label: 'Deleted Messages', icon: Trash2 },
              { id: 'logs', label: 'Logger Console', icon: Terminal }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={isCollapsed ? tab.label : undefined}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                    isCollapsed ? 'justify-center' : ''
                  } ${
                    isActive ? 'bg-wa-green/10 text-wa-green border border-wa-green/25 shadow-sm' : 'hover:bg-white/5 text-slate-300'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span>{tab.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Admin controls link - Fixed at bottom */}
        <div className="p-3 border-t border-wa-green/10 flex-shrink-0 sticky bottom-0 bg-bg-primary/95 backdrop-blur-sm">
          <button
            onClick={() => setActiveTab('admin')}
            title={isCollapsed ? "Admin Controls" : undefined}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
              isCollapsed ? 'justify-center' : ''
            } ${
              activeTab === 'admin' ? 'bg-wa-green/15 text-wa-green border border-wa-green/25' : 'hover:bg-white/5 text-slate-400'
            }`}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Admin Controls</span>}
          </button>
        </div>
      </aside>

      {/* Main Panel Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen">
        
        {/* Scoped Top Telemetry Header */}
        <header className="p-6 border-b border-wa-green/10 flex justify-between items-center bg-bg-secondary/40 backdrop-blur-md flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Session: <span className="text-wa-green">{activeSessionId}</span>
            </h2>
            <p className="text-xs text-slate-400">Manage automation and socket state</p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase flex items-center gap-2 border ${
              activeSessionObj.status === 'connected' ? 'bg-wa-green/10 text-wa-green border-wa-green/20' :
              activeSessionObj.status === 'connecting' || activeSessionObj.status === 'reconnecting' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
              'bg-red-500/10 text-red-500 border-red-500/20'
            }`}>
              {activeSessionObj.status === 'connected' ? <Wifi className="w-3.5 h-3.5" /> : <Loader className="w-3.5 h-3.5 animate-spin" />}
              {activeSessionObj.status}
            </span>
            
            {/* User Info & Logout */}
            <div className="flex items-center gap-3 pl-4 border-l border-wa-green/10">
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-200">{currentUser}</p>
                <p className="text-[10px] text-slate-500">Logged in</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Route View */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 w-full">
          {renderActiveTab()}
        </div>
      </main>
    </div>
  );
}
