import { create } from 'zustand';

interface ReleaseInfo {
  version: string;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  assets: { name: string; size: number; downloadUrl: string; cdnUrl?: string | null }[];
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; release: ReleaseInfo }
  | { state: 'downloading'; progress: number; downloaded: number; totalSize: number }
  | { state: 'downloaded' }
  | { state: 'error'; message: string };

interface UpdateStore {
  status: UpdateStatus;
  setStatus: (status: UpdateStatus) => void;
  /** Only update if currently in 'downloading' state (prevents race conditions) */
  updateProgress: (data: { downloaded: number; totalSize: number; progress: number }) => void;
}

export const useUpdateStore = create<UpdateStore>((set) => ({
  status: { state: 'idle' },

  setStatus: (status) => set({ status }),

  updateProgress: (data) =>
    set((state) => {
      if (state.status.state !== 'downloading') return state;
      return {
        status: {
          state: 'downloading',
          progress: data.progress,
          downloaded: data.downloaded,
          totalSize: data.totalSize,
        },
      };
    }),
}));
