import { useEffect, useMemo, useState } from 'react';
import { RepositoryResult } from '../types/repository';
import { getTimelineBounds } from '../utils/city';

const BASE_PLAYBACK_DURATION_SECONDS = 56;
const MIN_PLAYBACK_DURATION_SECONDS = 18;
const MAX_PLAYBACK_DURATION_SECONDS = 220;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(value: number): number {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function collectTimelineFrames(data: RepositoryResult | null): number[] {
  if (!data) {
    return [];
  }

  const frames = new Set<number>();
  data.files.forEach((file) => {
    file.commits.forEach((commit) => {
      const ts = new Date(commit.date).getTime();
      if (!Number.isNaN(ts)) {
        frames.add(ts);
      }
    });
  });

  return Array.from(frames).sort((a, b) => a - b);
}

interface UseTimelinePlaybackParams {
  data: RepositoryResult | null;
  constructionMode: boolean;
  constructionSpeed: number;
  compareEnabled: boolean;
}

export function useTimelinePlayback({
  data,
  constructionMode,
  constructionSpeed,
  compareEnabled,
}: UseTimelinePlaybackParams) {
  const [timelineTs, setTimelineTs] = useState<number | null>(null);
  const [compareTs, setCompareTs] = useState<number | null>(null);

  const timelineBounds = useMemo(() => getTimelineBounds(data), [data]);
  const timelineFrames = useMemo(() => collectTimelineFrames(data), [data]);

  useEffect(() => {
    if (!timelineBounds) {
      setTimelineTs(null);
      setCompareTs(null);
      return;
    }

    setTimelineTs(timelineBounds.max);
    setCompareTs(timelineBounds.min);
  }, [data?.generatedAt, timelineBounds]);

  useEffect(() => {
    if (!constructionMode) {
      return;
    }

    if (timelineFrames.length === 0) {
      return;
    }

    if (timelineFrames.length === 1) {
      setTimelineTs(timelineFrames[0] ?? null);
      return;
    }

    const first = timelineFrames[0];
    const last = timelineFrames[timelineFrames.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }

    setTimelineTs(first);
    let rafId = 0;
    const normalizedSpeed = Math.max(0.15, constructionSpeed);
    const playbackDurationSeconds = clamp(
      BASE_PLAYBACK_DURATION_SECONDS / normalizedSpeed,
      MIN_PLAYBACK_DURATION_SECONDS,
      MAX_PLAYBACK_DURATION_SECONDS,
    );
    const startedAt = performance.now();
    const maxCursor = timelineFrames.length - 1;

    const step = (now: number) => {
      const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);
      const rawProgress = clamp(elapsedSeconds / playbackDurationSeconds, 0, 1);
      const easedProgress = easeInOutCubic(rawProgress);
      const cursor = easedProgress * maxCursor;

      const lowerIndex = Math.floor(cursor);
      const upperIndex = Math.min(maxCursor, lowerIndex + 1);
      const localProgress = cursor - lowerIndex;

      const lowerTs = timelineFrames[lowerIndex] ?? first;
      const upperTs = timelineFrames[upperIndex] ?? last;
      const interpolatedTs = lowerTs + (upperTs - lowerTs) * localProgress;
      setTimelineTs(interpolatedTs);

      if (rawProgress < 1) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [constructionMode, constructionSpeed, timelineFrames]);

  useEffect(() => {
    if (!compareEnabled || compareTs === null || timelineTs === null) {
      return;
    }

    if (compareTs > timelineTs) {
      setCompareTs(timelineTs);
    }
  }, [compareEnabled, compareTs, timelineTs]);

  const constructionProgress = useMemo(() => {
    if (timelineTs === null) {
      return 1;
    }

    if (constructionMode && timelineFrames.length > 1) {
      const firstFrame = timelineFrames[0];
      const lastFrame = timelineFrames[timelineFrames.length - 1];
      if (firstFrame !== undefined && lastFrame !== undefined) {
        const frameSpan = Math.max(1, lastFrame - firstFrame);
        return Math.min(1, Math.max(0, (timelineTs - firstFrame) / frameSpan));
      }
    }

    if (!timelineBounds) {
      return 1;
    }

    const span = Math.max(1, timelineBounds.max - timelineBounds.min);
    return Math.min(1, Math.max(0, (timelineTs - timelineBounds.min) / span));
  }, [constructionMode, timelineBounds, timelineFrames, timelineTs]);

  return {
    timelineBounds,
    timelineFrames,
    timelineTs,
    compareTs,
    constructionProgress,
    setTimelineTs,
    setCompareTs,
  };
}
