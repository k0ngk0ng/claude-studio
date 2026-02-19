import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const { t } = useTranslation();
  const { changePassword } = useAuthStore();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    setError('');
    if (!oldPassword || !newPassword) {
      setError(t('changePassword.fillAllFields'));
      return;
    }
    if (newPassword.length < 6) {
      setError(t('changePassword.minLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('changePassword.passwordsNotMatch'));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await changePassword(oldPassword, newPassword);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => onClose(), 1200);
      } else {
        setError(result.error || t('changePassword.failedToChange'));
      }
    } catch {
      setError(t('changePassword.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
    >
      <div className="w-80 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">{t('changePassword.title')}</h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          {success ? (
            <div className="text-sm text-green-400 text-center py-4">
              ✓ {t('changePassword.success')}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">{t('changePassword.currentPassword')}</label>
                <input
                  type="password"
                  autoFocus
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-border
                             text-text-primary placeholder:text-text-muted
                             focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">{t('changePassword.newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-border
                             text-text-primary placeholder:text-text-muted
                             focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-1">{t('changePassword.confirmNewPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                  className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-border
                             text-text-primary placeholder:text-text-muted
                             focus:outline-none focus:border-accent/50"
                />
              </div>
              {error && (
                <div className="text-[11px] text-error">{error}</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs
                         text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-md text-xs font-medium
                         bg-accent/20 text-accent hover:bg-accent/30 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('changePassword.saving') : t('common.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
