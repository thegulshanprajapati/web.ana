import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSessionStore } from '../store/sessionStore';
import {
  QrCode,
  Smartphone,
  Phone,
  User,
  CheckCircle,
  RefreshCw,
  LogOut,
  Sparkles
} from 'lucide-react';

export default function Dashboard() {
  const { sessions, activeSessionId, updateSessionStatus } = useSessionStore();
  const [phoneInput, setPhoneInput] = useState('');
  const [linkMode, setLinkMode] = useState<'qr' | 'code'>('qr');
  const [loading, setLoading] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || {
    id: activeSessionId,
    status: 'disconnected'
  };

  const startPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (linkMode === 'code' && !phoneInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          phoneNumber: linkMode === 'code' ? phoneInput.trim() : undefined,
          usePairingCode: linkMode === 'code'
        })
      });
      const data = await res.json();
      if (data.success) {
        updateSessionStatus(activeSessionId, 'connecting');
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const forceDisconnect = async () => {
    try {
      await fetch(`/api/sessions/${activeSessionId}`, { method: 'DELETE' });
      updateSessionStatus(activeSessionId, 'disconnected');
    } catch (err) {}
  };

  const triggerReconnect = async () => {
    try {
      await fetch(`/api/sessions/${activeSessionId}/reconnect`, { method: 'POST' });
      updateSessionStatus(activeSessionId, 'connecting');
    } catch (err) {}
  };

  // Parse code from "QBAL-PH69" or "QBALPH69" → array of chars
  const codeRaw: string = (activeSession as any).code || '';
  const codeParts = codeRaw.replace(/-/g, '').split('');

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Welcome Banner */}
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-gradient-to-r from-wa-green/10 to-transparent">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Active Automation Control</h1>
            <p className="text-sm text-slate-300 max-w-lg">
              Manage multi-session accounts, monitor connection states, and trigger pairing requests.
            </p>
          </div>
          <Sparkles className="w-8 h-8 text-wa-green animate-pulse" />
        </div>
      </div>

      {activeSession.status === 'connected' ? (
        /* Connected Panel View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-wa-green">
              <CheckCircle className="w-5 h-5" /> Account Information
            </h2>
            <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-wa-green/10">
              <div className="w-16 h-16 rounded-full bg-wa-green/20 border border-wa-green/30 flex items-center justify-center">
                <User className="w-8 h-8 text-wa-green" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-100">{(activeSession as any).name || 'WhatsApp Account'}</h3>
                <p className="text-sm text-slate-400">+{(activeSession as any).phone || 'Unknown Phone'}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={triggerReconnect}
                className="flex-1 bg-white/5 hover:bg-white/10 border border-wa-green/20 text-slate-200 py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCw className="w-4 h-4" /> Reset / Reconnect
              </button>
              <button
                onClick={forceDisconnect}
                className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <LogOut className="w-4 h-4" /> Logout / Disconnect
              </button>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-200">Engine Telemetry</h2>
              <p className="text-sm text-slate-400">Real-time parameters linked to current runtime.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
                <p className="text-xs text-slate-400">Device Platform</p>
                <p className="text-lg font-bold text-wa-green mt-1">macOS Desktop</p>
              </div>
              <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
                <p className="text-xs text-slate-400">Socket State</p>
                <p className="text-lg font-bold text-slate-200 mt-1">Authenticated</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Pairing / Connection Mode */
        <div className="glass-panel rounded-2xl overflow-hidden">
          {/* Mode Switch Header */}
          <div className="flex border-b border-wa-green/10">
            <button
              onClick={() => setLinkMode('qr')}
              className={`flex-1 py-4 flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                linkMode === 'qr'
                  ? 'bg-wa-green/10 text-wa-green border-b-2 border-wa-green'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <QrCode className="w-4 h-4" /> Scan QR Code
            </button>
            <button
              onClick={() => setLinkMode('code')}
              className={`flex-1 py-4 flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                linkMode === 'code'
                  ? 'bg-wa-green/10 text-wa-green border-b-2 border-wa-green'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-4 h-4" /> Link with Phone Number
            </button>
          </div>

          <div className="p-8 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              {/* QR Mode */}
              {linkMode === 'qr' && (
                <motion.div
                  key="qr-mode"
                  initial={{ x: -40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -40, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                >
              <div className="flex flex-col md:flex-row items-center gap-10">
                {/* QR Preview */}
                <div className="flex-shrink-0 flex flex-col items-center gap-4">
                  {activeSession.status === 'qr' && (activeSession as any).qr ? (
                    <div className="bg-white p-4 rounded-2xl shadow-2xl shadow-wa-green/20">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent((activeSession as any).qr)}`}
                        alt="WhatsApp Login QR"
                        className="w-[220px] h-[220px] block"
                      />
                    </div>
                  ) : (
                    <div className="w-[220px] h-[220px] rounded-2xl border-2 border-dashed border-wa-green/20 flex flex-col items-center justify-center gap-3 text-slate-500">
                      {activeSession.status === 'connecting' ? (
                        <>
                          <div className="w-8 h-8 rounded-full border-4 border-wa-green/30 border-t-wa-green animate-spin" />
                          <p className="text-xs">Generating QR...</p>
                        </>
                      ) : (
                        <>
                          <QrCode className="w-12 h-12 opacity-30 stroke-[1.2]" />
                          <p className="text-xs text-center">Click "Link Device" below<br />to generate QR</p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-xl font-bold text-slate-100">Scan this QR code</h2>
                    <p className="text-sm text-slate-400 mt-1">Link your WhatsApp account by scanning from your phone.</p>
                  </div>
                  <ol className="space-y-3">
                    {[
                      'Open WhatsApp on your phone',
                      'On Android tap ⋮ Menu • On iPhone tap Settings ⚙',
                      'Tap Linked devices, then Link a device',
                      'Point your phone at this screen to scan the QR code'
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                        <span className="w-6 h-6 rounded-full border border-wa-green/40 text-wa-green text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>

                  {activeSession.status !== 'connecting' && activeSession.status !== 'qr' && (
                    <form onSubmit={startPairing}>
                      <button
                        type="submit"
                        disabled={loading}
                        className="bg-wa-green hover:bg-wa-green-dark disabled:opacity-50 text-black font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-wa-green/20"
                      >
                        {loading ? 'Initializing...' : 'Generate QR Code'}
                      </button>
                    </form>
                  )}

                  {activeSession.status === 'qr' && (
                    <p className="text-xs text-wa-green animate-pulse font-medium">
                      ● QR Code is live — scan it now! It refreshes every 60 seconds.
                    </p>
                  )}
                </div>
              </div>
                </motion.div>
              )}

              {/* Pairing Code Mode */}
              {linkMode === 'code' && (
                <motion.div
                  key="code-mode"
                  initial={{ x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 40, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                >
              <div className="flex flex-col md:flex-row items-start gap-10">
                {/* Left: form or code display */}
                <div className="flex-1 space-y-6">
                  {codeRaw ? (
                    /* Code Display — Exactly like WhatsApp Web */
                    <div className="space-y-6">
                      <div>
                        <h2 className="text-xl font-bold text-slate-100">Enter code on your phone</h2>
                        <p className="text-sm text-slate-400 mt-1">
                          Linking WhatsApp account <span className="text-slate-200 font-semibold">{phoneInput}</span>
                        </p>
                      </div>

                      {/* Code boxes — XXXX-XXXX */}
                      <div className="flex items-center gap-2">
                        {codeParts.slice(0, 4).map((char, i) => (
                          <div
                            key={`a-${i}`}
                            className="w-12 h-14 bg-white/5 border-2 border-wa-green/40 rounded-xl flex items-center justify-center text-2xl font-bold text-wa-green tracking-wide"
                          >
                            {char}
                          </div>
                        ))}
                        <span className="text-2xl font-bold text-slate-400 mx-1">-</span>
                        {codeParts.slice(4, 8).map((char, i) => (
                          <div
                            key={`b-${i}`}
                            className="w-12 h-14 bg-white/5 border-2 border-wa-green/40 rounded-xl flex items-center justify-center text-2xl font-bold text-wa-green tracking-wide"
                          >
                            {char}
                          </div>
                        ))}
                      </div>

                      {/* Instructions */}
                      <ol className="space-y-3">
                        {[
                          'Open WhatsApp on your phone',
                          'On Android tap ⋮ Menu • On iPhone tap Settings ⚙',
                          'Tap Linked devices, then Link a device',
                          'Tap "Link with phone number instead" and enter this code on your phone'
                        ].map((step, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                            <span className="w-6 h-6 rounded-full border border-wa-green/40 text-wa-green text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>

                      <button
                        onClick={() => {
                          updateSessionStatus(activeSessionId, 'disconnected', { code: undefined, qr: undefined });
                          setPhoneInput('');
                          setLinkMode('qr');
                        }}
                        className="text-sm text-wa-green hover:underline flex items-center gap-1 transition-all"
                      >
                        <QrCode className="w-4 h-4" /> Log in with QR code instead →
                      </button>
                    </div>
                  ) : (
                    /* Phone Number Entry Form */
                    <div className="space-y-6">
                      <div>
                        <h2 className="text-xl font-bold text-slate-100">Enter phone number</h2>
                        <p className="text-sm text-slate-400 mt-1">Enter your WhatsApp phone number with country code.</p>
                      </div>

                      <form onSubmit={startPairing} className="space-y-4 max-w-sm">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone Number</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                              type="text"
                              placeholder="+91 98765 43210"
                              value={phoneInput}
                              onChange={(e) => setPhoneInput(e.target.value)}
                              className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 outline-none focus:border-wa-green"
                            />
                          </div>
                          <p className="text-xs text-slate-500">Include country code. e.g. +91 for India</p>
                        </div>

                        <button
                          type="submit"
                          disabled={loading || !phoneInput.trim() || activeSession.status === 'connecting'}
                          className="w-full bg-wa-green hover:bg-wa-green-dark disabled:opacity-50 text-black font-bold py-3 rounded-xl transition-all shadow-lg shadow-wa-green/20 flex items-center justify-center gap-2"
                        >
                          {loading || activeSession.status === 'connecting' ? (
                            <>
                              <div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                              Generating code...
                            </>
                          ) : (
                            'Next'
                          )}
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                {/* Right: Status indicator */}
                {!codeRaw && (
                  <div className="hidden md:flex flex-col items-center justify-center p-6 border border-wa-green/10 bg-white/5 rounded-2xl min-w-[200px] h-[200px]">
                    <Smartphone className="w-14 h-14 text-slate-600 stroke-[1.2]" />
                    <p className="text-xs text-slate-500 text-center mt-3">Enter your number to get a pairing code</p>
                  </div>
                )}
              </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
