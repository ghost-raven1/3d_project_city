import { create } from 'zustand';
import { ParseStatus, RepositoryResult } from '../types/repository';

interface RepoState {
  status: ParseStatus;
  progress: number;
  message: string;
  stage: string;
  data: RepositoryResult | null;
  error: string | null;
  repoUrl: string;
  hoveredPath: string | null;
  selectedPath: string | null;
  setStatus: (status: ParseStatus) => void;
  setProgress: (progress: number, message: string, stage: string) => void;
  setData: (data: RepositoryResult | null) => void;
  setError: (error: string | null) => void;
  setRepoUrl: (repoUrl: string) => void;
  setHoveredPath: (path: string | null) => void;
  setSelectedPath: (path: string | null) => void;
}

export const useRepoStore = create<RepoState>((set) => ({
  status: 'idle',
  progress: 0,
  message: '',
  stage: 'idle',
  data: null,
  error: null,
  repoUrl: '',
  hoveredPath: null,
  selectedPath: null,
  setStatus: (status) => set({ status }),
  setProgress: (progress, message, stage) => set({ progress, message, stage }),
  setData: (data) => set({ data }),
  setError: (error) => set({ error }),
  setRepoUrl: (repoUrl) => set({ repoUrl }),
  setHoveredPath: (hoveredPath) => set({ hoveredPath }),
  setSelectedPath: (selectedPath) => set({ selectedPath }),
}));
