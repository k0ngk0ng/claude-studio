import React, { useEffect, useState, useRef } from 'react';

type BootstrapState = 'checking' | 'installing' | 'ready' | 'error';

interface BootstrapScreenProps {
  onReady: () => void;
}

export function BootstrapScreen({ onReady }: BootstrapScreenProps) {
  const [state, setState] = useState<BootstrapState>('checking');
  const [statusText, setStatusText] = useState('Checking dependencies…');
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    let cancelled = false;

    const progressCallback = (data: string) => {
      if (!cancelled) {
        setLogs((prev) => [...prev.slice(-100), data]);
      }
    };

    async function bootstrap() {
      try {
        // Step 1: Check if runtime deps are available
        setStatusText('Checking runtime dependencies…');
        const deps = await window.api.app.checkRuntimeDeps();
        const missing = deps.filter((d) => !d.found);

        if (missing.length === 0) {
          // All good — proceed
          if (!cancelled) {
            setState('ready');
            onReady();
          }
          return;
        }

        // Step 2: Install missing deps
        if (!cancelled) {
          setState('installing');
          setStatusText(
            `Installing ${missing.map((d) => d.name).join(', ')}…`
          );

          // Listen for progress
          window.api.app.onInstallProgress(progressCallback);

          const result = await window.api.app.installRuntimeDeps();

          window.api.app.removeInstallProgressListener(progressCallback);

          if (result.success) {
            setStatusText('Dependencies installed successfully!');
            // Brief pause to show success
            await new Promise((r) => setTimeout(r, 1000));
            if (!cancelled) {
              setState('ready');
              onReady();
            }
          } else {
            if (!cancelled) {
              setState('error');
              setErrorMsg(result.error || 'Unknown installation error');
              setStatusText('Failed to install dependencies');
            }
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setState('error');
          setErrorMsg(err?.message || String(err));
          setStatusText('Failed to check dependencies');
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      window.api.app.removeInstallProgressListener(progressCallback);
    };
  }, [onReady]);

  // If ready, render nothing (parent will show the app)
  if (state === 'ready') return null;

  return (
    <div className="fixed inset-0 bg-bg-primary flex items-center justify-center z-50">
      <div className="max-w-md w-full mx-4">
        {/* Logo / Icon */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Claude App</h1>
        </div>

        {/* Status */}
        <div className="text-center mb-6">
          <p className="text-sm text-text-muted">{statusText}</p>
        </div>

        {/* Spinner for checking/installing */}
        {(state === 'checking' || state === 'installing') && (
          <div className="flex justify-center mb-6">
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
          </div>
        )}

        {/* Install logs */}
        {state === 'installing' && logs.length > 0 && (
          <div className="bg-bg-secondary rounded-lg border border-border p-3 max-h-40 overflow-y-auto font-mono text-xs text-text-muted">
            {logs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-red-400 font-mono break-all">{errorMsg}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-text-muted mb-3">
                Please install the dependencies manually:
              </p>
              <code className="block bg-bg-secondary rounded px-3 py-2 text-xs text-text-secondary font-mono">
                npm install @anthropic-ai/claude-agent-sdk node-pty
              </code>
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => {
                  setState('checking');
                  setStatusText('Retrying…');
                  setLogs([]);
                  setErrorMsg('');
                  // Re-trigger by remounting — simplest approach
                  window.location.reload();
                }}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
