import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { SuggestionCards } from './SuggestionCards';
import type { DependencyStatus } from '../../types';

export function WelcomeScreen() {
  const { currentProject } = useAppStore();
  const [missingDeps, setMissingDeps] = useState<DependencyStatus[]>([]);

  useEffect(() => {
    window.api.app.checkDependencies().then((deps) => {
      setMissingDeps(deps.filter((d) => !d.found));
    }).catch(() => {});
  }, []);

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
          What can I help you build?
        </h1>

        {/* Project name */}
        {currentProject.name && (
          <p className="text-sm text-text-muted mb-8">
            Working in{' '}
            <span className="text-text-secondary font-medium">
              {currentProject.name}
            </span>
            {currentProject.branch && (
              <>
                {' '}
                on{' '}
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
                <div>
                  <div className="text-sm font-medium text-text-primary">
                    {dep.name} not found
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Install: <code className="px-1.5 py-0.5 rounded bg-surface text-text-secondary font-mono text-[11px]">{dep.installHint}</code>
                  </div>
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
