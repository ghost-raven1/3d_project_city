import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { AppOverlayLayer } from './components/AppOverlayLayer';
import { ProductEmptyState } from './components/ProductEmptyState';
import { ProgressBar } from './components/ProgressBar';
import { TopControlPanel } from './components/TopControlPanel';
import { ConstructionWindow, ScenePerformanceTelemetry } from './components/scene/types';
import { useCollaboration } from './hooks/useCollaboration';
import { useNarrator } from './hooks/useNarrator';
import { useScenePreferences } from './hooks/useScenePreferences';
import { useTimelinePlayback } from './hooks/useTimelinePlayback';
import { useWebSocket } from './hooks/useWebSocket';
import { useRepoStore } from './store/useRepoStore';
import { NarratorManualCue, NarratorUiAction } from './types/narrator';
import { createCityDNA } from './utils/city-dna';
import {
  deriveBranchSignals,
  extractBranchNamesFromMessage,
  fileMatchesBranch,
} from './utils/branches';
import { analyzeRepositoryInsights } from './utils/insights';
import { getLanguageFromPath } from './utils/language';
import { buildFileRiskMap, riskBand } from './utils/risk';
import { buildSnapshot } from './utils/snapshot';

const Scene3DLazy = lazy(async () => {
  const module = await import('./components/Scene3D');
  return { default: module.Scene3D };
});

const DEFAULT_SCENE_PERFORMANCE: ScenePerformanceTelemetry = {
  fps: 0,
  runtimeProfile: 'cinematic',
  postFxQuality: 'high',
  adaptiveDpr: 1.45,
  adaptiveLoadScale: 1,
};

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

function extractNarratorQuestionFromChat(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const patterns = [
    /^\/(?:ask|narrator)\s+(.+)$/i,
    /^@narrator[\s,:-]+(.+)$/i,
    /^(?:рассказчик|нарратор)[\s,:-]+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match) {
      continue;
    }

    const question = (match[1] ?? '').trim();
    if (question) {
      return question.slice(0, 320);
    }
  }

  return null;
}

const UI_MODE_SEQUENCE = ['full', 'balanced', 'focus'] as const;
type UiMode = (typeof UI_MODE_SEQUENCE)[number];

function nextUiMode(current: UiMode): UiMode {
  const index = UI_MODE_SEQUENCE.indexOf(current);
  if (index < 0) {
    return 'full';
  }
  return UI_MODE_SEQUENCE[(index + 1) % UI_MODE_SEQUENCE.length] ?? 'full';
}

function isTypingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) {
    return false;
  }

  const tagName = node.tagName?.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  return Boolean(node.closest('[contenteditable="true"]'));
}

function App() {
  const autoParsedRef = useRef(false);
  const captureSceneRef = useRef<(() => Promise<Blob | null>) | null>(null);
  const { startParsing } = useWebSocket();
  const {
    roomId,
    nickname,
    roomAccessKey,
    activeRoomId,
    participants: roomParticipants,
    messages: roomMessages,
    pointers: roomPointers,
    roomError,
    queuedMessagesCount,
    selfSocketId,
    isSocketConnected,
    setRoomId,
    setNickname,
    setRoomAccessKey,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendPointer,
    clearRoomError,
  } = useCollaboration();

  const [fpsValue, setFpsValue] = useState(0);
  const [topHeaderHeight, setTopHeaderHeight] = useState(96);
  const [scenePerformance, setScenePerformance] = useState<ScenePerformanceTelemetry>(
    DEFAULT_SCENE_PERFORMANCE,
  );
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
  const [githubToken, setGithubToken] = useState('');
  const narratorRepoLoadedRef = useRef<string | null>(null);
  const narratorTrackRef = useRef<{
    viewMode?: string;
    selectedPath?: string | null;
    timelineLabel?: string;
    compareEnabled?: boolean;
    tourMode?: string;
  }>({});
  const narratorUiSnapshotRef = useRef<Record<string, string>>({});
  const narratorParserStatusRef = useRef<string>('');
  const narratorAppliedStoryRef = useRef<string | null>(null);

  const status = useRepoStore((state) => state.status);
  const progress = useRepoStore((state) => state.progress);
  const message = useRepoStore((state) => state.message);
  const stage = useRepoStore((state) => state.stage);
  const data = useRepoStore((state) => state.data);
  const error = useRepoStore((state) => state.error);
  const repoUrl = useRepoStore((state) => state.repoUrl);
  const hoveredPath = useRepoStore((state) => state.hoveredPath);
  const selectedPath = useRepoStore((state) => state.selectedPath);

  const setRepoUrl = useRepoStore((state) => state.setRepoUrl);
  const setHoveredPath = useRepoStore((state) => state.setHoveredPath);
  const setSelectedPath = useRepoStore((state) => state.setSelectedPath);

  const {
    autoTour,
    showAtmosphere,
    showWeather,
    showBuilders,
    showMinimap,
    showInsights,
    showBranchMap,
    showFileCard,
    showChat,
    showNarrator,
    showPostProcessing,
    adaptivePostFx,
    modePresetIntensity,
    visualPreset,
    targetFps,
    renderProfileLock,
    showFps,
    showCyberpunkOverlay,
    timeOfDay,
    weatherMode,
    dynamicAtmosphere,
    constructionMode,
    constructionSpeed,
    tourMode,
    followDroneIndex,
    walkBuildingPath,
    liveWatch,
    topPanelCollapsed,
    uiMode,
    effectiveTimeOfDay,
    effectiveWeatherMode,
    setAutoTour,
    setShowAtmosphere,
    setShowWeather,
    setShowBuilders,
    setShowMinimap,
    setShowInsights,
    setShowBranchMap,
    setShowFileCard,
    setShowChat,
    setShowNarrator,
    setShowPostProcessing,
    setAdaptivePostFx,
    setModePresetIntensity,
    setShowFps,
    setShowCyberpunkOverlay,
    setTimeOfDay,
    setWeatherMode,
    setDynamicAtmosphere,
    setConstructionMode,
    setConstructionSpeed,
    setTourMode,
    setFollowDroneIndex,
    setWalkBuildingPath,
    setLiveWatch,
    setTopPanelCollapsed,
    setUiMode,
    setVisualPreset,
    setTargetFps,
    setRenderProfileLock,
  } = useScenePreferences({ generatedAt: data?.generatedAt });
  const {
    stories: narratorStories,
    latestStory: latestNarratorStory,
    status: narratorStatus,
    error: narratorError,
    sendNarratorAction,
  } = useNarrator();

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'h') {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        setUiMode((current) => nextUiMode(current as UiMode));
        return;
      }

      setUiMode((current) => (current === 'focus' ? 'full' : 'focus'));
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setUiMode]);

  const cityDna = useMemo(() => createCityDNA(data), [data]);
  const {
    timelineBounds,
    timelineTs,
    compareTs,
    constructionProgress,
    setTimelineTs,
    setCompareTs,
  } = useTimelinePlayback({
    data,
    constructionMode,
    constructionSpeed,
    compareEnabled,
  });

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
    narratorTrackRef.current = {};
    narratorRepoLoadedRef.current = null;
    narratorUiSnapshotRef.current = {};
    narratorParserStatusRef.current = '';
    narratorAppliedStoryRef.current = null;
    setScenePerformance(DEFAULT_SCENE_PERFORMANCE);
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
  const focusUiMode = uiMode === 'focus';
  const showInsightsOverlay = showInsights && !focusUiMode;
  const showBranchMapOverlay = showBranchMap && !focusUiMode;
  const showFileCardOverlay = showFileCard && !focusUiMode;
  const showMinimapOverlay = showMinimap && !focusUiMode;
  const showChatOverlay = showChat && !focusUiMode;
  const showNarratorOverlay = showNarrator && !focusUiMode;
  const showStatusDockOverlay = !focusUiMode;

  const applyNarratorUiAction = useCallback(
    (action: NarratorUiAction) => {
      if (action.type === 'set_panel_visibility') {
        const value = action.value === 'on';
        if (action.target === 'chat') {
          setShowChat(value);
          return;
        }
        if (action.target === 'narrator') {
          setShowNarrator(value);
          return;
        }
        if (action.target === 'insights') {
          setShowInsights(value);
          return;
        }
        if (action.target === 'branch_map') {
          setShowBranchMap(value);
          return;
        }
        if (action.target === 'minimap') {
          setShowMinimap(value);
          return;
        }
        setShowFileCard(value);
        return;
      }

      if (!hasSceneData) {
        return;
      }

      if (action.type === 'set_view_mode') {
        setViewMode(action.value);
        return;
      }
      if (action.type === 'set_tour_mode') {
        setTourMode(action.value);
        return;
      }
      if (action.type === 'set_compare_enabled') {
        setCompareEnabled(action.value === 'on');
        return;
      }
      if (action.type === 'set_compare_mode') {
        setCompareEnabled(true);
        setCompareMode(action.value);
        return;
      }
      if (action.type === 'set_branch_only_mode') {
        setBranchOnlyMode(action.value === 'on');
        return;
      }
      if (action.type === 'select_file') {
        const normalized = action.value.trim().replace(/^\/+/, '').toLowerCase();
        if (!normalized || !filteredData) {
          return;
        }

        const matchedFile =
          filteredData.files.find((file) => file.path.toLowerCase() === normalized) ??
          filteredData.files.find((file) => file.path.toLowerCase().includes(normalized));
        if (!matchedFile) {
          return;
        }

        setSelectedPath(matchedFile.path);
        setShowFileCard(true);
      }
    },
    [
      filteredData,
      hasSceneData,
      setSelectedPath,
      setShowBranchMap,
      setShowChat,
      setShowFileCard,
      setShowInsights,
      setShowMinimap,
      setShowNarrator,
      setTourMode,
    ],
  );

  useEffect(() => {
    if (!latestNarratorStory) {
      return;
    }
    if (narratorAppliedStoryRef.current === latestNarratorStory.id) {
      return;
    }
    narratorAppliedStoryRef.current = latestNarratorStory.id;

    const uiActions = latestNarratorStory.uiActions ?? [];
    if (uiActions.length === 0) {
      return;
    }

    uiActions.forEach((action) => {
      applyNarratorUiAction(action);
    });
  }, [applyNarratorUiAction, latestNarratorStory]);

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

  useEffect(() => {
    if (!filteredData || !insights) {
      return;
    }
    if (narratorRepoLoadedRef.current === filteredData.generatedAt) {
      return;
    }
    narratorRepoLoadedRef.current = filteredData.generatedAt;

    sendNarratorAction({
      type: 'repo_loaded',
      repoUrl,
      viewMode,
      timelineLabel,
      compareEnabled,
      compareLabel: compareEnabled ? compareLabel : null,
      tourMode,
      stats: {
        totalFiles: insights.totalFiles,
        totalCommits: insights.totalCommits,
        topLanguage: insights.languages[0]?.name ?? null,
        hotspotPath:
          Array.from(riskProfiles.entries())
            .sort((a, b) => b[1].risk - a[1].risk)[0]?.[0] ?? null,
      },
    });
  }, [
    compareEnabled,
    compareLabel,
    filteredData,
    insights,
    repoUrl,
    riskProfiles,
    sendNarratorAction,
    timelineLabel,
    tourMode,
    viewMode,
  ]);

  useEffect(() => {
    if (!hasSceneData || narratorTrackRef.current.viewMode === viewMode) {
      return;
    }
    narratorTrackRef.current.viewMode = viewMode;
    sendNarratorAction({
      type: 'mode_change',
      repoUrl,
      viewMode,
      timelineLabel,
      compareEnabled,
      compareLabel: compareEnabled ? compareLabel : null,
      tourMode,
    });
  }, [
    compareEnabled,
    compareLabel,
    hasSceneData,
    repoUrl,
    sendNarratorAction,
    timelineLabel,
    tourMode,
    viewMode,
  ]);

  useEffect(() => {
    if (!hasSceneData || narratorTrackRef.current.compareEnabled === compareEnabled) {
      return;
    }
    narratorTrackRef.current.compareEnabled = compareEnabled;
    sendNarratorAction({
      type: 'compare_toggle',
      repoUrl,
      viewMode,
      timelineLabel,
      selectedPath,
      compareEnabled,
      compareLabel: compareEnabled ? compareLabel : null,
      tourMode,
    });
  }, [
    compareEnabled,
    compareLabel,
    hasSceneData,
    repoUrl,
    selectedPath,
    sendNarratorAction,
    timelineLabel,
    tourMode,
    viewMode,
  ]);

  useEffect(() => {
    if (!hasSceneData || narratorTrackRef.current.tourMode === tourMode) {
      return;
    }
    narratorTrackRef.current.tourMode = tourMode;
    sendNarratorAction({
      type: 'tour_mode',
      repoUrl,
      viewMode,
      timelineLabel,
      selectedPath,
      compareEnabled,
      compareLabel: compareEnabled ? compareLabel : null,
      tourMode,
    });
  }, [
    compareEnabled,
    compareLabel,
    hasSceneData,
    repoUrl,
    selectedPath,
    sendNarratorAction,
    timelineLabel,
    tourMode,
    viewMode,
  ]);

  useEffect(() => {
    if (!hasSceneData || !selectedPath || narratorTrackRef.current.selectedPath === selectedPath) {
      return;
    }
    narratorTrackRef.current.selectedPath = selectedPath;
    sendNarratorAction({
      type: 'focus_file',
      repoUrl,
      viewMode,
      timelineLabel,
      selectedPath,
      compareEnabled,
      compareLabel: compareEnabled ? compareLabel : null,
      tourMode,
    });
  }, [
    compareEnabled,
    compareLabel,
    hasSceneData,
    repoUrl,
    selectedPath,
    sendNarratorAction,
    timelineLabel,
    tourMode,
    viewMode,
  ]);

  useEffect(() => {
    if (!hasSceneData) {
      return;
    }

    const handle = window.setTimeout(() => {
      if (narratorTrackRef.current.timelineLabel === timelineLabel) {
        return;
      }
      narratorTrackRef.current.timelineLabel = timelineLabel;
      sendNarratorAction({
        type: 'timeline_shift',
        repoUrl,
        viewMode,
        timelineLabel,
        selectedPath,
        compareEnabled,
        compareLabel: compareEnabled ? compareLabel : null,
        tourMode,
      });
    }, 720);

    return () => window.clearTimeout(handle);
  }, [
    compareEnabled,
    compareLabel,
    hasSceneData,
    repoUrl,
    selectedPath,
    sendNarratorAction,
    timelineLabel,
    tourMode,
    viewMode,
  ]);

  useEffect(() => {
    if (narratorParserStatusRef.current === status) {
      return;
    }

    const previous = narratorParserStatusRef.current;
    narratorParserStatusRef.current = status;
    if (!previous) {
      return;
    }

    sendNarratorAction({
      type: 'ui_interaction',
      interaction: 'parser.status',
      interactionValue: status,
      repoUrl,
      viewMode,
      timelineLabel,
      selectedPath,
      compareEnabled,
      compareLabel: compareEnabled ? compareLabel : null,
      tourMode,
    });
  }, [
    compareEnabled,
    compareLabel,
    repoUrl,
    selectedPath,
    sendNarratorAction,
    status,
    timelineLabel,
    tourMode,
    viewMode,
  ]);

  useEffect(() => {
    const snapshot: Record<string, string> = {
      languageFilter,
      authorFilter,
      districtFilter,
      branchFilter,
      branchOnlyMode: branchOnlyMode ? 'on' : 'off',
      riskFilter,
      pathFilter: pathFilter.trim(),
      compareMode,
      autoTour: autoTour ? 'on' : 'off',
      followDroneIndex: String(followDroneIndex),
      liveWatch: liveWatch ? 'on' : 'off',
      showAtmosphere: showAtmosphere ? 'on' : 'off',
      showWeather: showWeather ? 'on' : 'off',
      showBuilders: showBuilders ? 'on' : 'off',
      showMinimap: showMinimapOverlay ? 'on' : 'off',
      showInsights: showInsightsOverlay ? 'on' : 'off',
      showBranchMap: showBranchMapOverlay ? 'on' : 'off',
      showFileCard: showFileCardOverlay ? 'on' : 'off',
      showChat: showChatOverlay ? 'on' : 'off',
      showNarrator: showNarratorOverlay ? 'on' : 'off',
      showPostProcessing: showPostProcessing ? 'on' : 'off',
      adaptivePostFx: adaptivePostFx ? 'on' : 'off',
      modePresetIntensity: modePresetIntensity.toFixed(2),
      visualPreset,
      targetFps: String(targetFps),
      renderProfileLock,
      showFps: showFps ? 'on' : 'off',
      showCyberpunkOverlay: showCyberpunkOverlay ? 'on' : 'off',
      timeOfDay,
      weatherMode,
      dynamicAtmosphere: dynamicAtmosphere ? 'on' : 'off',
      constructionMode: constructionMode ? 'on' : 'off',
      constructionSpeed: constructionSpeed.toFixed(2),
      topPanelCollapsed: topPanelCollapsed ? 'on' : 'off',
      uiMode,
      showStatusDock: showStatusDockOverlay ? 'on' : 'off',
      activeRoomId: activeRoomId ?? 'none',
      roomConnected: isSocketConnected ? 'on' : 'off',
      walkBuildingPath: walkBuildingPath ?? 'none',
    };

    const previous = narratorUiSnapshotRef.current;
    const previousKeys = Object.keys(previous);
    if (previousKeys.length === 0) {
      narratorUiSnapshotRef.current = snapshot;
      return;
    }

    const changed = Object.entries(snapshot)
      .filter(([key, value]) => previous[key] !== value)
      .map(([key, value]) => ({ key, value }));
    narratorUiSnapshotRef.current = snapshot;

    if (changed.length === 0 || !hasSceneData) {
      return;
    }

    const basePayload = {
      repoUrl,
      viewMode,
      timelineLabel,
      selectedPath,
      compareEnabled,
      compareLabel: compareEnabled ? compareLabel : null,
      tourMode,
    } as const;

    if (changed.length > 4) {
      sendNarratorAction({
        type: 'ui_interaction',
        interaction: 'ui.batch',
        interactionValue: changed
          .slice(0, 6)
          .map((item) => `${item.key}=${item.value}`)
          .join(', '),
        ...basePayload,
      });
      return;
    }

    changed.forEach((item) => {
      sendNarratorAction({
        type: 'ui_interaction',
        interaction: `ui.${item.key}`,
        interactionValue: item.value,
        ...basePayload,
      });
    });
  }, [
    activeRoomId,
    adaptivePostFx,
    authorFilter,
    autoTour,
    branchFilter,
    branchOnlyMode,
    compareEnabled,
    compareLabel,
    compareMode,
    constructionMode,
    constructionSpeed,
    districtFilter,
    dynamicAtmosphere,
    followDroneIndex,
    hasSceneData,
    isSocketConnected,
    languageFilter,
    liveWatch,
    modePresetIntensity,
    visualPreset,
    targetFps,
    renderProfileLock,
    pathFilter,
    repoUrl,
    riskFilter,
    selectedPath,
    sendNarratorAction,
    showAtmosphere,
    showBranchMapOverlay,
    showBranchMap,
    showBuilders,
    showChatOverlay,
    showChat,
    showCyberpunkOverlay,
    showFileCardOverlay,
    showFileCard,
    showFps,
    showInsightsOverlay,
    showInsights,
    showMinimapOverlay,
    showMinimap,
    showNarratorOverlay,
    showNarrator,
    showPostProcessing,
    showStatusDockOverlay,
    showWeather,
    timeOfDay,
    timelineLabel,
    topPanelCollapsed,
    tourMode,
    uiMode,
    viewMode,
    walkBuildingPath,
    weatherMode,
  ]);

  const totalCommitsByPath = useMemo(() => {
    const map = new Map<string, number>();
    (data?.files ?? []).forEach((file) => {
      map.set(file.path, Math.max(1, file.commits.length));
    });
    return map;
  }, [data]);
  const constructionWindowByPath = useMemo(() => {
    const map = new Map<string, ConstructionWindow>();
    if (!data || !timelineBounds) {
      return map;
    }

    const span = Math.max(1, timelineBounds.max - timelineBounds.min);
    data.files.forEach((file) => {
      let firstTs = Number.POSITIVE_INFINITY;
      let lastTs = Number.NEGATIVE_INFINITY;

      file.commits.forEach((commit) => {
        const ts = new Date(commit.date).getTime();
        if (Number.isNaN(ts)) {
          return;
        }

        firstTs = Math.min(firstTs, ts);
        lastTs = Math.max(lastTs, ts);
      });

      if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs)) {
        map.set(file.path, { start: 0, end: 1 });
        return;
      }

      const rawStart = (firstTs - timelineBounds.min) / span;
      const rawEnd = (lastTs - timelineBounds.min) / span;
      const start = Math.max(0, Math.min(1, rawStart));
      const end = Math.max(0, Math.min(1, rawEnd));

      const minimumWindow = 0.03;
      const boundedStart = Math.min(start, Math.max(0, 1 - minimumWindow));
      const boundedEnd = Math.max(
        boundedStart + minimumWindow,
        Math.min(1, Math.max(end, boundedStart)),
      );

      map.set(file.path, {
        start: boundedStart,
        end: Math.min(1, boundedEnd),
      });
    });

    return map;
  }, [data, timelineBounds]);
  const remotePointers = useMemo(
    () => roomPointers.filter((pointer) => pointer.socketId !== selfSocketId),
    [roomPointers, selfSocketId],
  );
  const handlePointerSample = useCallback(
    (sample: { x: number; y: number; z: number; path: string | null }) => {
      if (!activeRoomId) {
        return;
      }
      sendPointer(sample);
    },
    [activeRoomId, sendPointer],
  );
  const handleNarratorManualCue = useCallback(
    (cue: NarratorManualCue) => {
      if (!hasSceneData) {
        return;
      }

      sendNarratorAction({
        type: 'manual',
        manualCue: cue,
        repoUrl,
        viewMode,
        timelineLabel,
        selectedPath,
        compareEnabled,
        compareLabel: compareEnabled ? compareLabel : null,
        tourMode,
      });
    },
    [
      compareEnabled,
      compareLabel,
      hasSceneData,
      repoUrl,
      selectedPath,
      sendNarratorAction,
      timelineLabel,
      tourMode,
      viewMode,
    ],
  );

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
          <Suspense
            fallback={
              <Box sx={{ p: { xs: 1.2, md: 2 }, height: '100%' }}>
                <Box
                  sx={{
                    p: { xs: 1.2, md: 2 },
                    height: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    background:
                      'radial-gradient(circle at 14% 18%, rgba(96,223,255,0.12), transparent 38%), radial-gradient(circle at 83% 26%, rgba(105,134,255,0.16), transparent 34%), linear-gradient(160deg, rgba(8,18,40,0.55), rgba(8,18,40,0.24))',
                    borderRadius: 3,
                  }}
                >
                  <ProgressBar
                    title="Bootstrapping City Engine"
                    subtitle="Streaming meshes, lighting and simulation layers"
                    message="Compiling scene modules and calibrating cinematic pipeline..."
                    sx={{ width: 'min(560px, 92vw)' }}
                  />
                </Box>
              </Box>
            }
          >
            <Scene3DLazy
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
              showAtmosphere={showAtmosphere}
              showWeather={showWeather}
              showBuilders={showBuilders}
              showPostProcessing={showPostProcessing}
              adaptivePostFx={adaptivePostFx}
              modePresetIntensity={modePresetIntensity}
              visualPreset={visualPreset}
              targetFps={targetFps}
              renderProfileLock={renderProfileLock}
              showFps={showFps}
              tourMode={tourMode}
              followDroneIndex={followDroneIndex}
              livePointers={remotePointers}
              timeOfDay={effectiveTimeOfDay}
              weatherMode={effectiveWeatherMode}
              totalCommitsByPath={totalCommitsByPath}
              constructionWindowByPath={constructionWindowByPath}
              constructionMode={constructionMode}
              constructionProgress={constructionProgress}
              onHover={setHoveredPath}
              onSelect={setSelectedPath}
              onCaptureReady={(capture) => {
                captureSceneRef.current = capture;
              }}
              onFpsUpdate={setFpsValue}
              onPerformanceTelemetry={setScenePerformance}
              onFollowDroneChange={setFollowDroneIndex}
              onWalkBuildingChange={setWalkBuildingPath}
              onPointerSample={handlePointerSample}
            />
          </Suspense>
        ) : (
          <ProductEmptyState
            onParseRepo={(repo) => {
              setRepoUrl(repo);
              startParsing(repo, githubToken);
            }}
          />
        )}

        <AppOverlayLayer
          hasSceneData={hasSceneData}
          isBusy={isBusy}
          parseStatus={status}
          progress={progress}
          message={message}
          stage={stage}
          showFps={showFps}
          fpsValue={fpsValue}
          scenePerformance={scenePerformance}
          selectedFile={selectedFile}
          selectedRiskProfile={selectedRiskProfile}
          insights={insights}
          filteredData={filteredData}
          branchFilter={branchFilter}
          branchOnlyMode={branchOnlyMode}
          selectedPath={selectedPath}
          hoveredPath={hoveredPath}
          showFileCard={showFileCardOverlay}
          showInsights={showInsightsOverlay}
          showBranchMap={showBranchMapOverlay}
          showMinimap={showMinimapOverlay}
          showChat={showChatOverlay}
          showNarrator={showNarratorOverlay}
          showStatusDock={showStatusDockOverlay}
          showCyberpunkOverlay={showCyberpunkOverlay}
          showAtmosphere={showAtmosphere}
          topHeaderHeight={topHeaderHeight}
          effectiveTimeOfDay={effectiveTimeOfDay}
          effectiveWeatherMode={effectiveWeatherMode}
          dynamicAtmosphere={dynamicAtmosphere}
          viewMode={viewMode}
          uiMode={uiMode}
          cityDna={cityDna}
          tourMode={tourMode}
          walkBuildingPath={walkBuildingPath}
          liveWatch={liveWatch}
          roomId={roomId}
          nickname={nickname}
          roomAccessKey={roomAccessKey}
          activeRoomId={activeRoomId}
          roomParticipants={roomParticipants}
          roomMessages={roomMessages}
          roomError={roomError}
          queuedMessagesCount={queuedMessagesCount}
          selfSocketId={selfSocketId}
          isSocketConnected={isSocketConnected}
          narratorStories={narratorStories}
          narratorStatus={narratorStatus}
          narratorError={narratorError}
          onNarratorManualCue={handleNarratorManualCue}
          onSelectPath={setSelectedPath}
          onCloseFileCard={() => setSelectedPath(null)}
          onSelectBranch={setBranchFilter}
          onToggleBranchOnly={setBranchOnlyMode}
          onRoomIdChange={setRoomId}
          onNicknameChange={setNickname}
          onRoomAccessKeyChange={setRoomAccessKey}
          onJoinRoom={() => {
            joinRoom();
            sendNarratorAction({
              type: 'ui_interaction',
              interaction: 'chat.join',
              interactionValue: roomId || null,
              repoUrl,
              viewMode,
              timelineLabel,
              selectedPath,
              compareEnabled,
              compareLabel: compareEnabled ? compareLabel : null,
              tourMode,
            });
          }}
          onLeaveRoom={() => {
            leaveRoom();
            sendNarratorAction({
              type: 'ui_interaction',
              interaction: 'chat.leave',
              interactionValue: activeRoomId ?? roomId,
              repoUrl,
              viewMode,
              timelineLabel,
              selectedPath,
              compareEnabled,
              compareLabel: compareEnabled ? compareLabel : null,
              tourMode,
            });
          }}
          onSendMessage={(text, attachments, replyToId) => {
            const sourceMessageId = sendMessage(text, attachments, replyToId);
            const narratorQuestion = extractNarratorQuestionFromChat(text);
            if (narratorQuestion) {
              sendNarratorAction({
                type: 'chat_question',
                question: narratorQuestion,
                sourceMessageId,
                interaction: 'chat.ask',
                interactionValue: `len=${narratorQuestion.length};files=${attachments.length}`,
                repoUrl,
                viewMode,
                timelineLabel,
                selectedPath,
                compareEnabled,
                compareLabel: compareEnabled ? compareLabel : null,
                tourMode,
                stats: insights
                  ? {
                      totalFiles: insights.totalFiles,
                      totalCommits: insights.totalCommits,
                      topLanguage: insights.languages[0]?.name ?? null,
                      hotspotPath:
                        Array.from(riskProfiles.entries())
                          .sort((a, b) => b[1].risk - a[1].risk)[0]?.[0] ?? null,
                    }
                  : undefined,
              });
              return;
            }

            sendNarratorAction({
              type: 'ui_interaction',
              interaction: 'chat.message',
              interactionValue: `text=${text.trim().length};files=${attachments.length}${
                replyToId ? ';reply=1' : ''
              }`,
              repoUrl,
              viewMode,
              timelineLabel,
              selectedPath,
              compareEnabled,
              compareLabel: compareEnabled ? compareLabel : null,
              tourMode,
            });
          }}
          onClearRoomError={clearRoomError}
        />
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
        scenePerformance={scenePerformance}
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
        tourMode={tourMode}
        followDroneIndex={followDroneIndex}
        liveWatch={liveWatch}
        showAtmosphere={showAtmosphere}
        showWeather={showWeather}
        showBuilders={showBuilders}
        showMinimap={showMinimap}
        showInsights={showInsights}
        showBranchMap={showBranchMap}
        showFileCard={showFileCard}
        showChat={showChat}
        showNarrator={showNarrator}
        showPostProcessing={showPostProcessing}
        adaptivePostFx={adaptivePostFx}
        modePresetIntensity={modePresetIntensity}
        visualPreset={visualPreset}
        targetFps={targetFps}
        renderProfileLock={renderProfileLock}
        showFps={showFps}
        showCyberpunkOverlay={showCyberpunkOverlay}
        timeOfDay={timeOfDay}
        weatherMode={weatherMode}
        dynamicAtmosphere={dynamicAtmosphere}
        constructionMode={constructionMode}
        constructionSpeed={constructionSpeed}
        constructionProgress={constructionProgress}
        uiMode={uiMode}
        collapsed={topPanelCollapsed}
        onToggleCollapsed={() => setTopPanelCollapsed((value) => !value)}
        onRepoUrlChange={setRepoUrl}
        onGithubTokenChange={setGithubToken}
        onStartParsing={() => {
          sendNarratorAction({
            type: 'ui_interaction',
            interaction: 'parser.start',
            interactionValue: repoUrl || null,
            repoUrl,
            viewMode,
            timelineLabel,
            selectedPath,
            compareEnabled,
            compareLabel: compareEnabled ? compareLabel : null,
            tourMode,
          });
          startParsing(repoUrl, githubToken);
        }}
        onTimelineChange={setTimelineTs}
        onAutoTourChange={setAutoTour}
        onTourModeChange={setTourMode}
        onFollowDroneIndexChange={setFollowDroneIndex}
        onLiveWatchChange={setLiveWatch}
        onShowAtmosphereChange={setShowAtmosphere}
        onShowWeatherChange={setShowWeather}
        onShowBuildersChange={setShowBuilders}
        onShowMinimapChange={setShowMinimap}
        onShowInsightsChange={setShowInsights}
        onShowBranchMapChange={setShowBranchMap}
        onShowFileCardChange={setShowFileCard}
        onShowChatChange={setShowChat}
        onShowNarratorChange={setShowNarrator}
        onShowPostProcessingChange={setShowPostProcessing}
        onAdaptivePostFxChange={setAdaptivePostFx}
        onModePresetIntensityChange={setModePresetIntensity}
        onVisualPresetChange={setVisualPreset}
        onTargetFpsChange={setTargetFps}
        onRenderProfileLockChange={setRenderProfileLock}
        onShowFpsChange={setShowFps}
        onShowCyberpunkOverlayChange={setShowCyberpunkOverlay}
        onTimeOfDayChange={setTimeOfDay}
        onWeatherModeChange={setWeatherMode}
        onDynamicAtmosphereChange={setDynamicAtmosphere}
        onConstructionModeChange={setConstructionMode}
        onConstructionSpeedChange={setConstructionSpeed}
        onUiModeChange={setUiMode}
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
          sendNarratorAction({
            type: 'ui_interaction',
            interaction: 'export.summary',
            interactionValue: 'clipboard',
            repoUrl,
            viewMode,
            timelineLabel,
            selectedPath,
            compareEnabled,
            compareLabel: compareEnabled ? compareLabel : null,
            tourMode,
          });
          const summary = buildExecutiveSummary();
          try {
            await navigator.clipboard.writeText(summary);
          } catch {
            console.warn('Failed to copy summary to clipboard.');
          }
        }}
        onExportPng={async () => {
          sendNarratorAction({
            type: 'ui_interaction',
            interaction: 'export.png',
            interactionValue: 'scene-capture',
            repoUrl,
            viewMode,
            timelineLabel,
            selectedPath,
            compareEnabled,
            compareLabel: compareEnabled ? compareLabel : null,
            tourMode,
          });
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
          sendNarratorAction({
            type: 'ui_interaction',
            interaction: 'export.json',
            interactionValue: 'snapshot',
            repoUrl,
            viewMode,
            timelineLabel,
            selectedPath,
            compareEnabled,
            compareLabel: compareEnabled ? compareLabel : null,
            tourMode,
          });
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
          sendNarratorAction({
            type: 'ui_interaction',
            interaction: 'export.hotspots',
            interactionValue: 'csv',
            repoUrl,
            viewMode,
            timelineLabel,
            selectedPath,
            compareEnabled,
            compareLabel: compareEnabled ? compareLabel : null,
            tourMode,
          });
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
        onJumpToFile={(path) => {
          setSelectedPath(path);
          sendNarratorAction({
            type: 'ui_interaction',
            interaction: 'ui.jump_to_file',
            interactionValue: path,
            repoUrl,
            viewMode,
            timelineLabel,
            selectedPath: path,
            compareEnabled,
            compareLabel: compareEnabled ? compareLabel : null,
            tourMode,
          });
        }}
        onHeaderHeightChange={(height) => {
          setTopHeaderHeight((current) =>
            Math.abs(current - height) < 2 ? current : height,
          );
        }}
      />
    </Box>
  );
}

export default App;
