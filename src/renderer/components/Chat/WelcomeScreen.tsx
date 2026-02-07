import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { SuggestionCards } from './SuggestionCards';

export function WelcomeScreen() {
  const { currentProject } = useAppStore();

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

        {/* Suggestion cards */}
        <SuggestionCards />
      </div>
    </div>
  );
}
