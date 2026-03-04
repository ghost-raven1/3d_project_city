import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { BranchTreePanel } from './components/BranchTreePanel';
import { CyberpunkCanvasOverlay } from './components/CyberpunkCanvasOverlay';
import { FileInfoCard } from './components/FileInfoCard';
import { InsightPanel } from './components/InsightPanel';
import { Minimap } from './components/Minimap';
import { Scene3D } from './components/Scene3D';
import { TopControlPanel } from './components/TopControlPanel';
import { useWebSocket } from './hooks/useWebSocket';
import { useRepoStore } from './store/useRepoStore';
import { RepositoryResult } from './types/repository';
import { createCityDNA } from './utils/city-dna';
import { getTimelineBounds } from './utils/city';
import {
  deriveBranchSignals,
  extractBranchNamesFromMessage,
  fileMatchesBranch,
} from './utils/branches';
import { analyzeRepositoryInsights } from './utils/insights';
import { getLanguageFromPath } from './utils/language';
import { buildFileRiskMap, riskBand } from './utils/risk';
import { buildSnapshot } from './utils/snapshot';

function topDistrict(folder: string): string {
  if (!folder || folder === 'root') {
    return 'root';
  }

  return folder.split('/')[0] ?? 'root';
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

function findFrameProgress(frames: number[], ts: number): number {
  if (frames.length <= 1) {
    return 1;
  }

  if (ts <= frames[0]) {
    return 0;
  }

  const last = frames[frames.length - 1];
  if (ts >= last) {
    return 1;
  }

  let left = 0;
  let right = frames.length - 1;
  while (left <= right) {
    const middle = (left + right) >> 1;
    const value = frames[middle];
    if (value === undefined) {
      break;
    }

    if (value <= ts) {
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  const lowerIndex = Math.max(0, right);
  return lowerIndex / Math.max(1, frames.length - 1);
}

function App() {
  const autoParsedRef = useRef(false);
  const captureSceneRef = useRef<(() => Promise<Blob | null>) | null>(null);
  const { startParsing } = useWebSocket();

  const [timelineTs, setTimelineTs] = useState<number | null>(null);
  const [autoTour, setAutoTour] = useState(true);
  const [showAtmosphere, setShowAtmosphere] = useState(true);
  const [showWeather, setShowWeather] = useState(true);
  const [showBuilders, setShowBuilders] = useState(true);
  const [showCyberpunkOverlay, setShowCyberpunkOverlay] = useState(true);
  const [timeOfDay, setTimeOfDay] = useState<
    'auto' | 'dawn' | 'day' | 'sunset' | 'night'
  >('auto');
  const [weatherMode, setWeatherMode] = useState<
    'auto' | 'clear' | 'mist' | 'rain' | 'storm'
  >('auto');
  const [dynamicAtmosphere, setDynamicAtmosphere] = useState(false);
  const [atmosphereTick, setAtmosphereTick] = useState(0);
  const [constructionMode, setConstructionMode] = useState(false);
  const [constructionSpeed, setConstructionSpeed] = useState(1);
  const [liveWatch, setLiveWatch] = useState(false);
  const [topPanelCollapsed, setTopPanelCollapsed] = useState(true);
  const [languageFilter, setLanguageFilter] = useState('all');
  const [authorFilter, setAuthorFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [branchOnlyMode, setBranchOnlyMode] = useState(false);
  const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [pathFilter, setPathFilter] = useState('');
  const [viewMode, setViewMode] = useState<'overview' | 'architecture' | 'risk' | 'stack'>('overview');
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareMode, setCompareMode] = useState<'ghost' | 'split'>('ghost');
  const [compareTs, setCompareTs] = useState<number | null>(null);
  const [githubToken, setGithubToken] = useState('');

  const status = useRepoStore((state) => state.status);
  const progress = useRepoStore((state) => state.progress);
  const message = useRepoStore((state) => state.message);
  const data = useRepoStore((state) => state.data);
  const error = useRepoStore((state) => state.error);
  const repoUrl = useRepoStore((state) => state.repoUrl);
  const hoveredPath = useRepoStore((state) => state.hoveredPath);
  const selectedPath = useRepoStore((state) => state.selectedPath);

  const setRepoUrl = useRepoStore((state) => state.setRepoUrl);
  const setHoveredPath = useRepoStore((state) => state.setHoveredPath);
  const setSelectedPath = useRepoStore((state) => state.setSelectedPath);

  useEffect(() => {
    if (autoParsedRef.current) {
      return;
    }

    const search = new URLSearchParams(window.location.search);
    const repoFromQuery = search.get('repo');

    if (repoFromQuery) {
      setRepoUrl(repoFromQuery);
      startParsing(repoFromQuery, githubToken);
    }

    autoParsedRef.current = true;
  }, [githubToken, setRepoUrl, startParsing]);

  useEffect(() => {
    if (!liveWatch || !repoUrl) {
      return;
    }

    const interval = setInterval(() => {
      const currentStatus = useRepoStore.getState().status;
      if (currentStatus === 'parsing' || currentStatus === 'connecting') {
        return;
      }

      startParsing(repoUrl, githubToken);
    }, 120000);

    return () => clearInterval(interval);
  }, [githubToken, liveWatch, repoUrl, startParsing]);

  useEffect(() => {
    if (!dynamicAtmosphere) {
      return;
    }

    const interval = setInterval(() => {
      setAtmosphereTick((value) => value + 1);
    }, 12000);

    return () => clearInterval(interval);
  }, [dynamicAtmosphere]);

  const cityDna = useMemo(() => createCityDNA(data), [data]);
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
    let cursor = 0;
    let previousTs = performance.now();
    const framesPerSecond = Math.max(8, 24 * constructionSpeed);
    const maxCursor = timelineFrames.length - 1;

    const step = (now: number) => {
      const deltaSeconds = Math.max(0, (now - previousTs) / 1000);
      previousTs = now;
      cursor = Math.min(maxCursor, cursor + deltaSeconds * framesPerSecond);

      const lowerIndex = Math.floor(cursor);
      const upperIndex = Math.min(maxCursor, lowerIndex + 1);
      const localProgress = cursor - lowerIndex;

      const lowerTs = timelineFrames[lowerIndex] ?? first;
      const upperTs = timelineFrames[upperIndex] ?? last;
      const interpolatedTs = lowerTs + (upperTs - lowerTs) * localProgress;
      setTimelineTs(interpolatedTs);

      if (cursor < maxCursor) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [constructionMode, constructionSpeed, timelineFrames]);

  useEffect(() => {
    setLanguageFilter('all');
    setAuthorFilter('all');
    setDistrictFilter('all');
    setBranchFilter('all');
    setBranchOnlyMode(false);
    setRiskFilter('all');
    setPathFilter('');
    setViewMode('overview');
    setCompareEnabled(false);
    setCompareMode('ghost');
  }, [data?.generatedAt]);

  const timelineData = useMemo(() => {
    return buildSnapshot(data, timelineTs);
  }, [data, timelineTs]);
  const compareData = useMemo(() => {
    if (!compareEnabled) {
      return null;
    }

    return buildSnapshot(data, compareTs);
  }, [compareEnabled, compareTs, data]);

  const riskProfiles = useMemo(
    () => buildFileRiskMap(timelineData?.files ?? [], timelineTs ?? undefined),
    [timelineData, timelineTs],
  );
  const compareRiskProfiles = useMemo(
    () =>
      buildFileRiskMap(
        compareData?.files ?? [],
        compareTs ?? timelineTs ?? undefined,
      ),
    [compareData, compareTs, timelineTs],
  );

  const languageOptions = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    const count = new Map<string, number>();
    timelineData.files.forEach((file) => {
      const language = getLanguageFromPath(file.path);
      count.set(language, (count.get(language) ?? 0) + 1);
    });

    return Array.from(count.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
      .slice(0, 20);
  }, [timelineData]);

  const authorOptions = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    const count = new Map<string, number>();
    timelineData.files.forEach((file) => {
      file.commits.forEach((commit) => {
        count.set(commit.author, (count.get(commit.author) ?? 0) + 1);
      });
    });

    return Array.from(count.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
      .slice(0, 40);
  }, [timelineData]);

  const districtOptions = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    const count = new Map<string, number>();
    timelineData.files.forEach((file) => {
      const district = topDistrict(file.folder);
      count.set(district, (count.get(district) ?? 0) + 1);
    });

    return Array.from(count.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
      .slice(0, 24);
  }, [timelineData]);

  const branchOptions = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    const source =
      (timelineData.branches ?? []).length > 0
        ? timelineData.branches
        : deriveBranchSignals(timelineData.files);

    return source
      .map((branch) => branch.name)
      .filter((name) => Boolean(name))
      .slice(0, 20);
  }, [timelineData]);

  useEffect(() => {
    if (!branchOnlyMode) {
      return;
    }

    if (branchFilter === 'all' && branchOptions.length > 0) {
      setBranchFilter(branchOptions[0] ?? 'all');
    }
  }, [branchFilter, branchOnlyMode, branchOptions]);

  const jumpOptions = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    return [...timelineData.files]
      .sort((a, b) => b.commits.length - a.commits.length || b.totalChanges - a.totalChanges)
      .slice(0, 1200)
      .map((file) => file.path);
  }, [timelineData]);

  const filteredData = useMemo(() => {
    if (!timelineData) {
      return timelineData;
    }

    const normalizedPathFilter = pathFilter.trim().toLowerCase();
    const filteredFiles = timelineData.files
      .map((file) => {
        if (branchOnlyMode && branchFilter !== 'all') {
          const filteredCommits = file.commits.filter((commit) => {
            const branches = commit.branches ?? extractBranchNamesFromMessage(commit.message);
            return branches.some(
              (branch) => branch.toLowerCase() === branchFilter.toLowerCase(),
            );
          });

          if (filteredCommits.length === 0) {
            return null;
          }

          return {
            ...file,
            commits: filteredCommits,
            totalAdditions: filteredCommits.reduce((sum, commit) => sum + commit.additions, 0),
            totalDeletions: filteredCommits.reduce((sum, commit) => sum + commit.deletions, 0),
            totalChanges: filteredCommits.reduce((sum, commit) => sum + commit.changes, 0),
          };
        }

        return file;
      })
      .filter((file): file is (typeof timelineData.files)[number] => file !== null)
      .filter((file) => {
      if (selectedPath && file.path === selectedPath) {
        return true;
      }

      if (languageFilter !== 'all' && getLanguageFromPath(file.path) !== languageFilter) {
        return false;
      }

      if (
        authorFilter !== 'all' &&
        !file.commits.some((commit) => commit.author === authorFilter)
      ) {
        return false;
      }

      if (districtFilter !== 'all' && topDistrict(file.folder) !== districtFilter) {
        return false;
      }

      if (branchFilter !== 'all' && !fileMatchesBranch(file, branchFilter)) {
        return false;
      }

      if (riskFilter !== 'all') {
        const profile = riskProfiles.get(file.path);
        if (!profile || riskBand(profile.risk) !== riskFilter) {
          return false;
        }
      }

      if (normalizedPathFilter && !file.path.toLowerCase().includes(normalizedPathFilter)) {
        return false;
      }

      return true;
    });

    const visiblePaths = new Set(filteredFiles.map((file) => file.path));
    const filteredImports = (timelineData.imports ?? []).filter(
      (road) => visiblePaths.has(road.from) && visiblePaths.has(road.to),
    );

    return {
      ...timelineData,
      files: filteredFiles,
      imports: filteredImports,
      branches:
        branchFilter === 'all'
          ? timelineData.branches
          : (timelineData.branches ?? []).filter(
              (branch) => branch.name.toLowerCase() === branchFilter.toLowerCase(),
            ),
    };
  }, [
    authorFilter,
    branchFilter,
    branchOnlyMode,
    districtFilter,
    languageFilter,
    pathFilter,
    riskFilter,
    riskProfiles,
    selectedPath,
    timelineData,
  ]);
  const compareFilteredData = useMemo(() => {
    if (!compareData) {
      return null;
    }

    const normalizedPathFilter = pathFilter.trim().toLowerCase();
    const files = compareData.files
      .map((file) => {
        if (branchOnlyMode && branchFilter !== 'all') {
          const filteredCommits = file.commits.filter((commit) => {
            const branches = commit.branches ?? extractBranchNamesFromMessage(commit.message);
            return branches.some(
              (branch) => branch.toLowerCase() === branchFilter.toLowerCase(),
            );
          });

          if (filteredCommits.length === 0) {
            return null;
          }

          return {
            ...file,
            commits: filteredCommits,
            totalAdditions: filteredCommits.reduce((sum, commit) => sum + commit.additions, 0),
            totalDeletions: filteredCommits.reduce((sum, commit) => sum + commit.deletions, 0),
            totalChanges: filteredCommits.reduce((sum, commit) => sum + commit.changes, 0),
          };
        }

        return file;
      })
      .filter((file): file is (typeof compareData.files)[number] => file !== null)
      .filter((file) => {
      if (languageFilter !== 'all' && getLanguageFromPath(file.path) !== languageFilter) {
        return false;
      }

      if (
        authorFilter !== 'all' &&
        !file.commits.some((commit) => commit.author === authorFilter)
      ) {
        return false;
      }

      if (districtFilter !== 'all' && topDistrict(file.folder) !== districtFilter) {
        return false;
      }

      if (branchFilter !== 'all' && !fileMatchesBranch(file, branchFilter)) {
        return false;
      }

      if (riskFilter !== 'all') {
        const profile = compareRiskProfiles.get(file.path);
        if (!profile || riskBand(profile.risk) !== riskFilter) {
          return false;
        }
      }

      if (normalizedPathFilter && !file.path.toLowerCase().includes(normalizedPathFilter)) {
        return false;
      }

      return true;
    });

    const visiblePaths = new Set(files.map((file) => file.path));
    const imports = (compareData.imports ?? []).filter(
      (road) => visiblePaths.has(road.from) && visiblePaths.has(road.to),
    );

    return {
      ...compareData,
      files,
      imports,
      branches:
        branchFilter === 'all'
          ? compareData.branches
          : (compareData.branches ?? []).filter(
              (branch) => branch.name.toLowerCase() === branchFilter.toLowerCase(),
            ),
    };
  }, [
    authorFilter,
    branchFilter,
    branchOnlyMode,
    compareData,
    compareRiskProfiles,
    districtFilter,
    languageFilter,
    pathFilter,
    riskFilter,
  ]);

  useEffect(() => {
    if (!filteredData || !selectedPath) {
      return;
    }

    const stillExists = filteredData.files.some((file) => file.path === selectedPath);
    if (!stillExists) {
      setSelectedPath(null);
    }
  }, [filteredData, selectedPath, setSelectedPath]);

  const selectedFile = useMemo(() => {
    if (!filteredData || !selectedPath) {
      return null;
    }

    return filteredData.files.find((file) => file.path === selectedPath) ?? null;
  }, [filteredData, selectedPath]);
  const selectedRiskProfile = useMemo(() => {
    if (!selectedFile) {
      return null;
    }

    return riskProfiles.get(selectedFile.path) ?? null;
  }, [riskProfiles, selectedFile]);

  const insights = useMemo(() => {
    return analyzeRepositoryInsights(filteredData);
  }, [filteredData]);
  const compareInsights = useMemo(() => {
    if (!compareEnabled) {
      return null;
    }

    return analyzeRepositoryInsights(compareFilteredData);
  }, [compareEnabled, compareFilteredData]);

  const isBusy = status === 'connecting' || status === 'parsing';
  const hasSceneData = Boolean(filteredData && filteredData.files.length > 0);

  const timelineLabel = timelineTs
    ? new Date(timelineTs).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Latest';
  const compareLabel = compareTs
    ? new Date(compareTs).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Baseline';
  const compareSummary = useMemo(() => {
    if (!compareEnabled || !compareFilteredData || !filteredData) {
      return null;
    }

    const beforeRiskMap = buildFileRiskMap(
      compareFilteredData.files,
      compareTs ?? timelineTs ?? undefined,
    );
    const afterRiskMap = buildFileRiskMap(
      filteredData.files,
      timelineTs ?? undefined,
    );
    const beforeAvgRisk =
      compareFilteredData.files.length === 0
        ? 0
        : Array.from(beforeRiskMap.values()).reduce((sum, item) => sum + item.risk, 0) /
          compareFilteredData.files.length;
    const afterAvgRisk =
      filteredData.files.length === 0
        ? 0
        : Array.from(afterRiskMap.values()).reduce((sum, item) => sum + item.risk, 0) /
          filteredData.files.length;

    const beforeHubs = compareInsights?.graph.hubs.length ?? 0;
    const afterHubs = insights?.graph.hubs.length ?? 0;

    return {
      filesDelta: filteredData.files.length - compareFilteredData.files.length,
      roadsDelta: filteredData.imports.length - compareFilteredData.imports.length,
      riskDelta: afterAvgRisk - beforeAvgRisk,
      hubsDelta: afterHubs - beforeHubs,
    };
  }, [
    compareEnabled,
    compareFilteredData,
    compareInsights?.graph.hubs.length,
    compareTs,
    filteredData,
    insights?.graph.hubs.length,
    timelineTs,
  ]);

  const totalCommitsByPath = useMemo(() => {
    const map = new Map<string, number>();
    (data?.files ?? []).forEach((file) => {
      map.set(file.path, Math.max(1, file.commits.length));
    });
    return map;
  }, [data]);
  const effectiveTimeOfDay = useMemo(() => {
    if (!dynamicAtmosphere) {
      return timeOfDay;
    }

    const sequence: Array<'dawn' | 'day' | 'sunset' | 'night'> = [
      'dawn',
      'day',
      'sunset',
      'night',
    ];
    return sequence[atmosphereTick % sequence.length] ?? 'day';
  }, [atmosphereTick, dynamicAtmosphere, timeOfDay]);
  const effectiveWeatherMode = useMemo(() => {
    if (!dynamicAtmosphere) {
      return weatherMode;
    }

    const sequence: Array<'clear' | 'mist' | 'rain' | 'storm'> = [
      'clear',
      'mist',
      'rain',
      'storm',
      'mist',
      'clear',
    ];
    return sequence[atmosphereTick % sequence.length] ?? 'clear';
  }, [atmosphereTick, dynamicAtmosphere, weatherMode]);
  const constructionProgress = useMemo(() => {
    if (timelineTs === null) {
      return 1;
    }

    if (constructionMode && timelineFrames.length > 1) {
      return findFrameProgress(timelineFrames, timelineTs);
    }

    if (!timelineBounds) {
      return 1;
    }

    const span = Math.max(1, timelineBounds.max - timelineBounds.min);
    return Math.min(1, Math.max(0, (timelineTs - timelineBounds.min) / span));
  }, [constructionMode, timelineBounds, timelineFrames, timelineTs]);

  useEffect(() => {
    if (!compareEnabled || compareTs === null || timelineTs === null) {
      return;
    }

    if (compareTs > timelineTs) {
      setCompareTs(timelineTs);
    }
  }, [compareEnabled, compareTs, timelineTs]);

  const buildExecutiveSummary = () => {
    const lines: string[] = [];
    lines.push(`# Repository City Summary`);
    lines.push(`Repo: ${repoUrl || 'n/a'}`);
    if (insights) {
      lines.push(`Time window: ${timelineLabel}`);
      lines.push(`Files: ${insights.totalFiles}, Commits: ${insights.totalCommits}`);
      lines.push(`Top language: ${insights.languages[0]?.name ?? 'Unknown'}`);
      lines.push(`Frameworks: ${insights.frameworks.slice(0, 5).join(', ') || 'n/a'}`);
      lines.push(
        `Graph: hubs=${insights.graph.hubs.length}, cycles=${insights.graph.cycleCount}, layer violations=${insights.graph.layerViolationCount}`,
      );
      lines.push(
        `Risk hotspots: ${Array.from(riskProfiles.entries())
          .sort((a, b) => b[1].risk - a[1].risk)
          .slice(0, 5)
          .map(([path, profile]) => `${path} (${Math.round(profile.risk * 100)}%)`)
          .join('; ') || 'n/a'}`,
      );
      lines.push(
        `Branch signals: ${(filteredData?.branches ?? [])
          .slice(0, 5)
          .map((item) => `${item.name} (${item.commits})`)
          .join(', ') || 'n/a'}`,
      );
    }

    if (compareEnabled && compareSummary) {
      lines.push(
        `Compare vs ${compareLabel}: files ${compareSummary.filesDelta >= 0 ? '+' : ''}${compareSummary.filesDelta}, roads ${compareSummary.roadsDelta >= 0 ? '+' : ''}${compareSummary.roadsDelta}, risk ${compareSummary.riskDelta >= 0 ? '+' : ''}${Math.round(compareSummary.riskDelta * 100)}%, hubs ${compareSummary.hubsDelta >= 0 ? '+' : ''}${compareSummary.hubsDelta}`,
      );
    }

    return lines.join('\n');
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0 }}>
        {hasSceneData && filteredData ? (
          <Scene3D
            files={filteredData.files}
            imports={filteredData.imports}
            branches={filteredData.branches ?? []}
            stack={filteredData.stack ?? null}
            dna={cityDna}
            insights={insights}
            riskByPath={riskProfiles}
            hoveredPath={hoveredPath}
            selectedPath={selectedPath}
            viewMode={viewMode}
            compareEnabled={compareEnabled}
            compareMode={compareMode}
            compareFiles={compareFilteredData?.files ?? []}
            autoTour={autoTour}
            showAtmosphere={showAtmosphere || viewMode === 'architecture' || viewMode === 'stack'}
            showWeather={viewMode === 'risk' ? true : showWeather}
            showBuilders={showBuilders}
            timeOfDay={effectiveTimeOfDay}
            weatherMode={effectiveWeatherMode}
            totalCommitsByPath={totalCommitsByPath}
            constructionMode={constructionMode}
            constructionProgress={constructionProgress}
            onHover={setHoveredPath}
            onSelect={setSelectedPath}
            onCaptureReady={(capture) => {
              captureSceneRef.current = capture;
            }}
          />
        ) : (
          <Box sx={{ p: 2, height: '100%' }}>
            <Paper
              sx={{
                p: 3,
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.65)',
              }}
            >
              <Typography color="text.secondary" textAlign="center">
                {filteredData && filteredData.files.length === 0
                  ? 'No files exist at this timeline position. Move the slider forward.'
                  : 'Enter a public GitHub repository URL and click "Построить город".'}
              </Typography>
            </Paper>
          </Box>
        )}

        {hasSceneData && (
          <CyberpunkCanvasOverlay
            enabled={showCyberpunkOverlay}
            accentColor={cityDna?.palette.accent ?? '#2ec8ff'}
            seed={cityDna?.seed ?? 42}
            mode={viewMode}
            intensity={showAtmosphere ? 1 : 0.82}
          />
        )}

        {hasSceneData && isBusy && (
          <Paper
            elevation={2}
            sx={{
              position: 'absolute',
              left: { xs: 8, md: 18 },
              bottom: { xs: 8, md: 18 },
              px: 1.5,
              py: 1,
              zIndex: 12,
              backgroundColor: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(6px)',
              borderRadius: 2,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {message || 'Updating city...'}
            </Typography>
          </Paper>
        )}

        {selectedFile && (
          <FileInfoCard
            file={selectedFile}
            riskProfile={selectedRiskProfile}
            onClose={() => setSelectedPath(null)}
          />
        )}

        {hasSceneData && insights && (
          <InsightPanel insights={insights} analysis={filteredData?.analysis ?? null} />
        )}
        {hasSceneData && filteredData && (
          <BranchTreePanel
            branches={(filteredData.branches ?? []).slice(0, 24)}
            selectedBranch={branchFilter}
            branchOnlyMode={branchOnlyMode}
            onSelectBranch={setBranchFilter}
            onToggleBranchOnly={setBranchOnlyMode}
          />
        )}
        {hasSceneData && filteredData && (
          <Minimap
            files={filteredData.files}
            selectedPath={selectedPath}
            hoveredPath={hoveredPath}
            onSelect={setSelectedPath}
          />
        )}
      </Box>

      <TopControlPanel
        repoUrl={repoUrl}
        isBusy={isBusy}
        progress={progress}
        message={message}
        error={error}
        data={filteredData}
        timelineBounds={timelineBounds}
        timelineTs={timelineTs}
        timelineLabel={timelineLabel}
        cityDna={cityDna}
        githubToken={githubToken}
        languageFilter={languageFilter}
        authorFilter={authorFilter}
        districtFilter={districtFilter}
        branchFilter={branchFilter}
        riskFilter={riskFilter}
        pathFilter={pathFilter}
        viewMode={viewMode}
        compareEnabled={compareEnabled}
        compareMode={compareMode}
        compareTs={compareTs}
        compareLabel={compareLabel}
        compareSummary={compareSummary}
        languageOptions={languageOptions}
        authorOptions={authorOptions}
        districtOptions={districtOptions}
        branchOptions={branchOptions}
        jumpOptions={jumpOptions}
        autoTour={autoTour}
        liveWatch={liveWatch}
        showAtmosphere={showAtmosphere}
        showWeather={showWeather}
        showBuilders={showBuilders}
        showCyberpunkOverlay={showCyberpunkOverlay}
        timeOfDay={timeOfDay}
        weatherMode={weatherMode}
        dynamicAtmosphere={dynamicAtmosphere}
        constructionMode={constructionMode}
        constructionSpeed={constructionSpeed}
        constructionProgress={constructionProgress}
        collapsed={topPanelCollapsed}
        onToggleCollapsed={() => setTopPanelCollapsed((value) => !value)}
        onRepoUrlChange={setRepoUrl}
        onGithubTokenChange={setGithubToken}
        onStartParsing={() => startParsing(repoUrl, githubToken)}
        onTimelineChange={setTimelineTs}
        onAutoTourChange={setAutoTour}
        onLiveWatchChange={setLiveWatch}
        onShowAtmosphereChange={setShowAtmosphere}
        onShowWeatherChange={setShowWeather}
        onShowBuildersChange={setShowBuilders}
        onShowCyberpunkOverlayChange={setShowCyberpunkOverlay}
        onTimeOfDayChange={setTimeOfDay}
        onWeatherModeChange={setWeatherMode}
        onDynamicAtmosphereChange={setDynamicAtmosphere}
        onConstructionModeChange={setConstructionMode}
        onConstructionSpeedChange={setConstructionSpeed}
        onLanguageFilterChange={setLanguageFilter}
        onAuthorFilterChange={setAuthorFilter}
        onDistrictFilterChange={setDistrictFilter}
        onBranchFilterChange={setBranchFilter}
        onRiskFilterChange={setRiskFilter}
        onPathFilterChange={setPathFilter}
        onViewModeChange={setViewMode}
        onCompareEnabledChange={setCompareEnabled}
        onCompareModeChange={setCompareMode}
        onCompareTsChange={setCompareTs}
        onExportSummary={async () => {
          const summary = buildExecutiveSummary();
          try {
            await navigator.clipboard.writeText(summary);
          } catch {
            console.warn('Failed to copy summary to clipboard.');
          }
        }}
        onExportPng={async () => {
          const repoName = filteredData?.repository.repo ?? 'repository';
          const capture = captureSceneRef.current;
          if (capture) {
            const blob = await capture();
            if (blob) {
              downloadBlob(`${repoName}-city.png`, blob);
              return;
            }
          }

          const canvas = document.getElementById('repo-city-canvas') as HTMLCanvasElement | null;
          if (!canvas) {
            return;
          }

          canvas.toBlob((blob) => {
            if (!blob) {
              return;
            }
            downloadBlob(`${repoName}-city.png`, blob);
          }, 'image/png');
        }}
        onExportJson={() => {
          const payload = {
            generatedAt: new Date().toISOString(),
            repoUrl,
            timelineLabel,
            compareLabel: compareEnabled ? compareLabel : null,
            analysis: filteredData?.analysis ?? null,
            insights,
            compareSummary: compareEnabled ? compareSummary : null,
          };

          downloadTextFile(
            `${filteredData?.repository.repo ?? 'repository'}-report.json`,
            JSON.stringify(payload, null, 2),
            'application/json',
          );
        }}
        onExportHotspots={() => {
          const top = Array.from(riskProfiles.entries())
            .sort((a, b) => b[1].risk - a[1].risk)
            .slice(0, 60)
            .map(([path, profile]) => ({
              path,
              risk: Math.round(profile.risk * 100),
              churn: Math.round(profile.churn * 100),
              bugfixRatio: Math.round(profile.bugfixRatio * 100),
              lowBusFactor: Math.round(profile.lowBusFactor * 100),
              topAuthor: profile.topAuthor,
              topAuthorShare: Math.round(profile.topAuthorShare * 100),
            }));

          const csv = [
            'path,risk,churn,bugfixRatio,lowBusFactor,topAuthor,topAuthorShare',
            ...top.map((item) =>
              [
                `"${item.path.replace(/"/g, '""')}"`,
                item.risk,
                item.churn,
                item.bugfixRatio,
                item.lowBusFactor,
                `"${item.topAuthor.replace(/"/g, '""')}"`,
                item.topAuthorShare,
              ].join(','),
            ),
          ].join('\n');

          downloadTextFile(
            `${filteredData?.repository.repo ?? 'repository'}-hotspots.csv`,
            csv,
            'text/csv;charset=utf-8',
          );
        }}
        onJumpToFile={(path) => setSelectedPath(path)}
      />
    </Box>
  );
}

export default App;
