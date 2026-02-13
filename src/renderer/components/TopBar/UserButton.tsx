import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { UserMenu } from '../Auth/UserMenu';

export function UserButton() {
  const { user, isLoading, setShowLoginModal } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  if (isLoading) return null;

  // Not logged in — show sign-in button
  if (!user) {
    return (
      <button
        onClick={() => setShowLoginModal(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                   text-text-secondary hover:text-text-primary hover:bg-surface-hover
                   transition-colors text-xs font-medium"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span>Sign In</span>
      </button>
    );
  }

  // Logged in — show avatar with dropdown
  const initial = (user.username || user.email)[0].toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded-md
                   hover:bg-surface-hover transition-colors"
        title={user.username}
      >
        <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[11px] font-semibold">
          {initial}
        </div>
        <span className="text-xs text-text-secondary max-w-[80px] truncate">{user.username}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-text-muted">
          <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <UserMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
