import React, { useEffect, useState, useCallback } from 'react';
import { debugLog } from '../../stores/debugLogStore';

interface ReleaseInfo {
  version: string;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  assets: { name: string; size: number; downloadUrl: string }[];
}

type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; release: ReleaseInfo }
  | { state: 'downloading'; progress: number; downloaded: number; totalSize: number }
  | { state: 'downloaded'; filePath: string }
  | { state: 'error'; message: string };

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
    return assets.find(a => a.name.endsWith('.exe') || a.name.endsWith('.msi'))
      || assets.find(a => a.name.includes('win'))
      || null;
  } else {
    return assets.find(a => a.name.endsWith('.AppImage') || a.name.endsWith('.deb'))
      || assets.find(a => a.name.includes('linux'))
      || null;
  }
}

export function AboutSection() {
  const [version, setVersion] = useState('');
  const [sdkVersion, setSdkVersion] = useState('');
  const [claudeCodeVersion, setClaudeCodeVersion] = useState('');
  const [platform, setPlatform] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [downloadFilePath, setDownloadFilePath] = useState('');

  useEffect(() => {
    window.api.app.getVersion().then(setVersion).catch(() => {});
    window.api.app.getAgentSdkVersion().then(setSdkVersion).catch(() => {});
    window.api.app.getClaudeCodeVersion().then(setClaudeCodeVersion).catch(() => {});
    window.api.app.getPlatform().then(setPlatform).catch(() => {});
  }, []);

  // Download progress listener
  useEffect(() => {
    const handleProgress = (data: { downloaded: number; totalSize: number; progress: number }) => {
      setUpdateStatus({
        state: 'downloading',
        progress: data.progress,
        downloaded: data.downloaded,
        totalSize: data.totalSize,
      });
    };
    window.api.app.onDownloadProgress(handleProgress);
    return () => {
      window.api.app.removeDownloadProgressListener(handleProgress);
    };
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    setUpdateStatus({ state: 'checking' });
    debugLog('app', 'Checking for updates...');
    console.log('[update] Checking for updates...');
    try {
      const release = await window.api.app.checkForUpdates();
      console.log('[update] Latest release:', release.version, release.tagName);
      debugLog('app', `Latest release: ${release.version} (${release.tagName})`, release);
      if (!release.version || release.version === version) {
        console.log('[update] Already up to date:', version);
        debugLog('app', `Already up to date: ${version}`);
        setUpdateStatus({ state: 'up-to-date' });
      } else {
        // Compare versions
        const current = version.split('.').map(Number);
        const latest = release.version.split('.').map(Number);
        let isNewer = false;
        for (let i = 0; i < 3; i++) {
          if ((latest[i] || 0) > (current[i] || 0)) { isNewer = true; break; }
          if ((latest[i] || 0) < (current[i] || 0)) break;
        }
        if (isNewer) {
          console.log('[update] New version available:', version, '->', release.version);
          debugLog('app', `New version available: ${version} → ${release.version}`);
          setUpdateStatus({ state: 'available', release });
        } else {
          console.log('[update] Already up to date:', version, '>=', release.version);
          debugLog('app', `Already up to date: ${version} >= ${release.version}`);
          setUpdateStatus({ state: 'up-to-date' });
        }
      }
    } catch (err: any) {
      console.error('[update] Check failed:', err);
      debugLog('app', `Update check failed: ${err?.message}`, err, 'error');
      setUpdateStatus({ state: 'error', message: err?.message || 'Failed to check for updates' });
    }
  }, [version]);

  const handleDownload = useCallback(async () => {
    if (updateStatus.state !== 'available') return;
    const { release } = updateStatus;
    const asset = getPlatformAsset(release.assets, platform);
    if (!asset) {
      console.error('[update] No asset found for platform:', platform, 'assets:', release.assets);
      debugLog('app', `No download asset for ${platform}`, release.assets, 'error');
      setUpdateStatus({ state: 'error', message: `No download available for ${platform}. Visit the release page to download manually.` });
      return;
    }
    console.log('[update] Downloading:', asset.name, formatBytes(asset.size), asset.downloadUrl);
    debugLog('app', `Downloading: ${asset.name} (${formatBytes(asset.size)})`, asset);
    setUpdateStatus({ state: 'downloading', progress: 0, downloaded: 0, totalSize: asset.size });
    try {
      const filePath = await window.api.app.downloadUpdate(asset.downloadUrl, asset.name);
      console.log('[update] Download complete:', filePath);
      debugLog('app', `Download complete: ${filePath}`);
      setDownloadFilePath(filePath);
      setUpdateStatus({ state: 'downloaded', filePath });
    } catch (err: any) {
      console.error('[update] Download failed:', err);
      debugLog('app', `Download failed: ${err?.message}`, err, 'error');
      setUpdateStatus({ state: 'error', message: err?.message || 'Download failed' });
    }
  }, [updateStatus, platform]);

  const handleInstall = useCallback(async () => {
    if (updateStatus.state !== 'downloaded') return;
    await window.api.app.installUpdate(updateStatus.filePath);
  }, [updateStatus]);

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
            <div className="text-lg font-semibold text-text-primary">Claude App</div>
            <div className="text-sm text-text-muted">A desktop client for Claude Code</div>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Version rows */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">App Version</div>
              <div className="text-xs text-text-muted mt-0.5">Claude App</div>
            </div>
            <span className="text-sm font-mono text-text-muted">{version || '...'}</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Claude Code</div>
              <div className="text-xs text-text-muted mt-0.5">@anthropic-ai/claude-code</div>
            </div>
            <span className="text-sm font-mono text-text-muted">{claudeCodeVersion || '...'}</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Claude Agent SDK</div>
              <div className="text-xs text-text-muted mt-0.5">@anthropic-ai/claude-agent-sdk</div>
            </div>
            <span className="text-sm font-mono text-text-muted">{sdkVersion || '...'}</span>
          </div>
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-spin">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" className="text-border" />
                <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent" />
              </svg>
              Checking for updates…
            </div>
          )}

          {updateStatus.state === 'up-to-date' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-success">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5.5 8l2 2 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
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
                    window.api.app.openFile(updateStatus.release.htmlUrl);
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
                <span className="text-text-muted">Downloading…</span>
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
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5.5 8l2 2 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
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
              window.api.app.openFile('https://github.com/k0ngk0ng/claude-app');
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
              window.api.app.openFile('https://github.com/k0ngk0ng/claude-app/releases');
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
              window.api.app.openFile('https://github.com/k0ngk0ng/claude-app/issues');
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
