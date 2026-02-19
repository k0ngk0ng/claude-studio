import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useRemoteStore } from '../../stores/remoteStore';
import { RelayStatus } from '../Remote/RemoteIndicator';
import { ChangePasswordModal } from './ChangePasswordModal';

interface UserMenuProps {
  open: boolean;
  onClose: () => void;
}

export function UserMenu({ open, onClose }: UserMenuProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const { qrDataUrl, isGeneratingQR, relayConnected, connect, generateQR } = useRemoteStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showQR, setShowQR] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

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

  if (!user) return null;

  if (!open && !showPasswordModal) return null;

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  const initial = (user.username || user.email)[0].toUpperCase();

  return (
    <>
      {open && (
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

        {/* Relay status */}
        <div className="border-b border-border">
          <RelayStatus />
        </div>

        {/* Menu items */}
        <div className="py-1">
          {/* Change password */}
          <button
            onClick={() => {
              onClose();
              setShowPasswordModal(true);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                       text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span>{t('userMenu.changePassword')}</span>
          </button>

          {/* Remote QR Code */}
          <button
            onClick={async () => {
              if (showQR) {
                setShowQR(false);
                return;
              }
              if (!relayConnected) await connect();
              await generateQR();
              setShowQR(true);
            }}
            disabled={isGeneratingQR}
            className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs
                       text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="9" y="2" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="2" y="9" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="3.5" y="3.5" width="2" height="2" fill="currentColor" />
              <rect x="10.5" y="3.5" width="2" height="2" fill="currentColor" />
              <rect x="3.5" y="10.5" width="2" height="2" fill="currentColor" />
              <rect x="9.5" y="9.5" width="1.5" height="1.5" fill="currentColor" />
              <rect x="12" y="9.5" width="1.5" height="1.5" fill="currentColor" />
              <rect x="9.5" y="12" width="1.5" height="1.5" fill="currentColor" />
              <rect x="12" y="12" width="1.5" height="1.5" fill="currentColor" />
            </svg>
            <span>{isGeneratingQR ? t('userMenu.generating') : t('userMenu.remoteQRCode')}</span>
          </button>

          {/* Inline QR display */}
          {showQR && qrDataUrl && (
            <div className="px-3 py-3 flex flex-col items-center gap-2 border-t border-border">
              <img
                src={qrDataUrl}
                alt="Pairing QR Code"
                className="w-40 h-40 rounded-lg"
                style={{ imageRendering: 'pixelated' }}
              />
              <p className="text-[10px] text-text-muted text-center leading-tight">
                {t('userMenu.scanToPair')}
              </p>
              <button
                onClick={async () => { await generateQR(); }}
                disabled={isGeneratingQR}
                className="text-[10px] text-accent hover:text-accent/80 transition-colors
                           disabled:opacity-50"
              >
                {t('userMenu.regenerate')}
              </button>
            </div>
          )}

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
            <span>{t('userMenu.signOut')}</span>
          </button>
        </div>
      </div>
      )}

      <ChangePasswordModal
        open={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </>
  );
}
