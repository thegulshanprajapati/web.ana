import { create } from 'zustand';

export interface Session {
  id: string;
  status: string;
  phone?: string;
  name?: string;
  qr?: string;
  code?: string;
}

export interface LogEntry {
  sessionId: string;
  level: string;
  message: string;
  timestamp: string;
}

interface SessionStore {
  sessions: Session[];
  activeSessionId: string;
  logs: LogEntry[];
  setSessions: (sessions: Session[]) => void;
  setActiveSessionId: (id: string) => void;
  addLog: (log: LogEntry) => void;
  setLogs: (logs: LogEntry[]) => void;
  updateSessionStatus: (id: string, status: string, extra?: any) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  activeSessionId: 'default',
  logs: [],
  setSessions: (sessions) => set({ sessions }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  addLog: (log) => set((state) => ({ logs: [...state.logs.slice(-199), log] })),
  setLogs: (logs) => set({ logs }),
  updateSessionStatus: (id, status, extra) => set((state) => {
    const updated = state.sessions.map((s) => {
      if (s.id === id) {
        return { ...s, status, ...extra };
      }
      return s;
    });
    if (!updated.some((s) => s.id === id)) {
      updated.push({ id, status, ...extra });
    }
    return { sessions: updated };
  })
}));
