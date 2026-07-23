import React, { useState, useEffect } from 'react';
import { Lock, Mail, AlertCircle, LogIn, User, CheckCircle2 } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (userId: string) => void;
}

// Get API base URL from environment
const getApiBaseUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL as string;
  return apiUrl || '';
};

export default function Login({ onLoginSuccess }: LoginProps) {
  const apiBaseUrl = getApiBaseUrl();
  // Mode toggle
  const [isLogin, setIsLogin] = useState(true);

  // Login state
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Register state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUserId, setRegUserId] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Common
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // Check if credentials are saved in localStorage
    const savedUserId = localStorage.getItem('wa_userId');
    if (savedUserId) {
      setUserId(savedUserId);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Simple validation
    if (!userId.trim() || !password.trim()) {
      setError('Please enter both ID and password');
      setLoading(false);
      return;
    }

    try {
      // Send to backend for verification
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password })
      });

      const data = await res.json();

      if (data.success) {
        // Store credentials
        localStorage.setItem('wa_token', data.token);
        localStorage.setItem('wa_userId', userId);
        
        if (rememberMe) {
          localStorage.setItem('wa_rememberMe', 'true');
        } else {
          localStorage.removeItem('wa_rememberMe');
        }

        onLoginSuccess(userId);
      } else {
        setError(data.error || 'Login failed. Invalid credentials.');
      }
    } catch (err: any) {
      setError('Connection error. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Validation
    if (!regFullName.trim() || !regUserId.trim() || !regPassword.trim()) {
      setError('Please fill in all required fields');
      setLoading(false);
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: regUserId,
          password: regPassword,
          fullName: regFullName,
          email: regEmail || null
        })
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Account created successfully! Now you can login.');
        // Reset form and switch to login
        setTimeout(() => {
          setIsLogin(true);
          setRegFullName('');
          setRegEmail('');
          setRegUserId('');
          setRegPassword('');
          setRegConfirmPassword('');
          setSuccess('');
          setUserId(regUserId);
          setPassword('');
        }, 1500);
      } else {
        setError(data.error || 'Registration failed.');
      }
    } catch (err: any) {
      setError('Connection error. Please try again.');
      console.error('Register error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-bg-primary via-emerald-950/20 to-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-wa-green/20 flex items-center justify-center border border-wa-green/30 mx-auto mb-4">
            <Lock className="w-8 h-8 text-wa-green" />
          </div>
          <h1 className="text-3xl font-bold text-slate-100 mb-2">WA Automate</h1>
          <p className="text-sm text-slate-400">Secure Session Access Portal</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-3 mb-6 bg-bg-secondary/50 p-1 rounded-xl border border-wa-green/10">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true);
              setError('');
              setSuccess('');
            }}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
              isLogin
                ? 'bg-wa-green text-black shadow-lg'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <LogIn className="w-4 h-4 inline mr-2" /> Login
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              setError('');
              setSuccess('');
            }}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
              !isLogin
                ? 'bg-wa-green text-black shadow-lg'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <User className="w-4 h-4 inline mr-2" /> Register
          </button>
        </div>

        {/* Login Card */}
        <div className="glass-panel p-8 rounded-2xl border border-wa-green/20 shadow-2xl space-y-6">
          {isLogin ? (
            // LOGIN FORM
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* User ID Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  <Mail className="w-4 h-4 inline mr-1" /> User ID
                </label>
                <input
                  type="text"
                  placeholder="Enter your user ID"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-wa-green placeholder-slate-500 transition-all"
                  disabled={loading}
                />
                <p className="text-[11px] text-slate-500">Your unique session identifier</p>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  <Lock className="w-4 h-4 inline mr-1" /> Password
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-wa-green placeholder-slate-500 transition-all"
                  disabled={loading}
                />
                <p className="text-[11px] text-slate-500">Keep it secure and private</p>
              </div>

              {/* Remember Me */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-wa-green/30 bg-bg-secondary text-wa-green cursor-pointer"
                  disabled={loading}
                />
                <span className="text-xs text-slate-400">Remember my ID on this device</span>
              </label>

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-wa-green to-emerald-500 hover:from-wa-green-dark hover:to-emerald-600 disabled:opacity-50 text-black font-bold py-3 rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 group"
              >
                <LogIn className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                {loading ? 'Logging in...' : 'Access Sessions'}
              </button>
            </form>
          ) : (
            // REGISTER FORM
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 text-green-300 rounded-xl text-sm">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* Full Name Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  <User className="w-4 h-4 inline mr-1" /> Full Name
                </label>
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-wa-green placeholder-slate-500 transition-all"
                  disabled={loading}
                />
              </div>

              {/* Email Input (Optional) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  <Mail className="w-4 h-4 inline mr-1" /> Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-wa-green placeholder-slate-500 transition-all"
                  disabled={loading}
                />
              </div>

              {/* User ID Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  <User className="w-4 h-4 inline mr-1" /> User ID
                </label>
                <input
                  type="text"
                  placeholder="Choose your user ID"
                  value={regUserId}
                  onChange={(e) => setRegUserId(e.target.value)}
                  className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-wa-green placeholder-slate-500 transition-all"
                  disabled={loading}
                />
                <p className="text-[11px] text-slate-500">Unique identifier for login</p>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  <Lock className="w-4 h-4 inline mr-1" /> Password
                </label>
                <input
                  type="password"
                  placeholder="Create a strong password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-wa-green placeholder-slate-500 transition-all"
                  disabled={loading}
                />
                <p className="text-[11px] text-slate-500">Minimum 6 characters</p>
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  <Lock className="w-4 h-4 inline mr-1" /> Confirm Password
                </label>
                <input
                  type="password"
                  placeholder="Confirm your password"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-wa-green placeholder-slate-500 transition-all"
                  disabled={loading}
                />
              </div>

              {/* Register Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-wa-green to-emerald-500 hover:from-wa-green-dark hover:to-emerald-600 disabled:opacity-50 text-black font-bold py-3 rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 group"
              >
                <CheckCircle2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}

          {/* Info Section */}
          <div className="pt-4 border-t border-wa-green/10 space-y-3">
            <div className="bg-wa-green/5 p-3 rounded-lg border border-wa-green/10">
              <p className="text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-wa-green">💡 Tip:</span> {isLogin ? 'Use your session identifier as User ID and a strong password to access your WhatsApp automation sessions.' : 'Choose a unique User ID and strong password to create your account.'}
              </p>
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              Your credentials are encrypted and stored securely. Never share your password.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-slate-500">
          <p>WA Automate v1.0 • Enterprise WhatsApp Control Panel</p>
        </div>
      </div>
    </div>
  );
}
