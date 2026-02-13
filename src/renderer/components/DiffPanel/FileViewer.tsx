import React, { useEffect, useState, useMemo, useRef } from 'react';
import hljs from 'highlight.js';
import { SearchBar } from './SearchBar';
import { useSettingsStore } from '../../stores/settingsStore';

interface FileViewerProps {
  filePath: string;
  projectPath: string;
  onClose: () => void;
}

const EXT_LANG_MAP: Record<string, string> = {
  // JavaScript / TypeScript
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  mjs: 'javascript', cjs: 'javascript', mts: 'typescript', cts: 'typescript',
  // Web
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', xsl: 'xml',
  css: 'css', scss: 'scss', less: 'less', sass: 'scss', styl: 'stylus',
  // Data / Config
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini',
  env: 'bash', properties: 'properties',
  // Markdown / Docs
  md: 'markdown', mdx: 'markdown', txt: 'plaintext', rst: 'plaintext',
  // Shell
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', ps1: 'powershell',
  bat: 'dos', cmd: 'dos',
  // Python
  py: 'python', pyw: 'python', pyi: 'python',
  // Ruby
  rb: 'ruby', erb: 'erb', rake: 'ruby', gemspec: 'ruby',
  // Rust
  rs: 'rust',
  // Go
  go: 'go', mod: 'go',
  // Java / JVM
  java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', groovy: 'groovy',
  gradle: 'groovy', clj: 'clojure', cljs: 'clojure',
  // C / C++
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
  // C# / .NET
  cs: 'csharp', fs: 'fsharp', fsx: 'fsharp', vb: 'vbnet',
  // Apple
  swift: 'swift', m: 'objectivec', mm: 'objectivec',
  // PHP
  php: 'php',
  // SQL
  sql: 'sql',
  // GraphQL
  graphql: 'graphql', gql: 'graphql',
  // Elixir / Erlang
  ex: 'elixir', exs: 'elixir', erl: 'erlang', hrl: 'erlang',
  // Haskell
  hs: 'haskell', lhs: 'haskell',
  // Lua
  lua: 'lua',
  // Perl
  pl: 'perl', pm: 'perl',
  // R
  r: 'r',
  // Dart / Flutter
  dart: 'dart',
  // Zig / Nim
  zig: 'zig', nim: 'nim',
  // OCaml / ReasonML
  ml: 'ocaml', mli: 'ocaml', re: 'reasonml', rei: 'reasonml',
  // Frameworks
  vue: 'xml', svelte: 'xml', astro: 'xml',
  // Build / DevOps
  dockerfile: 'dockerfile', makefile: 'makefile',
  tf: 'hcl', hcl: 'hcl',
  nix: 'nix',
  // Misc
  proto: 'protobuf', thrift: 'thrift',
  tex: 'latex', latex: 'latex',
  diff: 'diff', patch: 'diff',
  nginx: 'nginx', conf: 'nginx',
  cmake: 'cmake',
  asm: 'x86asm', s: 'x86asm',
  wasm: 'wasm',
};

function getLanguage(filePath: string): string | undefined {
  const name = filePath.split('/').pop()?.toLowerCase() || '';
  // Special filenames
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile';
  if (name === 'makefile' || name === 'gnumakefile') return 'makefile';
  if (name === 'cmakelists.txt') return 'cmake';
  if (name === 'gemfile' || name === 'rakefile' || name === 'vagrantfile') return 'ruby';
  if (name === '.gitignore' || name === '.dockerignore' || name === '.env') return 'bash';
  if (name === 'nginx.conf') return 'nginx';
  const ext = name.split('.').pop() || '';
  return EXT_LANG_MAP[ext];
}

export function FileViewer({ filePath, projectPath, onClose }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { showLineNumbers, editorFontSize, editorFontFamily } = useSettingsStore(
    (s) => s.settings.appearance
  );

  const fullPath = filePath.startsWith('/') ? filePath : `${projectPath}/${filePath}`;
  const fileName = filePath.split('/').pop() || filePath;
  const relativePath = filePath.startsWith('/') ? filePath.replace(projectPath + '/', '') : filePath;

  useEffect(() => {
    setLoading(true);
    setError(null);
    window.api.file.read(fullPath).then((result) => {
      if (result.error) {
        setError(result.error);
      } else {
        setContent(result.content || '');
      }
      setLoading(false);
    });
  }, [fullPath]);

  const highlighted = useMemo(() => {
    if (!content) return null;
    const lang = getLanguage(filePath);
    try {
      if (lang) {
        return hljs.highlight(content, { language: lang }).value;
      }
      return hljs.highlightAuto(content).value;
    } catch {
      return null;
    }
  }, [content, filePath]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSearch) onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, showSearch]);

  const lines = content?.split('\n') || [];

  return (
    <div className="fixed inset-0 top-12 z-50 flex flex-col bg-bg" onClick={onClose}>
      <div
        className="flex flex-col w-full h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-text-muted">
              <path d="M3 1.5h6.5L13 5v9.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-13a1 1 0 011-1z"
                stroke="currentColor" strokeWidth="1.2" />
              <path d="M9.5 1.5V5H13" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span className="text-sm font-medium text-text-primary truncate">{fileName}</span>
            <span className="text-xs text-text-muted truncate">{relativePath}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        {showSearch && (
          <SearchBar
            containerRef={contentRef}
            onClose={() => setShowSearch(false)}
          />
        )}

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              Loading…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              {error === 'Binary file' ? 'Binary file — cannot display' : error}
            </div>
          )}
          {!loading && !error && content !== null && (
            <div
              className="flex font-mono leading-relaxed"
              style={{ fontSize: editorFontSize, fontFamily: editorFontFamily }}
            >
              {/* Line numbers */}
              {showLineNumbers && (
                <div className="shrink-0 select-none text-right pr-3 pl-3 py-2 text-text-muted/40 bg-surface/50 border-r border-border">
                  {lines.map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
              )}
              {/* Code */}
              <div className="flex-1 overflow-x-auto py-2 pl-4 pr-4">
                {highlighted ? (
                  <pre className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
                ) : (
                  <pre className="text-text-primary whitespace-pre">{content}</pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-border text-[11px] text-text-muted bg-surface shrink-0">
          <span>{lines.length} lines</span>
          <span>{getLanguage(filePath) || 'plain text'}</span>
        </div>
      </div>
    </div>
  );
}
