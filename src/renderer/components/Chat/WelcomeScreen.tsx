import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../stores/appStore';
import { SuggestionCards } from './SuggestionCards';
import type { DependencyStatus } from '../../types';

type InstallStatus = 'idle' | 'installing' | 'success' | 'error';

export function WelcomeScreen() {
  const { t } = useTranslation();
  const { currentProject } = useAppStore();
  const [missingDeps, setMissingDeps] = useState<DependencyStatus[]>([]);
  const [claudeCodeInstall, setClaudeCodeInstall] = useState<{
    status: InstallStatus;
    error?: string;
    message?: string;
  }>({ status: 'idle' });

  const recheckDeps = useCallback(() => {
    window.api.app.checkDependencies().then((deps) => {
      setMissingDeps(deps.filter((d) => !d.found));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    const check = (attempt: number) => {
      window.api.app.checkDependencies().then((deps) => {
        if (cancelled) return;
        const missing = deps.filter((d) => !d.found);
        setMissingDeps(missing);
        // Retry up to 2 more times if deps are missing (PATH may not be ready yet)
        if (missing.length > 0 && attempt < 3) {
          retryTimer = setTimeout(() => check(attempt + 1), 2000);
        }
      }).catch(() => {});
    };

    check(1);
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  const handleInstallClaudeCode = useCallback(async () => {
    setClaudeCodeInstall({ status: 'installing' });
    try {
      const result = await window.api.app.installClaudeCode();
      if (result.success) {
        setClaudeCodeInstall({ status: 'success', message: result.message });
        recheckDeps();
      } else {
        setClaudeCodeInstall({ status: 'error', error: result.error });
      }
    } catch (err: any) {
      setClaudeCodeInstall({ status: 'error', error: err?.message || 'Install failed' });
    }
  }, [recheckDeps]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full text-center">
        {/* Claude icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/15 flex items-center justify-center mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            />
            <path
              d="M2 17l10 5 10-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            />
            <path
              d="M2 12l10 5 10-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-semibold text-text-primary mb-2">
          {t('welcome.title')}
        </h1>

        {/* Project name */}
        {currentProject.name && (
          <p className="text-sm text-text-muted mb-8">
            {t('welcome.workingIn')}{' '}
            <span className="text-text-secondary font-medium">
              {currentProject.name}
            </span>
            {currentProject.branch && (
              <>
                {' '}
                {t('welcome.on')}{' '}
                <span className="text-text-secondary font-mono text-xs">
                  {currentProject.branch}
                </span>
              </>
            )}
          </p>
        )}

        {/* Missing dependencies warning */}
        {missingDeps.length > 0 && (
          <div className="mb-6 text-left">
            {missingDeps.map((dep) => (
              <div
                key={dep.name}
                className="flex items-start gap-3 px-4 py-3 rounded-lg bg-error/10 border border-error/20 mb-2"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5 text-error">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 4.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="8" cy="11" r="0.75" fill="currentColor" />
                </svg>
                <div className="flex-1">
                  <div className="text-sm font-medium text-text-primary">
                    {dep.name} {t('welcome.notFound')}
                  </div>
                  {dep.name === 'Claude Code CLI' && dep.npmAvailable !== false ? (
                    <div className="mt-2">
                      {claudeCodeInstall.status === 'idle' && (
                        <button
                          onClick={handleInstallClaudeCode}
                          className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium
                                     hover:bg-accent/90 transition-colors"
                        >
                          {t('welcome.installClaudeCode')}
                        </button>
                      )}
                      {claudeCodeInstall.status === 'installing' && (
                        <div className="flex items-center gap-1.5 text-xs text-text-muted">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="animate-spin">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" className="text-border" />
                            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent" />
                          </svg>
                          <span>{t('welcome.installing')}</span>
                        </div>
                      )}
                      {claudeCodeInstall.status === 'success' && (
                        <div className="flex items-center gap-1.5 text-xs text-success">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                            <path d="M5.5 8l2 2 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>{claudeCodeInstall.message || t('welcome.installSuccess')}</span>
                        </div>
                      )}
                      {claudeCodeInstall.status === 'error' && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-error truncate max-w-[200px]" title={claudeCodeInstall.error}>
                            {claudeCodeInstall.error || t('welcome.installError')}
                          </span>
                          <button
                            onClick={handleInstallClaudeCode}
                            className="px-2 py-0.5 rounded text-xs text-text-muted hover:text-text-primary
                                       border border-border hover:border-border-light transition-colors"
                          >
                            {t('welcome.retry')}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-text-muted mt-0.5">
                      {t('welcome.install')}: <code className="px-1.5 py-0.5 rounded bg-surface text-text-secondary font-mono text-[11px]">{dep.installHint}</code>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Suggestion cards */}
        <SuggestionCards />
      </div>
    </div>
  );
}
