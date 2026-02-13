import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

type Tab = 'login' | 'register';

export function LoginModal() {
  const { showLoginModal, setShowLoginModal, login, register } = useAuthStore();
  const [tab, setTab] = useState<Tab>('login');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Login fields
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  if (!showLoginModal) return null;

  const resetFields = () => {
    setLoginId('');
    setLoginPassword('');
    setRegEmail('');
    setRegUsername('');
    setRegPassword('');
    setRegConfirm('');
    setError('');
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const result = await login(loginId, loginPassword);
      if (!result.success) setError(result.error || 'Login failed');
    } catch {
      setError('Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (regPassword !== regConfirm) {
      setError('Passwords do not match');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await register(regEmail, regUsername, regPassword);
      if (!result.success) setError(result.error || 'Registration failed');
    } catch {
      setError('Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setShowLoginModal(false);
    resetFields();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={handleClose}
    >
      <div
        className="w-[380px] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-text-primary">
            {tab === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 gap-1">
          <button
            onClick={() => switchTab('login')}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'login'
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => switchTab('register')}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === 'register'
                ? 'bg-accent/15 text-accent'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
            }`}
          >
            Register
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-md bg-error/10 text-error text-xs">
            {error}
          </div>
        )}

        {/* Forms */}
        <div className="p-5">
          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="Email or username"
                autoFocus
                required
                className="w-full bg-bg border border-border rounded-lg px-3 py-2
                           text-sm text-text-primary placeholder-text-muted
                           outline-none focus:border-accent/50 transition-colors"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full bg-bg border border-border rounded-lg px-3 py-2
                           text-sm text-text-primary placeholder-text-muted
                           outline-none focus:border-accent/50 transition-colors"
              />
              <button
                type="submit"
                disabled={isSubmitting || !loginId || !loginPassword}
                className="w-full py-2 rounded-lg bg-accent text-white text-sm font-medium
                           hover:bg-accent/90 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="flex flex-col gap-3">
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="Email"
                autoFocus
                required
                className="w-full bg-bg border border-border rounded-lg px-3 py-2
                           text-sm text-text-primary placeholder-text-muted
                           outline-none focus:border-accent/50 transition-colors"
              />
              <input
                type="text"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder="Username"
                required
                className="w-full bg-bg border border-border rounded-lg px-3 py-2
                           text-sm text-text-primary placeholder-text-muted
                           outline-none focus:border-accent/50 transition-colors"
              />
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                required
                minLength={6}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2
                           text-sm text-text-primary placeholder-text-muted
                           outline-none focus:border-accent/50 transition-colors"
              />
              <input
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="Confirm password"
                required
                className="w-full bg-bg border border-border rounded-lg px-3 py-2
                           text-sm text-text-primary placeholder-text-muted
                           outline-none focus:border-accent/50 transition-colors"
              />
              <button
                type="submit"
                disabled={isSubmitting || !regEmail || !regUsername || !regPassword || !regConfirm}
                className="w-full py-2 rounded-lg bg-accent text-white text-sm font-medium
                           hover:bg-accent/90 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating account…' : 'Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
