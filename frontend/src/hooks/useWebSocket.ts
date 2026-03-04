import { useCallback, useEffect, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useRepoStore } from '../store/useRepoStore';
import {
  ProgressPayload,
  RepositoryPartialResult,
  RepositoryResult,
} from '../types/repository';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const GITHUB_REPO_REGEX =
  /^https?:\/\/github\.com\/[^/\s]+\/[^/\s?#]+(?:\.git)?\/?$/i;

let socketInstance: Socket | null = null;

function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(`${API_BASE_URL}/parser`, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }

  return socketInstance;
}

export function useWebSocket() {
  const setStatus = useRepoStore((state) => state.setStatus);
  const setProgress = useRepoStore((state) => state.setProgress);
  const setData = useRepoStore((state) => state.setData);
  const setError = useRepoStore((state) => state.setError);
  const setRepoUrl = useRepoStore((state) => state.setRepoUrl);
  const setSelectedPath = useRepoStore((state) => state.setSelectedPath);

  const socket = useMemo(() => getSocket(), []);

  useEffect(() => {
    setStatus('connecting');

    const onConnect = () => {
      if (useRepoStore.getState().status === 'connecting') {
        setStatus('idle');
      }
    };

    const onProgress = (payload: ProgressPayload) => {
      setStatus('parsing');
      setProgress(payload.percent, payload.message, payload.stage);
    };

    const onResult = (payload: RepositoryResult) => {
      setData(payload);
      setStatus('done');
      setProgress(100, 'City is ready', 'done');
      setError(null);
    };

    const onPartialResult = (payload: RepositoryPartialResult) => {
      const { processedCommits, final, ...resultPayload } = payload;
      const totalCommits = payload.totalCommits;
      if (final) {
        return;
      }

      setData(resultPayload);
      setStatus('parsing');

      if (totalCommits > 0) {
        const ratio = processedCommits / totalCommits;
        const percent = Math.min(88, 20 + Math.floor(ratio * 63));
        setProgress(
          Math.max(percent, useRepoStore.getState().progress),
          `Streaming city build (${processedCommits}/${totalCommits})`,
          'fetching_commit_details',
        );
      }
    };

    const onError = (payload: { message?: string }) => {
      setStatus('error');
      setError(payload?.message ?? 'Unexpected parsing error.');
    };

    socket.on('connect', onConnect);
    socket.on('progress', onProgress);
    socket.on('partial_result', onPartialResult);
    socket.on('result', onResult);
    socket.on('error', onError);
    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('progress', onProgress);
      socket.off('partial_result', onPartialResult);
      socket.off('result', onResult);
      socket.off('error', onError);
    };
  }, [setData, setError, setProgress, setStatus, socket]);

  const startParsing = useCallback(
    (repoUrl: string, githubToken?: string) => {
      const normalized = repoUrl.trim();

      if (!GITHUB_REPO_REGEX.test(normalized)) {
        setStatus('error');
        setError(
          'Please enter a valid GitHub repository URL (example: https://github.com/user/repo).',
        );
        return;
      }

      setRepoUrl(normalized);
      setError(null);
      setSelectedPath(null);
      setStatus('parsing');
      setProgress(1, 'Sending parse request', 'validating');

      if (!socket.connected) {
        socket.connect();
      }

      const token = githubToken?.trim();
      socket.emit('parse', {
        repoUrl: normalized,
        ...(token ? { githubToken: token } : {}),
      });
    },
    [setError, setProgress, setRepoUrl, setSelectedPath, setStatus, socket],
  );

  return {
    startParsing,
    isConnected: socket.connected,
  };
}
