import { useState, useEffect, useCallback, useRef } from 'react';

interface ChatSearchProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export function ChatSearch({ containerRef, onClose }: ChatSearchProps) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState(0);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Clear highlights on unmount
  useEffect(() => {
    return () => clearHighlights();
  }, []);

  const clearHighlights = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const marks = container.querySelectorAll('mark.search-highlight');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      }
    });
  }, [containerRef]);

  const highlightMatches = useCallback((searchText: string) => {
    clearHighlights();
    if (!searchText.trim()) {
      setMatches(0);
      setCurrent(0);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip nodes inside the search bar itself
          const el = node.parentElement;
          if (el?.closest('.chat-search-bar')) return NodeFilter.FILTER_REJECT;
          // Skip script/style
          const tag = el?.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    const lowerSearch = searchText.toLowerCase();
    let totalMatches = 0;

    for (const textNode of textNodes) {
      const text = textNode.textContent || '';
      const lowerText = text.toLowerCase();
      if (!lowerText.includes(lowerSearch)) continue;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let idx = lowerText.indexOf(lowerSearch, lastIdx);

      while (idx !== -1) {
        // Text before match
        if (idx > lastIdx) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
        }
        // Highlighted match
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.dataset.matchIndex = String(totalMatches);
        mark.textContent = text.slice(idx, idx + searchText.length);
        frag.appendChild(mark);
        totalMatches++;
        lastIdx = idx + searchText.length;
        idx = lowerText.indexOf(lowerSearch, lastIdx);
      }

      // Remaining text
      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      }

      textNode.parentNode?.replaceChild(frag, textNode);
    }

    setMatches(totalMatches);
    if (totalMatches > 0) {
      setCurrent(1);
      scrollToMatch(0);
    } else {
      setCurrent(0);
    }
  }, [containerRef, clearHighlights]);

  const scrollToMatch = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;

    // Remove active class from all
    container.querySelectorAll('mark.search-active').forEach((m) => {
      m.classList.remove('search-active');
    });

    const mark = container.querySelector(`mark[data-match-index="${index}"]`);
    if (mark) {
      mark.classList.add('search-active');
      mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [containerRef]);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    highlightMatches(value);
  }, [highlightMatches]);

  const goNext = useCallback(() => {
    if (matches === 0) return;
    const next = current < matches ? current + 1 : 1;
    setCurrent(next);
    scrollToMatch(next - 1);
  }, [current, matches, scrollToMatch]);

  const goPrev = useCallback(() => {
    if (matches === 0) return;
    const prev = current > 1 ? current - 1 : matches;
    setCurrent(prev);
    scrollToMatch(prev - 1);
  }, [current, matches, scrollToMatch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        goPrev();
      } else {
        goNext();
      }
    }
  };

  return (
    <div className="chat-search-bar absolute top-0 right-4 z-50 flex items-center gap-1.5
                    bg-surface border border-border rounded-lg shadow-lg px-3 py-1.5 mt-2">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search in chat…"
        className="bg-transparent text-xs text-text-primary placeholder-text-muted
                   outline-none w-48"
      />
      {query && (
        <span className="text-[10px] text-text-muted whitespace-nowrap">
          {matches > 0 ? `${current}/${matches}` : 'No results'}
        </span>
      )}
      <button
        onClick={goPrev}
        disabled={matches === 0}
        className="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary
                   disabled:opacity-30 disabled:cursor-not-allowed"
        title="Previous (Shift+Enter)"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        onClick={goNext}
        disabled={matches === 0}
        className="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary
                   disabled:opacity-30 disabled:cursor-not-allowed"
        title="Next (Enter)"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        onClick={onClose}
        className="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary ml-0.5"
        title="Close (Esc)"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
