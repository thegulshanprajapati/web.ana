import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Bot, Plus, Trash2, Zap, Sparkles, MessageSquare, Cpu, Sliders } from 'lucide-react';
import { CustomSelect } from '../components/CustomSelect';

interface AutoReplyRule {
  id: number;
  type: string;
  keyword?: string;
  replyText: string;
  personality: string;
  customTone?: string;
  matchType?: string;
  useAi?: boolean;
  isActive: boolean;
}

export default function AutoReplies() {
  const { activeSessionId } = useSessionStore();
  const [rules, setRules] = useState<AutoReplyRule[]>([]);

  // Form state
  const [type, setType] = useState('start-ana'); // "start-ana", "ai", "command", "keyword", "welcome"
  const [keyword, setKeyword] = useState('');
  const [replyText, setReplyText] = useState('');
  const [personality, setPersonality] = useState('friendly'); // "friendly", "professional", "assistant", "funny", "hinglish", "custom"
  const [customTone, setCustomTone] = useState('');
  const [matchType, setMatchType] = useState('contains'); // "contains", "exact", "starts_with"
  const [useAi, setUseAi] = useState(false);

  // AI Global Settings
  const [aiProvider, setAiProvider] = useState('pollinations');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiSystemPrompt, setAiSystemPrompt] = useState('You are Ana, a smart and friendly WhatsApp AI assistant.');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [showAiSettings, setShowAiSettings] = useState(false);

  useEffect(() => {
    fetchRules();
    fetchAiConfig();
  }, []);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/auto-replies');
      const data = await res.json();
      if (data.success) {
        setRules(data.rules);
      }
    } catch (err) {}
  };

  const fetchAiConfig = async () => {
    try {
      const res = await fetch('/api/ai-config');
      const data = await res.json();
      if (data.success && data.config) {
        setAiProvider(data.config.provider || 'pollinations');
        setAiApiKey(data.config.apiKey || '');
        setAiSystemPrompt(data.config.systemPrompt || '');
        setAiEnabled(data.config.isEnabled);
      }
    } catch (err) {}
  };

  const saveAiConfig = async () => {
    try {
      await fetch('/api/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          systemPrompt: aiSystemPrompt,
          isEnabled: aiEnabled
        })
      });
      alert('AI Configuration Saved!');
    } catch (err) {}
  };

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!useAi && type !== 'ai' && !replyText.trim()) return;
    if ((type === 'keyword' || type === 'command') && !keyword.trim()) return;

    try {
      const res = await fetch('/api/auto-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          type,
          keyword: (type === 'keyword' || type === 'command') ? keyword.trim() : undefined,
          replyText: replyText.trim(),
          personality,
          customTone: personality === 'custom' ? customTone.trim() : undefined,
          matchType,
          useAi: useAi || type === 'ai'
        })
      });
      const data = await res.json();
      if (data.success) {
        setKeyword('');
        setReplyText('');
        setCustomTone('');
        setUseAi(false);
        fetchRules();
      }
    } catch (err) {}
  };

  const deleteRule = async (id: number) => {
    try {
      const res = await fetch(`/api/auto-replies/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchRules();
      }
    } catch (err) {}
  };

  return (
    <div className="space-y-6">
      {/* AI Header Bar */}
      <div className="glass-panel p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 border border-purple-500/20 bg-purple-950/10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/20 text-purple-400 rounded-xl">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              Free LLM AI Auto-Responder Engine
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/30">
                100% FREE (No Paid API Key Needed)
              </span>
            </h3>
            <p className="text-xs text-slate-400">Powered by Pollinations AI & Groq LLMs. Responds dynamically to incoming WhatsApp questions.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAiSettings(!showAiSettings)}
          className="px-4 py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/30 font-semibold rounded-xl text-xs transition-all flex items-center gap-1.5"
        >
          <Sliders className="w-3.5 h-3.5" />
          {showAiSettings ? 'Hide AI System Settings' : 'Configure AI Engine Settings'}
        </button>
      </div>

      {showAiSettings && (
        <div className="glass-panel p-6 rounded-2xl space-y-4 border border-purple-500/30 bg-purple-950/20">
          <h3 className="text-sm font-bold text-purple-300 flex items-center gap-2 uppercase tracking-wider">
            <Sparkles className="w-4 h-4" /> Global AI LLM Setup
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">LLM Provider</label>
              <CustomSelect
                value={aiProvider}
                onChange={(val) => setAiProvider(val)}
                options={[
                  { value: 'pollinations', label: 'Pollinations AI (100% Free - Unlimited, No Key)' },
                  { value: 'groq', label: 'Groq Cloud API (Free Llama 3.1 Tier)' }
                ]}
              />
            </div>
            {aiProvider === 'groq' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Groq API Key</label>
                <input
                  type="password"
                  placeholder="gsk_..."
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  className="w-full bg-bg-secondary border border-purple-500/30 rounded-xl px-4 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
            )}
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-400">Ana AI System Prompt / Custom Master Instructions</label>
              <textarea
                rows={2}
                value={aiSystemPrompt}
                onChange={(e) => setAiSystemPrompt(e.target.value)}
                className="w-full bg-bg-secondary border border-purple-500/30 rounded-xl px-4 py-2 text-sm text-slate-100 outline-none"
              />
            </div>
          </div>
          <button
            onClick={saveAiConfig}
            className="px-5 py-2.5 bg-purple-600 text-white font-bold rounded-xl text-xs hover:bg-purple-500 transition-all shadow-lg"
          >
            Save AI System Settings
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Rule Creator */}
        <div className="glass-panel p-6 rounded-2xl h-fit space-y-4">
          <h2 className="text-lg font-bold text-wa-green flex items-center gap-2">
            <Bot className="w-5 h-5" /> Config Auto Reply Rule
          </h2>
          <form onSubmit={createRule} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Trigger Type</label>
              <CustomSelect
                value={type}
                onChange={(val) => setType(val)}
                options={[
                  { value: 'start-ana', label: '⚡ Start Trigger (@start-ana / ana / start / startana)' },
                  { value: 'ai', label: '🤖 AI Auto-Responder (Smart LLM Chat)' },
                  { value: 'command', label: '💻 Custom Command (e.g. /help, /info, /rules)' },
                  { value: 'keyword', label: '🔍 Keyword Trigger' },
                  { value: 'welcome', label: '👋 Welcome Message (on group join)' }
                ]}
              />
            </div>

            {(type === 'keyword' || type === 'command') && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {type === 'command' ? 'Command Trigger' : 'Trigger Keyword'}
                </label>
                <input
                  type="text"
                  placeholder={type === 'command' ? "e.g. /menu or !help" : "e.g. price, support"}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-wa-green"
                />
              </div>
            )}

            {type === 'keyword' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Match Condition</label>
                <CustomSelect
                  value={matchType}
                  onChange={(val) => setMatchType(val)}
                  options={[
                    { value: 'contains', label: 'Contains Keyword' },
                    { value: 'exact', label: 'Exact Match' },
                    { value: 'starts_with', label: 'Starts With Keyword' }
                  ]}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bot Personality & Tone</label>
              <CustomSelect
                value={personality}
                onChange={(val) => setPersonality(val)}
                options={[
                  { value: 'friendly', label: '😊 Friendly Tone (Default)' },
                  { value: 'hinglish', label: '🇮🇳 Hinglish Tone (Hindi + English mix)' },
                  { value: 'professional', label: '💼 Professional / Official' },
                  { value: 'assistant', label: '🤖 Smart Assistant' },
                  { value: 'funny', label: '🤪 Playful / Funny Tone' },
                  { value: 'custom', label: '⚙️ Custom User-Defined Tone...' }
                ]}
              />
            </div>

            {personality === 'custom' && (
              <div className="space-y-1 bg-purple-500/10 p-3 rounded-xl border border-purple-500/20">
                <label className="text-xs font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5" /> Define Custom Tone Prompt
                </label>
                <input
                  type="text"
                  placeholder="e.g. Speak like a polite anime assistant with emojis..."
                  value={customTone}
                  onChange={(e) => setCustomTone(e.target.value)}
                  className="w-full bg-bg-secondary border border-purple-500/30 rounded-xl px-4 py-2 text-sm text-slate-100 outline-none focus:border-purple-400"
                />
              </div>
            )}

            {type !== 'ai' && (
              <div className="flex items-center gap-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <input
                  type="checkbox"
                  id="useAiCheck"
                  checked={useAi}
                  onChange={(e) => setUseAi(e.target.checked)}
                  className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                />
                <label htmlFor="useAiCheck" className="text-xs text-purple-200 font-semibold cursor-pointer">
                  Use Free AI LLM to generate response dynamically
                </label>
              </div>
            )}

            {!useAi && type !== 'ai' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reply Content</label>
                <textarea
                  placeholder={
                    type === 'start-ana' 
                      ? "Custom reply when someone triggers @start-ana / ana / start / startana..." 
                      : type === 'command'
                      ? "Command response content (use {user} for user mention)..."
                      : "Type reply text..."
                  }
                  rows={4}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-wa-green"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-wa-green hover:bg-wa-green-dark text-black font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Save Auto Reply Rule
            </button>
          </form>
        </div>

        {/* Rules list */}
        <div className="md:col-span-2 glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-200">Active Auto-Reply Rules</h2>
            <span className="text-xs bg-wa-green/10 text-wa-green font-semibold px-2.5 py-1 rounded-full border border-wa-green/20">
              {rules.length} Rules Active
            </span>
          </div>

          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className="flex justify-between items-start bg-white/5 p-4 rounded-xl border border-wa-green/10 space-x-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      rule.type === 'start-ana' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      rule.type === 'ai' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                      rule.type === 'command' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      rule.type === 'welcome' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                      'bg-wa-green/10 text-wa-green border border-wa-green/20'
                    }`}>
                      {rule.type}
                    </span>

                    {(rule.useAi || rule.type === 'ai') && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> AI Generated
                      </span>
                    )}

                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20 capitalize flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> {rule.personality === 'custom' ? `Custom Tone: "${rule.customTone || 'User Defined'}"` : rule.personality || 'friendly'}
                    </span>

                    {(rule.type === 'keyword' || rule.type === 'command') && rule.keyword && (
                      <span className="text-xs font-semibold text-slate-400">
                        trigger: <code className="text-wa-green bg-white/5 px-1.5 py-0.5 rounded border border-white/10">"{rule.keyword}"</code>
                      </span>
                    )}

                    {rule.type === 'start-ana' && (
                      <span className="text-xs font-semibold text-amber-300/80">
                        triggers on: <code className="bg-white/5 px-1 py-0.5 rounded text-amber-200">@start-ana / ana / start / startana</code>
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-300 whitespace-pre-wrap selectable-text">{rule.replyText}</p>
                </div>

                <button
                  onClick={() => deleteRule(rule.id)}
                  className="text-red-500 hover:text-red-400 transition-all p-1.5 hover:bg-red-500/10 rounded-lg"
                  title="Delete rule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {rules.length === 0 && (
              <div className="text-center text-slate-500 py-10 space-y-2">
                <Bot className="w-8 h-8 mx-auto text-slate-600" />
                <p>No custom auto reply rules added yet.</p>
                <p className="text-xs text-slate-600">Built-in AI responder for <code className="text-wa-green">@start-ana / ana / start</code> is active automatically!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
