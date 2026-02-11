import React, { useEffect, useState, useCallback } from 'react';
import { debugLog } from '../../stores/debugLogStore';
import { useUpdateStore } from '../../stores/updateStore';
import type { UpdateStatus } from '../../stores/updateStore';

interface ReleaseInfo {
  version: string;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  assets: { name: string; size: number; downloadUrl: string; cdnUrl?: string | null }[];
}

type InstallStatus = 'idle' | 'installing' | 'success' | 'error';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getPlatformAsset(assets: ReleaseInfo['assets'], platform: string): ReleaseInfo['assets'][0] | null {
  if (platform === 'mac') {
    return assets.find(a => a.name.endsWith('.dmg'))
      || assets.find(a => a.name.includes('darwin') || a.name.includes('mac'))
      || null;
  } else if (platform === 'windows') {
    // Squirrel.Windows produces "Setup.exe"; prefer that over .nupkg / RELEASES
    return assets.find(a => a.name.toLowerCase().includes('setup') && a.name.endsWith('.exe'))
      || assets.find(a => a.name.endsWith('.exe'))
      || assets.find(a => a.name.endsWith('.msi'))
      || assets.find(a => a.name.includes('win'))
      || null;
  } else {
    return assets.find(a => a.name.endsWith('.deb'))
      || assets.find(a => a.name.endsWith('.AppImage'))
      || assets.find(a => a.name.endsWith('.rpm'))
      || assets.find(a => a.name.includes('linux'))
      || null;
  }
}

// Spinning loader icon
function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={`animate-spin ${className}`}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" className="text-border" />
      <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent" />
    </svg>
  );
}

// Check icon
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-success">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 8l2 2 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Warning icon
function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-warning">
      <path d="M8 1.5L1 14h14L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 6v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}

interface VersionRowProps {
  label: string;
  sublabel: string;
  version: string;
  notFoundLabel?: string;
  installStatus?: InstallStatus;
  installError?: string;
  installMessage?: string;
  onInstall?: () => void;
}

function VersionRow({
  label,
  sublabel,
  version,
  notFoundLabel,
  installStatus,
  installError,
  installMessage,
  onInstall,
}: VersionRowProps) {
  const isNotFound = version === 'not found' || version === 'not installed';
  const isLoading = !version;

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        <div className="text-xs text-text-muted mt-0.5">{sublabel}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isLoading ? (
          <span className="text-sm font-mono text-text-muted">…</span>
        ) : isNotFound ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-warning">{notFoundLabel || 'Not installed'}</span>
            {onInstall && installStatus === 'idle' && (
              <button
                onClick={onInstall}
                className="px-2.5 py-1 rounded-md bg-accent text-white text-xs font-medium
                           hover:bg-accent/90 transition-colors"
              >
                Install
              </button>
            )}
            {installStatus === 'installing' && (
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Spinner />
                <span>Installing…</span>
              </div>
            )}
            {installStatus === 'success' && (
              <div className="flex items-center gap-1.5 text-xs text-success">
                <CheckIcon />
                <span>{installMessage || 'Installed'}</span>
              </div>
            )}
            {installStatus === 'error' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-error truncate max-w-[200px]" title={installError}>
                  {installError || 'Failed'}
                </span>
                {onInstall && (
                  <button
                    onClick={onInstall}
                    className="px-2 py-0.5 rounded text-xs text-text-muted hover:text-text-primary
                               border border-border hover:border-border-light transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm font-mono text-text-muted">{version}</span>
        )}
      </div>
    </div>
  );
}

export function AboutSection() {
  const [version, setVersion] = useState('');
  const [sdkVersion, setSdkVersion] = useState('');
  const [claudeCodeVersion, setClaudeCodeVersion] = useState('');
  const [gitVersion, setGitVersion] = useState('');
  const [platform, setPlatform] = useState('');

  // Global update state — persists across page navigation
  const { status: updateStatus, setStatus: setUpdateStatus, updateProgress } = useUpdateStore();

  // Install states
  const [claudeCodeInstall, setClaudeCodeInstall] = useState<{
    status: InstallStatus;
    error?: string;
    message?: string;
  }>({ status: 'idle' });
  const [gitInstall, setGitInstall] = useState<{
    status: InstallStatus;
    error?: string;
    message?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    window.api.app.getVersion().then(setVersion).catch(() => {});
    window.api.app.getAgentSdkVersion().then(setSdkVersion).catch(() => {});
    window.api.app.getClaudeCodeVersion().then(setClaudeCodeVersion).catch(() => {});
    window.api.app.getGitVersion().then(setGitVersion).catch(() => {});
    window.api.app.getPlatform().then(setPlatform).catch(() => {});
  }, []);

  // Download progress listener — uses global store to survive navigation
  useEffect(() => {
    const handleProgress = (data: { downloaded: number; totalSize: number; progress: number }) => {
      updateProgress(data);
    };
    window.api.app.onDownloadProgress(handleProgress);
    return () => {
      window.api.app.removeDownloadProgressListener(handleProgress);
    };
  }, [updateProgress]);

  const handleCheckForUpdates = useCallback(async () => {
    setUpdateStatus({ state: 'checking' });
    debugLog('app', 'Checking for updates...');
    try {
      const release = await window.api.app.checkForUpdates();
      debugLog('app', `Latest release: ${release.version} (${release.tagName})`, release);
      if (!release.version || release.version === version) {
        debugLog('app', `Already up to date: ${version}`);
        setUpdateStatus({ state: 'up-to-date' });
      } else {
        const current = version.split('.').map(Number);
        const latest = release.version.split('.').map(Number);
        let isNewer = false;
        for (let i = 0; i < 3; i++) {
          if ((latest[i] || 0) > (current[i] || 0)) { isNewer = true; break; }
          if ((latest[i] || 0) < (current[i] || 0)) break;
        }
        if (isNewer) {
          debugLog('app', `New version available: ${version} → ${release.version}`);
          setUpdateStatus({ state: 'available', release });
        } else {
          debugLog('app', `Already up to date: ${version} >= ${release.version}`);
          setUpdateStatus({ state: 'up-to-date' });
        }
      }
    } catch (err: any) {
      debugLog('app', `Update check failed: ${err?.message}`, err, 'error');
      setUpdateStatus({ state: 'error', message: err?.message || 'Failed to check for updates' });
    }
  }, [version]);

  const handleDownload = useCallback(async () => {
    if (updateStatus.state !== 'available') return;
    const { release } = updateStatus;
    const asset = getPlatformAsset(release.assets, platform);
    if (!asset) {
      debugLog('app', `No download asset for ${platform}`, release.assets, 'error');
      setUpdateStatus({ state: 'error', message: `No download available for ${platform}. Visit the release page to download manually.` });
      return;
    }

    setUpdateStatus({ state: 'downloading', progress: 0, downloaded: 0, totalSize: asset.size, source: asset.cdnUrl ? 'CDN' : 'GitHub' });

    // Try CDN first, fallback to GitHub
    if (asset.cdnUrl) {
      debugLog('app', `Downloading from CDN: ${asset.cdnUrl}`);
      try {
        const filePath = await window.api.app.downloadUpdate(asset.cdnUrl, asset.name);
        debugLog('app', `CDN download complete: ${filePath}`);
        setUpdateStatus({ state: 'downloaded', filePath });
        return;
      } catch (err: any) {
        debugLog('app', `CDN download failed, falling back to GitHub: ${err?.message}`, err, 'warn');
        // Reset progress for GitHub retry
        setUpdateStatus({ state: 'downloading', progress: 0, downloaded: 0, totalSize: asset.size, source: 'GitHub' });
      }
    }

    // Fallback: download from GitHub
    debugLog('app', `Downloading from GitHub: ${asset.name} (${formatBytes(asset.size)})`);
    try {
      const filePath = await window.api.app.downloadUpdate(asset.downloadUrl, asset.name);
      debugLog('app', `GitHub download complete: ${filePath}`);
      setUpdateStatus({ state: 'downloaded', filePath });
    } catch (err: any) {
      debugLog('app', `Download failed: ${err?.message}`, err, 'error');
      setUpdateStatus({ state: 'error', message: err?.message || 'Download failed' });
    }
  }, [updateStatus, platform]);

  const handleInstall = useCallback(async () => {
    if (updateStatus.state !== 'downloaded') return;
    await window.api.app.installUpdate(updateStatus.filePath);
  }, [updateStatus]);

  const handleInstallClaudeCode = useCallback(async () => {
    setClaudeCodeInstall({ status: 'installing' });
    debugLog('app', 'Installing Claude Code...');
    try {
      const result = await window.api.app.installClaudeCode();
      if (result.success) {
        debugLog('app', 'Claude Code installed successfully');
        setClaudeCodeInstall({ status: 'success', message: result.message });
        // Re-check version
        const ver = await window.api.app.getClaudeCodeVersion();
        setClaudeCodeVersion(ver);
      } else {
        debugLog('app', `Claude Code install failed: ${result.error}`, result, 'error');
        setClaudeCodeInstall({ status: 'error', error: result.error });
      }
    } catch (err: any) {
      debugLog('app', `Claude Code install error: ${err?.message}`, err, 'error');
      setClaudeCodeInstall({ status: 'error', error: err?.message || 'Install failed' });
    }
  }, []);

  const handleInstallGit = useCallback(async () => {
    setGitInstall({ status: 'installing' });
    debugLog('app', `Installing Git (${platform})...`);
    try {
      const result = await window.api.app.installGit();
      if (result.success) {
        debugLog('app', 'Git install triggered', result);
        if (result.message) {
          // For Mac (xcode-select) and Windows (browser), show the message
          setGitInstall({ status: 'success', message: result.message });
        } else {
          setGitInstall({ status: 'success', message: 'Installed' });
          // Re-check version
          const ver = await window.api.app.getGitVersion();
          setGitVersion(ver);
        }
      } else {
        debugLog('app', `Git install failed: ${result.error}`, result, 'error');
        setGitInstall({ status: 'error', error: result.error });
      }
    } catch (err: any) {
      debugLog('app', `Git install error: ${err?.message}`, err, 'error');
      setGitInstall({ status: 'error', error: err?.message || 'Install failed' });
    }
  }, [platform]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">About</h2>
      <p className="text-sm text-text-muted mb-6">
        Version information and updates.
      </p>

      <div className="space-y-6">
        {/* App icon + name */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-accent"
              />
            </svg>
          </div>
          <div>
            <div className="text-lg font-semibold text-text-primary">ClaudeStudio</div>
            <div className="text-sm text-text-muted">A desktop client for Claude Code</div>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Version rows — ordered: App → SDK → Claude Code → Git */}
        <div className="space-y-3">
          <VersionRow
            label="App Version"
            sublabel="ClaudeStudio"
            version={version}
          />

          <VersionRow
            label="Claude Agent SDK"
            sublabel="@anthropic-ai/claude-agent-sdk"
            version={sdkVersion}
          />

          <VersionRow
            label="Claude Code"
            sublabel="@anthropic-ai/claude-code"
            version={claudeCodeVersion}
            notFoundLabel="Not installed"
            installStatus={claudeCodeInstall.status}
            installError={claudeCodeInstall.error}
            installMessage={claudeCodeInstall.message}
            onInstall={handleInstallClaudeCode}
          />

          <VersionRow
            label="Git"
            sublabel={platform === 'mac' ? 'Xcode Command Line Tools / Homebrew' : platform === 'windows' ? 'Git for Windows' : 'git'}
            version={gitVersion}
            notFoundLabel="Not installed"
            installStatus={gitInstall.status}
            installError={gitInstall.error}
            installMessage={gitInstall.message}
            onInstall={handleInstallGit}
          />
        </div>

        <div className="border-t border-border" />

        {/* Update section */}
        <div>
          <div className="text-sm font-medium text-text-primary mb-3">Updates</div>

          {updateStatus.state === 'idle' && (
            <button
              onClick={handleCheckForUpdates}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium
                         hover:bg-accent/90 transition-colors"
            >
              Check for Updates
            </button>
          )}

          {updateStatus.state === 'checking' && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Spinner />
              Checking for updates…
            </div>
          )}

          {updateStatus.state === 'up-to-date' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckIcon />
                You're on the latest version
              </div>
              <button
                onClick={handleCheckForUpdates}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Check again
              </button>
            </div>
          )}

          {updateStatus.state === 'available' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-surface border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-text-primary">
                    {updateStatus.release.name || `v${updateStatus.release.version}`}
                  </span>
                  <span className="text-xs font-mono text-accent">
                    {version} → {updateStatus.release.version}
                  </span>
                </div>
                {updateStatus.release.body && (
                  <p className="text-xs text-text-muted mt-2 whitespace-pre-wrap line-clamp-4">
                    {updateStatus.release.body}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium
                             hover:bg-accent/90 transition-colors"
                >
                  Download & Install
                </button>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.api.app.openExternal(updateStatus.release.htmlUrl);
                  }}
                  className="text-xs text-text-muted hover:text-accent transition-colors"
                >
                  View on GitHub →
                </a>
              </div>
            </div>
          )}

          {updateStatus.state === 'downloading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">
                  Downloading{updateStatus.source ? ` from ${updateStatus.source}` : ''}…
                </span>
                <span className="text-text-muted font-mono text-xs">
                  {formatBytes(updateStatus.downloaded)} / {formatBytes(updateStatus.totalSize)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${updateStatus.progress}%` }}
                />
              </div>
              <div className="text-xs text-text-muted text-right">{updateStatus.progress}%</div>
            </div>
          )}

          {updateStatus.state === 'downloaded' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckIcon />
                Download complete
              </div>
              <button
                onClick={handleInstall}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium
                           hover:bg-accent/90 transition-colors"
              >
                Install & Restart
              </button>
              <div className="text-xs text-text-muted">
                Saved to: {updateStatus.filePath}
              </div>
            </div>
          )}

          {updateStatus.state === 'error' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-error">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                {updateStatus.message}
              </div>
              <button
                onClick={handleCheckForUpdates}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-border" />

        {/* Links */}
        <div className="space-y-2">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.api.app.openExternal('https://github.com/k0ngk0ng/claude-studio');
            }}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M9 2h5v5M14 2L7 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            GitHub Repository
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.api.app.openExternal('https://github.com/k0ngk0ng/claude-studio/releases');
            }}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M9 2h5v5M14 2L7 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All Releases
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.api.app.openExternal('https://github.com/k0ngk0ng/claude-studio/issues');
            }}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M9 2h5v5M14 2L7 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Report an Issue
          </a>
        </div>
      </div>
    </div>
  );
}
