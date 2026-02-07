import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';

export function useGit() {
  const { currentProject, gitStatus, setGitStatus, setBranch } = useAppStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!currentProject.path) return;
    try {
      const status = await window.api.git.status(currentProject.path);
      setGitStatus(status);
      if (status.branch) {
        setBranch(status.branch);
      }
    } catch (err) {
      console.error('Failed to refresh git status:', err);
    }
  }, [currentProject.path, setGitStatus, setBranch]);

  const stageFile = useCallback(
    async (file: string) => {
      if (!currentProject.path) return;
      try {
        await window.api.git.stage(currentProject.path, file);
        await refreshStatus();
      } catch (err) {
        console.error('Failed to stage file:', err);
      }
    },
    [currentProject.path, refreshStatus]
  );

  const unstageFile = useCallback(
    async (file: string) => {
      if (!currentProject.path) return;
      try {
        await window.api.git.unstage(currentProject.path, file);
        await refreshStatus();
      } catch (err) {
        console.error('Failed to unstage file:', err);
      }
    },
    [currentProject.path, refreshStatus]
  );

  const commit = useCallback(
    async (message: string) => {
      if (!currentProject.path) return;
      try {
        await window.api.git.commit(currentProject.path, message);
        await refreshStatus();
      } catch (err) {
        console.error('Failed to commit:', err);
        throw err;
      }
    },
    [currentProject.path, refreshStatus]
  );

  const getDiff = useCallback(
    async (file?: string, staged?: boolean): Promise<string> => {
      if (!currentProject.path) return '';
      try {
        return await window.api.git.diff(currentProject.path, file, staged);
      } catch (err) {
        console.error('Failed to get diff:', err);
        return '';
      }
    },
    [currentProject.path]
  );

  // Auto-refresh git status every 5 seconds
  useEffect(() => {
    if (!currentProject.path) return;

    refreshStatus();

    intervalRef.current = setInterval(refreshStatus, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [currentProject.path, refreshStatus]);

  return {
    gitStatus,
    refreshStatus,
    stageFile,
    unstageFile,
    commit,
    getDiff,
  };
}
