import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getParserSocket } from './socket';
import {
  NarratorAckPayload,
  NarratorActionPayload,
  NarratorStatusPayload,
  NarratorStory,
} from '../types/narrator';

const MAX_STORIES = 8;
const CLIENT_ACTION_INTERVAL_MS = 1700;
const NARRATOR_ACK_TIMEOUT_MS = 6500;
const NARRATOR_RESPONSE_TIMEOUT_MS = 105000;
const NARRATOR_QUEUE_RETRY_DELAY_MS = 320;

interface PendingNarration {
  requestId: string;
  payloadType: NarratorActionPayload['type'];
  ackTimer: number | null;
  responseTimer: number | null;
}

interface QueuedNarration {
  payload: NarratorActionPayload;
  priority: number;
  queuedAt: number;
}

function actionPriority(payload: NarratorActionPayload): number {
  if (payload.type === 'chat_question' || payload.type === 'manual') {
    return 3;
  }
  if (
    payload.type === 'repo_loaded' ||
    payload.type === 'mode_change' ||
    payload.type === 'focus_file' ||
    payload.type === 'timeline_shift' ||
    payload.type === 'tour_mode' ||
    payload.type === 'compare_toggle'
  ) {
    return 2;
  }
  return 1;
}

export function useNarrator() {
  const socket = useMemo(() => getParserSocket(), []);
  const [stories, setStories] = useState<NarratorStory[]>([]);
  const [status, setStatus] = useState<'idle' | 'thinking' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const lastActionRef = useRef<{ key: string; at: number } | null>(null);
  const pendingRef = useRef<PendingNarration | null>(null);
  const queuedRef = useRef<QueuedNarration | null>(null);
  const queueFlushTimerRef = useRef<number | null>(null);
  const clearPendingRef = useRef<(requestId?: string | null) => void>(() => {});
  const scheduleQueueFlushRef = useRef<(delayMs?: number) => void>(() => {});
  const dispatchNarratorActionRef = useRef<(payload: NarratorActionPayload) => void>(() => {});

  useEffect(() => {
    const clearPending = (requestId: string | null = null) => {
      const pending = pendingRef.current;
      if (!pending) {
        return;
      }

      if (requestId && pending.requestId !== requestId) {
        return;
      }

      if (pending.ackTimer !== null) {
        window.clearTimeout(pending.ackTimer);
      }
      if (pending.responseTimer !== null) {
        window.clearTimeout(pending.responseTimer);
      }
      pendingRef.current = null;
    };
    clearPendingRef.current = clearPending;

    const dispatchNarratorAction = (payload: NarratorActionPayload) => {
      if (!socket.connected) {
        return;
      }

      const requestId = `nreq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const pending = pendingRef.current;
      if (pending) {
        if (pending.ackTimer !== null) {
          window.clearTimeout(pending.ackTimer);
        }
        if (pending.responseTimer !== null) {
          window.clearTimeout(pending.responseTimer);
        }
      }

      pendingRef.current = {
        requestId,
        payloadType: payload.type,
        ackTimer: window.setTimeout(() => {
          if (pendingRef.current?.requestId !== requestId) {
            return;
          }
          pendingRef.current = null;
          setStatus('error');
          setError('Narrator acknowledgement timeout.');
          scheduleQueueFlushRef.current(NARRATOR_QUEUE_RETRY_DELAY_MS);
        }, NARRATOR_ACK_TIMEOUT_MS),
        responseTimer: null,
      };
      setStatus('thinking');
      setError(null);
      socket.emit('narrator_action', {
        ...payload,
        requestId,
      });
    };
    dispatchNarratorActionRef.current = dispatchNarratorAction;

    const scheduleQueueFlush = (delayMs = 0) => {
      if (queueFlushTimerRef.current !== null) {
        window.clearTimeout(queueFlushTimerRef.current);
      }
      queueFlushTimerRef.current = window.setTimeout(() => {
        queueFlushTimerRef.current = null;
        if (!socket.connected || pendingRef.current) {
          return;
        }
        const queued = queuedRef.current;
        if (!queued) {
          return;
        }
        queuedRef.current = null;
        dispatchNarratorAction(queued.payload);
      }, Math.max(0, delayMs));
    };
    scheduleQueueFlushRef.current = scheduleQueueFlush;

    const onNarratorAck = (payload: NarratorAckPayload) => {
      const pending = pendingRef.current;
      if (!pending || payload.requestId !== pending.requestId) {
        return;
      }

      if (pending.ackTimer !== null) {
        window.clearTimeout(pending.ackTimer);
        pending.ackTimer = null;
      }

      if (payload.status === 'accepted') {
        setStatus('thinking');
        setError(null);
        pending.responseTimer = window.setTimeout(() => {
          if (pendingRef.current?.requestId !== pending.requestId) {
            return;
          }
          pendingRef.current = null;
          setStatus('error');
          setError('Narrator response timeout. Try again.');
        }, NARRATOR_RESPONSE_TIMEOUT_MS);
        return;
      }

      clearPending(payload.requestId);
      if (payload.status === 'throttled' || payload.status === 'busy') {
        setStatus('idle');
        setError(payload.message ?? 'Narrator is busy. Please retry in a moment.');
        scheduleQueueFlush(
          Math.max(NARRATOR_QUEUE_RETRY_DELAY_MS, payload.retryAfterMs ?? 0),
        );
        return;
      }

      setStatus('error');
      setError(payload.message ?? 'Narrator rejected the action payload.');
      scheduleQueueFlush(NARRATOR_QUEUE_RETRY_DELAY_MS);
    };

    const onNarratorStory = (payload: NarratorStory) => {
      const pending = pendingRef.current;
      const isCurrentRequest =
        !pending ||
        !payload.requestId ||
        payload.requestId === pending.requestId;
      clearPending(payload.requestId);
      setStories((current) => {
        const next = [...current, payload];
        return next.length > MAX_STORIES ? next.slice(next.length - MAX_STORIES) : next;
      });
      if (isCurrentRequest) {
        setStatus('idle');
        setError(null);
      }
      scheduleQueueFlush(80);
    };

    const onNarratorStatus = (payload: NarratorStatusPayload) => {
      const pending = pendingRef.current;
      if (
        payload.requestId &&
        pending &&
        payload.requestId !== pending.requestId
      ) {
        return;
      }
      if (payload.status === 'thinking' && payload.requestId && !pending) {
        return;
      }

      if (payload.status === 'idle' || payload.status === 'error') {
        clearPending(payload.requestId);
      }
      setStatus(payload.status);
      if (payload.status === 'error') {
        setError(payload.message ?? 'Narrator failed to respond.');
        scheduleQueueFlush(NARRATOR_QUEUE_RETRY_DELAY_MS);
        return;
      }
      setError(null);
      if (payload.status === 'idle') {
        scheduleQueueFlush(60);
      }
    };

    const onDisconnect = () => {
      clearPending();
      setStatus('idle');
    };
    const onConnect = () => {
      if (!pendingRef.current) {
        scheduleQueueFlush(60);
      }
    };

    socket.on('narrator_ack', onNarratorAck);
    socket.on('narrator_story', onNarratorStory);
    socket.on('narrator_status', onNarratorStatus);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    return () => {
      clearPending();
      if (queueFlushTimerRef.current !== null) {
        window.clearTimeout(queueFlushTimerRef.current);
        queueFlushTimerRef.current = null;
      }
      queuedRef.current = null;
      socket.off('narrator_ack', onNarratorAck);
      socket.off('narrator_story', onNarratorStory);
      socket.off('narrator_status', onNarratorStatus);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [socket]);

  const sendNarratorAction = useCallback(
    (payload: NarratorActionPayload) => {
      if (!socket.connected) {
        return;
      }

      const key = `${payload.type}|${payload.viewMode ?? ''}|${payload.selectedPath ?? ''}|${
        payload.timelineLabel ?? ''
      }|${payload.compareEnabled ? '1' : '0'}|${payload.tourMode ?? ''}|${
        payload.manualCue ?? ''
      }|${payload.interaction ?? ''}|${payload.interactionValue ?? ''}|${payload.question ?? ''}`;
      const now = performance.now();
      const previous = lastActionRef.current;
      if (previous && previous.key === key && now - previous.at < CLIENT_ACTION_INTERVAL_MS) {
        return;
      }
      lastActionRef.current = { key, at: now };

      if (pendingRef.current) {
        const next = {
          payload,
          priority: actionPriority(payload),
          queuedAt: Date.now(),
        };
        const currentQueued = queuedRef.current;
        if (
          !currentQueued ||
          next.priority > currentQueued.priority ||
          (next.priority === currentQueued.priority && next.queuedAt >= currentQueued.queuedAt)
        ) {
          queuedRef.current = next;
        }
        return;
      }

      dispatchNarratorActionRef.current(payload);
    },
    [socket],
  );

  const clearNarration = useCallback(() => {
    clearPendingRef.current();
    if (queueFlushTimerRef.current !== null) {
      window.clearTimeout(queueFlushTimerRef.current);
      queueFlushTimerRef.current = null;
    }
    queuedRef.current = null;
    setStories([]);
    setStatus('idle');
    setError(null);
  }, []);

  return {
    stories,
    latestStory: stories[stories.length - 1] ?? null,
    status,
    error,
    sendNarratorAction,
    clearNarration,
  };
}
