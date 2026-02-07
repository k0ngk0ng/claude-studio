import React from 'react';

interface Suggestion {
  icon: React.ReactNode;
  title: string;
  description: string;
  prompt: string;
}

const suggestions: Suggestion[] = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
          d="M2 4.5h12M2 8h12M2 11.5h8"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
    title: 'Explain this codebase',
    description: 'Get an overview of the project structure and architecture',
    prompt:
      'Give me a high-level overview of this codebase. What are the main components, how is it structured, and what does it do?',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
          d="M10 2L6 14M4.5 4.5L1.5 8l3 3.5M11.5 4.5l3 3.5-3 3.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: 'Fix a bug',
    description: 'Describe a bug and get help debugging and fixing it',
    prompt: 'I have a bug where ',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 3v10M3 8h10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    title: 'Add a feature',
    description: 'Describe a feature and get implementation help',
    prompt: 'I want to add a feature that ',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 8l2.5 2.5L12 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="1.5"
          y="1.5"
          width="13"
          height="13"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    ),
    title: 'Write tests',
    description: 'Generate unit tests, integration tests, or E2E tests',
    prompt:
      'Write comprehensive tests for this project. Focus on the most critical functionality first.',
  },
];

interface SuggestionCardsProps {
  onSelect?: (prompt: string) => void;
}

export function SuggestionCards({ onSelect }: SuggestionCardsProps) {
  const handleClick = (prompt: string) => {
    if (onSelect) {
      onSelect(prompt);
    } else {
      // Dispatch a custom event that InputBar can listen to
      window.dispatchEvent(
        new CustomEvent('suggestion-selected', { detail: { prompt } })
      );
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.title}
          onClick={() => handleClick(suggestion.prompt)}
          className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border
                     bg-surface hover:bg-surface-hover hover:border-border-light
                     transition-all duration-150 text-left group"
        >
          <div className="text-text-muted group-hover:text-accent transition-colors">
            {suggestion.icon}
          </div>
          <div>
            <div className="text-sm font-medium text-text-primary mb-0.5">
              {suggestion.title}
            </div>
            <div className="text-xs text-text-muted leading-relaxed">
              {suggestion.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
