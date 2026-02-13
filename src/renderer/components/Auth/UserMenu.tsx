import React, { useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';

interface UserMenuProps {
  open: boolean;
  onClose: () => void;
}

export function UserMenu({ open, onClose }: UserMenuProps) {
  const { user, logout } = useAuthStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || !user) return null;

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  const initial = (user.username || user.email)[0].toUpperCase();

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border
                 rounded-lg shadow-lg z-50 overflow-hidden"
    >
      {/* User info */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-semibold shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">{user.username}</div>
            <div className="text-[11px] text-text-muted truncate">{user.email}</div>
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1">
        {/* Profile settings — placeholder */}
        <button
          disabled
          className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                     text-text-muted cursor-not-allowed"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span>Profile Settings</span>
          <span className="ml-auto text-[10px] text-text-muted">Soon</span>
        </button>

        {/* Sync sessions — placeholder */}
        <button
          disabled
          className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                     text-text-muted cursor-not-allowed"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 8a6 6 0 0110.5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M14 8a6 6 0 01-10.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M12 2v2.5h-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 14v-2.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Sync Sessions</span>
          <span className="ml-auto text-[10px] text-text-muted">Soon</span>
        </button>

        <div className="border-t border-border my-1" />

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                     text-text-secondary hover:text-error hover:bg-surface-hover transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6 2H4a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M10.5 11.5L14 8l-3.5-3.5M14 8H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
