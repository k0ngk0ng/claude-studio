import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRemoteStore } from '../../stores/remoteStore';

/**
 * Full-screen lock overlay shown when desktop is being remotely controlled.
 * Displays a 6-digit PIN input for unlocking.
 */
export function LockOverlay() {
  const { controlMode, controllingDeviceId, controllingDeviceName, tryUnlock, unlockError } = useRemoteStore();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount and when locked
  useEffect(() => {
    if (controlMode === 'remote' || controlMode === 'unlocking') {
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [controlMode]);

  // Reset digits on error
  useEffect(() => {
    if (unlockError) {
      setShakeKey((k) => k + 1);
      setTimeout(() => {
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }, 400);
    }
  }, [unlockError]);

  const handleDigitChange = useCallback((index: number, value: string) => {
    // Only allow single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (digit && index === 5) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = digit;
        const password = next.join('');
        if (password.length === 6) {
          handleUnlock(password);
        }
        return next;
      });
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setDigits((prev) => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
    }
  }, [digits]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = [...digits];
      for (let i = 0; i < pasted.length && i < 6; i++) {
        newDigits[i] = pasted[i];
      }
      setDigits(newDigits);
      if (pasted.length === 6) {
        handleUnlock(pasted);
      } else {
        inputRefs.current[Math.min(pasted.length, 5)]?.focus();
      }
    }
  }, [digits]);

  const handleUnlock = async (password: string) => {
    setIsUnlocking(true);
    await tryUnlock(password);
    setIsUnlocking(false);
  };

  if (controlMode !== 'remote' && controlMode !== 'unlocking') {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
      // Block all mouse events from reaching the app
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex flex-col items-center gap-6 max-w-sm mx-auto px-8">
        {/* Lock icon */}
        <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-accent">
            <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M8 11V7a4 4 0 118 0v4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16" r="1.5" fill="currentColor" />
          </svg>
        </div>

        {/* Title */}
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Remote Control Active</h2>
          <p className="text-sm text-white/60">
            This desktop is being controlled by
            <br />
            <span className="text-accent font-medium">
              {controllingDeviceName || 'a mobile device'}
            </span>
            {controllingDeviceId && (
              <>
                <br />
                <span className="text-white/30 text-xs font-mono">
                  {controllingDeviceId}
                </span>
              </>
            )}
          </p>
        </div>

        {/* PIN input */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs text-white/50">Enter 6-digit unlock password</p>
          <div
            key={shakeKey}
            className={`flex gap-2 ${unlockError ? 'animate-shake' : ''}`}
          >
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                disabled={isUnlocking}
                className="w-11 h-14 text-center text-xl font-mono font-bold
                           bg-white/10 border border-white/20 rounded-lg
                           text-white outline-none
                           focus:border-accent focus:bg-white/15
                           transition-colors
                           disabled:opacity-50"
                autoComplete="off"
              />
            ))}
          </div>

          {/* Error message */}
          {unlockError && (
            <p className="text-xs text-error">{unlockError}</p>
          )}

          {isUnlocking && (
            <p className="text-xs text-white/50">Verifying…</p>
          )}
        </div>

        {/* Hint */}
        <p className="text-xs text-white/30 text-center mt-4">
          Default password: 666666
          <br />
          Change it in Settings → Security
        </p>
      </div>
    </div>
  );
}
