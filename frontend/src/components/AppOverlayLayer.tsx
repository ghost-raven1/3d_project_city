import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { BranchTreePanel } from './BranchTreePanel';
import { ChatDock } from './ChatDock';
import { CyberpunkCanvasOverlay } from './CyberpunkCanvasOverlay';
import { FileInfoCard } from './FileInfoCard';
import { InsightPanel } from './InsightPanel';
import { Minimap } from './Minimap';
import { MusicPlayerDock } from './MusicPlayerDock';
import { NarratorPanel } from './NarratorPanel';
import { ProgressBar } from './ProgressBar';
import { ProductStatusDock } from './ProductStatusDock';
import { FileRiskProfile } from '../utils/risk';
import { RepositoryInsights } from '../utils/insights';
import { RepositoryResult, PositionedFileHistory } from '../types/repository';
import { ParseStatus } from '../types/repository';
import { CityDNA } from '../utils/city-dna';
import {
  CoasterDriveProfile,
  CoasterTelemetry,
  MusicSpectrumTelemetry,
  ScenePerformanceTelemetry,
  TourMode,
} from './scene/types';
import {
  ChatAttachmentDraft,
  RoomMessage,
  RoomParticipant,
} from '../types/collaboration';
import { NarratorManualCue, NarratorStory } from '../types/narrator';
import { panelSurfaceSx } from './panelStyles';

function formatCoasterTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return '--:--';
  }
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const remaining = clamped - minutes * 60;
  return `${minutes}:${remaining.toFixed(1).padStart(4, '0')}`;
}

function finiteNumber(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

interface AppOverlayLayerProps {
  hasSceneData: boolean;
  isBusy: boolean;
  parseStatus: ParseStatus;
  progress: number;
  message: string;
  stage: string;
  showFps: boolean;
  fpsValue: number;
  scenePerformance: ScenePerformanceTelemetry;
  selectedFile: PositionedFileHistory | null;
  selectedRiskProfile: FileRiskProfile | null;
  insights: RepositoryInsights | null;
  filteredData: RepositoryResult | null;
  branchFilter: string;
  branchOnlyMode: boolean;
  selectedPath: string | null;
  hoveredPath: string | null;
  showFileCard: boolean;
  showInsights: boolean;
  showBranchMap: boolean;
  showMinimap: boolean;
  showChat: boolean;
  showNarrator: boolean;
  showStatusDock: boolean;
  showCyberpunkOverlay: boolean;
  showAtmosphere: boolean;
  topHeaderHeight: number;
  effectiveTimeOfDay: 'auto' | 'dawn' | 'day' | 'sunset' | 'night';
  effectiveWeatherMode: 'auto' | 'clear' | 'mist' | 'rain' | 'storm';
  dynamicAtmosphere: boolean;
  viewMode: 'overview' | 'architecture' | 'risk' | 'stack';
  uiMode: 'full' | 'balanced' | 'focus';
  cityDna: CityDNA | null;
  tourMode: TourMode;
  coasterProfile: CoasterDriveProfile;
  coasterTelemetry: CoasterTelemetry | null;
  walkBuildingPath: string | null;
  liveWatch: boolean;
  roomId: string;
  nickname: string;
  roomAccessKey: string;
  activeRoomId: string | null;
  roomParticipants: RoomParticipant[];
  roomMessages: RoomMessage[];
  roomError: string | null;
  queuedMessagesCount: number;
  selfSocketId: string | null;
  isSocketConnected: boolean;
  narratorStories: NarratorStory[];
  narratorStatus: 'idle' | 'thinking' | 'error';
  narratorError: string | null;
  onNarratorManualCue: (cue: NarratorManualCue) => void;
  onSelectPath: (path: string | null) => void;
  onCloseFileCard: () => void;
  onSelectBranch: (branch: string) => void;
  onToggleBranchOnly: (value: boolean) => void;
  onRoomIdChange: (value: string) => void;
  onNicknameChange: (value: string) => void;
  onRoomAccessKeyChange: (value: string) => void;
  onJoinRoom: () => void;
  onLeaveRoom: () => void;
  onSendMessage: (
    text: string,
    attachments: ChatAttachmentDraft[],
    replyToId: string | null,
  ) => void;
  onClearRoomError: () => void;
  onCoasterThrottleChange?: (throttle: number | null) => void;
  onCoasterProfileChange?: (profile: CoasterDriveProfile) => void;
  onCoasterCameraToggle?: () => void;
  onCoasterReset?: () => void;
  onCoasterRegenerate?: () => void;
  onMusicSpectrumChange?: (telemetry: MusicSpectrumTelemetry | null) => void;
}

export function AppOverlayLayer({
  hasSceneData,
  isBusy,
  parseStatus,
  progress,
  message,
  stage,
  showFps,
  fpsValue,
  scenePerformance,
  selectedFile,
  selectedRiskProfile,
  insights,
  filteredData,
  branchFilter,
  branchOnlyMode,
  selectedPath,
  hoveredPath,
  showFileCard,
  showInsights,
  showBranchMap,
  showMinimap,
  showChat,
  showNarrator,
  showStatusDock,
  showCyberpunkOverlay,
  showAtmosphere,
  topHeaderHeight,
  effectiveTimeOfDay,
  effectiveWeatherMode,
  dynamicAtmosphere,
  viewMode,
  uiMode,
  cityDna,
  tourMode,
  coasterProfile,
  coasterTelemetry,
  walkBuildingPath,
  liveWatch,
  roomId,
  nickname,
  roomAccessKey,
  activeRoomId,
  roomParticipants,
  roomMessages,
  roomError,
  queuedMessagesCount,
  selfSocketId,
  isSocketConnected,
  narratorStories,
  narratorStatus,
  narratorError,
  onNarratorManualCue,
  onSelectPath,
  onCloseFileCard,
  onSelectBranch,
  onToggleBranchOnly,
  onRoomIdChange,
  onNicknameChange,
  onRoomAccessKeyChange,
  onJoinRoom,
  onLeaveRoom,
  onSendMessage,
  onClearRoomError,
  onCoasterThrottleChange,
  onCoasterProfileChange,
  onCoasterCameraToggle,
  onCoasterReset,
  onCoasterRegenerate,
  onMusicSpectrumChange,
}: AppOverlayLayerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isShortViewport = useMediaQuery('(max-height: 860px)');
  const isVeryShortViewport = useMediaQuery('(max-height: 740px)');
  const [narratorMeasuredHeight, setNarratorMeasuredHeight] = useState(0);
  const [narratorMeasuredWidth, setNarratorMeasuredWidth] = useState(0);
  const [branchMeasuredWidth, setBranchMeasuredWidth] = useState(0);
  const [chatMeasuredHeight, setChatMeasuredHeight] = useState(0);
  const [statusMeasuredHeight, setStatusMeasuredHeight] = useState(0);
  const [musicMeasuredHeight, setMusicMeasuredHeight] = useState(0);
  const [minimapMeasuredHeight, setMinimapMeasuredHeight] = useState(0);
  const compactUi = uiMode === 'balanced';
  const panelCompact = compactUi || isShortViewport;
  const showFileInfo = Boolean(selectedFile && showFileCard);
  const showChatDock = showChat;
  const suppressLeftBottomPanelsForFileCardMobile = isMobile && showFileInfo;
  const suppressNarratorForFileCardMobile = isMobile && showFileInfo;
  const showChatLayer = showChatDock && !suppressLeftBottomPanelsForFileCardMobile;
  const showStatusLayer = !showChatLayer && showStatusDock && !suppressLeftBottomPanelsForFileCardMobile;
  const showMusicLayer = hasSceneData && !suppressLeftBottomPanelsForFileCardMobile;
  const showNarratorRequested = hasSceneData && showNarrator;
  const forceSingleMobileDock = isMobile && isVeryShortViewport;
  const showNarratorPanel =
    showNarratorRequested &&
    !suppressNarratorForFileCardMobile &&
    (!forceSingleMobileDock || !showChatDock);
  const mobilePanelPriorityMode = isMobile && (showChatDock || showNarratorPanel);
  const showInsightPanel =
    hasSceneData &&
    Boolean(insights) &&
    showInsights &&
    !showFileInfo &&
    !mobilePanelPriorityMode;
  const showBranchPanel =
    hasSceneData &&
    Boolean(filteredData) &&
    showBranchMap &&
    !showFileInfo &&
    !mobilePanelPriorityMode;
  const overlayGap = panelCompact ? 8 : 12;
  const overlayBottomInset = isVeryShortViewport ? 8 : isShortViewport ? 10 : 14;
  const overlayTopMin = isVeryShortViewport ? 60 : isShortViewport ? 68 : 74;
  const safeHeaderHeight = Number.isFinite(topHeaderHeight)
    ? Math.max(72, topHeaderHeight)
    : 96;
  const panelTopOffset = Math.max(overlayTopMin, safeHeaderHeight + overlayGap);
  const narratorTopOffset = panelTopOffset;
  const narratorDockHeight = narratorMeasuredHeight > 0 ? narratorMeasuredHeight : 0;
  const narratorOffsetReady =
    !showNarratorPanel || narratorMeasuredHeight > 0;
  const shouldRenderBranchPanel = showBranchPanel && narratorOffsetReady;
  const branchTopOffset = showNarratorPanel
    ? narratorTopOffset + narratorDockHeight + (narratorDockHeight > 0 ? overlayGap : 0)
    : panelTopOffset;
  const branchDockWidth = shouldRenderBranchPanel ? branchMeasuredWidth : 0;
  const narratorDockWidth = showNarratorPanel
    ? narratorMeasuredWidth
    : 0;
  const rightDockWidthReady =
    (!showNarratorPanel || narratorMeasuredWidth > 0) &&
    (!shouldRenderBranchPanel || branchMeasuredWidth > 0);
  const rightDockWidth = Math.max(branchDockWidth, narratorDockWidth);
  const fileCardDesktopRight = rightDockWidth > 0 ? rightDockWidth + 12 : 20;
  const minimapRightOffset = rightDockWidth > 0 ? rightDockWidth + 16 : 16;
  const activeChatDockHeight = showChatLayer ? chatMeasuredHeight : 0;
  const activeStatusDockHeight = showStatusLayer ? statusMeasuredHeight : 0;
  const activeMusicDockHeight = showMusicLayer ? musicMeasuredHeight : 0;
  const activeMinimapHeight =
    showMinimap && !showFileInfo ? minimapMeasuredHeight : 0;
  const leftBottomReady =
    (!showChatLayer || chatMeasuredHeight > 0) &&
    (showChatLayer || !showStatusLayer || statusMeasuredHeight > 0) &&
    (!showMusicLayer || musicMeasuredHeight > 0);
  const rightBottomReady = !showMinimap || showFileInfo || minimapMeasuredHeight > 0;
  const rightAwarePlacementReady =
    (!showNarratorPanel && !shouldRenderBranchPanel) || rightDockWidthReady;
  const centerOverlayReady = leftBottomReady && rightBottomReady;
  const neutralBottomReserve = overlayBottomInset + overlayGap;
  const leftBottomReserveBase = showChatLayer
    ? activeChatDockHeight + overlayBottomInset + overlayGap
    : showStatusLayer
      ? activeStatusDockHeight + overlayBottomInset + overlayGap
      : neutralBottomReserve;
  const musicDockBottomOffset = leftBottomReserveBase;
  const leftBottomReserveFinal = showMusicLayer
    ? musicDockBottomOffset + activeMusicDockHeight + (activeMusicDockHeight > 0 ? overlayGap : 0)
    : leftBottomReserveBase;
  const rightBottomReserve = showMinimap && !showFileInfo
    ? activeMinimapHeight + overlayBottomInset + overlayGap
    : neutralBottomReserve;
  const rightBottomReserveFinal = rightBottomReserve;
  const centerBottomBase = Math.max(
    neutralBottomReserve,
    leftBottomReserveFinal,
    rightBottomReserveFinal,
  );
  const centerBusyBottom = centerBottomBase + overlayGap;
  const centerFpsBottom = centerBusyBottom + (hasSceneData && isBusy ? 44 : 0);
  const centerWalkBottom = centerFpsBottom + (hasSceneData && showFps && !isVeryShortViewport ? 42 : 0);
  const coasterSpeedMps = Math.max(0, finiteNumber(coasterTelemetry?.speed, 0));
  const coasterSpeedKmh = Math.max(
    0,
    Math.round(coasterSpeedMps * 3.6),
  );
  const coasterSpeedRatio = Math.max(0, Math.min(1, coasterSpeedKmh / 120));
  const coasterGaugeFill = `${Math.round(coasterSpeedRatio * 360)}deg`;
  const coasterGForce = finiteNumber(coasterTelemetry?.gForce, 1);
  const coasterSlope = finiteNumber(coasterTelemetry?.slope, 0);
  const coasterSlopePercent = Math.round(coasterSlope * 100);
  const coasterSlopeLabel = `${coasterSlopePercent > 0 ? '+' : ''}${coasterSlopePercent}%`;
  const coasterClearance = Number.isFinite(coasterTelemetry?.clearance)
    ? (coasterTelemetry?.clearance as number)
    : Number.POSITIVE_INFINITY;
  const coasterThrottle = Math.max(-1, Math.min(1, finiteNumber(coasterTelemetry?.throttle, 0)));
  const coasterThrottleState =
    coasterThrottle > 0.25
      ? 'Boost'
      : coasterThrottle < -0.25
        ? 'Brake'
        : 'Cruise';
  const coasterCameraMode =
    coasterTelemetry?.cameraMode === 'chase'
      ? 'Chase cam'
      : 'Seat cam';
  const coasterRideState =
    coasterTelemetry?.emergencyBrake
      ? 'Safety brake'
      : coasterGForce > 2.6
        ? 'High load'
        : coasterGForce < 0.8
          ? 'Light glide'
        : 'Stable';
  const coasterAcceleration = finiteNumber(coasterTelemetry?.acceleration, 0);
  const coasterLapTime = formatCoasterTime(finiteNumber(coasterTelemetry?.lapTimeSec, 0));
  const coasterBestLap = formatCoasterTime(
    coasterTelemetry?.bestLapSec === null
      ? null
      : finiteNumber(coasterTelemetry?.bestLapSec, Number.NaN),
  );
  const coasterTopSpeedKmh = Math.max(
    0,
    Math.round(Math.max(0, finiteNumber(coasterTelemetry?.topSpeed, 0)) * 3.6),
  );
  const coasterLap = Math.max(0, Math.floor(finiteNumber(coasterTelemetry?.lap, 0)));
  const coasterProfileLabel =
    coasterProfile === 'comfort'
      ? 'Comfort'
      : coasterProfile === 'extreme'
        ? 'Extreme'
        : 'Sport';
  const repositoryLabel = filteredData
    ? `${filteredData.repository.owner}/${filteredData.repository.repo}`
    : 'Repository City';
  const filesCount = filteredData?.files.length ?? 0;
  const commitsCount = filteredData?.totalCommits ?? 0;
  const branchCount = filteredData?.branches.length ?? 0;
  const modeLabel =
    viewMode === 'architecture'
      ? 'Architecture'
      : viewMode === 'risk'
        ? 'Risk'
        : viewMode === 'stack'
          ? 'Stack'
          : 'Overview';
  const atmosphereLabel = `${effectiveTimeOfDay.toUpperCase()} · ${effectiveWeatherMode.toUpperCase()}`;
  const signalCoverage = Math.round(
    Math.max(
      0,
      Math.min(
        1,
        scenePerformance.fovBuildingCoverage * 0.5 +
          scenePerformance.fovRoadCoverage * 0.3 +
          scenePerformance.fovDistrictCoverage * 0.2,
      ),
    ) * 100,
  );
  const runtimeBadge = `${scenePerformance.runtimeProfile.toUpperCase()} · ${scenePerformance.postFxQuality.toUpperCase()}`;
  const liveIndicatorColor =
    parseStatus === 'error'
      ? '#ff6f8d'
      : isSocketConnected
        ? '#76ffc8'
        : '#ffd789';
  const sceneAccent = cityDna?.palette.accent ?? '#6feaff';
  const showMissionHud =
    hasSceneData && rightAwarePlacementReady && !isVeryShortViewport;
  const handleCoasterBoostPress = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onCoasterThrottleChange?.(1);
  }, [onCoasterThrottleChange]);
  const handleCoasterBrakePress = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onCoasterThrottleChange?.(-1);
  }, [onCoasterThrottleChange]);
  const handleCoasterThrottleRelease = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onCoasterThrottleChange?.(null);
  }, [onCoasterThrottleChange]);
  const handleNarratorHeightChange = useCallback((height: number) => {
    setNarratorMeasuredHeight((current) =>
      Math.abs(current - height) < 2 ? current : height,
    );
  }, []);
  const handleNarratorWidthChange = useCallback((width: number) => {
    setNarratorMeasuredWidth((current) =>
      Math.abs(current - width) < 2 ? current : width,
    );
  }, []);
  const handleBranchWidthChange = useCallback((width: number) => {
    setBranchMeasuredWidth((current) =>
      Math.abs(current - width) < 2 ? current : width,
    );
  }, []);
  const handleChatHeightChange = useCallback((height: number) => {
    setChatMeasuredHeight((current) =>
      Math.abs(current - height) < 2 ? current : height,
    );
  }, []);
  const handleStatusHeightChange = useCallback((height: number) => {
    setStatusMeasuredHeight((current) =>
      Math.abs(current - height) < 2 ? current : height,
    );
  }, []);
  const handleMusicHeightChange = useCallback((height: number) => {
    setMusicMeasuredHeight((current) =>
      Math.abs(current - height) < 2 ? current : height,
    );
  }, []);
  const handleMinimapHeightChange = useCallback((height: number) => {
    setMinimapMeasuredHeight((current) =>
      Math.abs(current - height) < 2 ? current : height,
    );
  }, []);

  useEffect(() => {
    if (!showNarratorRequested) {
      setNarratorMeasuredHeight(0);
      setNarratorMeasuredWidth(0);
    }
  }, [showNarratorRequested]);

  useEffect(() => {
    if (!showBranchPanel) {
      setBranchMeasuredWidth(0);
    }
  }, [showBranchPanel]);

  useEffect(() => {
    if (!showChatLayer) {
      setChatMeasuredHeight(0);
    }
  }, [showChatLayer]);

  useEffect(() => {
    if (!showStatusLayer) {
      setStatusMeasuredHeight(0);
    }
  }, [showStatusLayer]);

  useEffect(() => {
    if (!showMusicLayer) {
      setMusicMeasuredHeight(0);
    }
  }, [showMusicLayer]);

  useEffect(() => {
    if (!showMinimap || showFileInfo) {
      setMinimapMeasuredHeight(0);
    }
  }, [showFileInfo, showMinimap]);

  useEffect(() => {
    if (tourMode !== 'coaster') {
      onCoasterThrottleChange?.(null);
    }
  }, [onCoasterThrottleChange, tourMode]);

  return (
    <>
      {hasSceneData && (
        <CyberpunkCanvasOverlay
          enabled={showCyberpunkOverlay}
          accentColor={cityDna?.palette.accent ?? '#2ec8ff'}
          seed={cityDna?.seed ?? 42}
          mode={viewMode}
          intensity={showAtmosphere ? 1 : 0.82}
        />
      )}

      {showMissionHud && (
        <Paper
          elevation={2}
          sx={[
            panelSurfaceSx,
            {
              position: 'absolute',
              top: panelTopOffset,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 12,
              pointerEvents: 'none',
              display: { xs: 'none', md: 'block' },
              width: 'fit-content',
              maxWidth: 'min(860px, calc(100% - 40px))',
              px: 1.45,
              py: 0.95,
              borderColor: alpha(sceneAccent, 0.58),
              background:
                `linear-gradient(148deg, ${alpha('#040f23', 0.93)} 0%, ${alpha('#091c39', 0.9)} 60%, ${alpha('#06132b', 0.95)} 100%),` +
                `radial-gradient(circle at 14% 22%, ${alpha(sceneAccent, 0.24)} 0%, transparent 48%)`,
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
                pointerEvents: 'none',
                background:
                  `linear-gradient(90deg, transparent 0%, ${alpha(sceneAccent, 0.15)} 48%, transparent 100%)`,
                transform: 'translateX(-100%)',
                animation: 'missionSweep 6.8s linear infinite',
              },
              '@keyframes missionSweep': {
                '0%': {
                  transform: 'translateX(-100%)',
                },
                '100%': {
                  transform: 'translateX(100%)',
                },
              },
            },
          ]}
        >
          <Stack direction="row" spacing={1.05} alignItems="center">
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: liveIndicatorColor,
                boxShadow: `0 0 0 4px ${alpha(liveIndicatorColor, 0.22)}, 0 0 16px ${alpha(liveIndicatorColor, 0.62)}`,
              }}
            />
            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{
                  color: '#ccf5ff',
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  lineHeight: 1.05,
                }}
              >
                {repositoryLabel}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: alpha('#a7d9ef', 0.9), letterSpacing: '0.04em', lineHeight: 1.05 }}
              >
                Mission HUD · {modeLabel} · {atmosphereLabel}
              </Typography>
            </Stack>
            <Chip
              size="small"
              label={`FILES ${filesCount}`}
              sx={{ height: 22, color: '#dbf6ff', borderColor: alpha('#8ce7ff', 0.54) }}
              variant="outlined"
            />
            <Chip
              size="small"
              label={`COMMITS ${commitsCount}`}
              sx={{ height: 22, color: '#dbf6ff', borderColor: alpha('#8ce7ff', 0.54) }}
              variant="outlined"
            />
            <Chip
              size="small"
              label={`BRANCHES ${branchCount}`}
              sx={{ height: 22, color: '#dbf6ff', borderColor: alpha('#8ce7ff', 0.54) }}
              variant="outlined"
            />
            <Chip
              size="small"
              label={`${runtimeBadge} · FPS ${Math.max(0, Math.round(fpsValue))}`}
              sx={{ height: 22, color: '#def8ff', borderColor: alpha('#6de8ff', 0.62) }}
              variant="outlined"
            />
            <Chip
              size="small"
              label={`Coverage ${signalCoverage}% · DPR ${scenePerformance.adaptiveDpr.toFixed(2)} · Load ${Math.round(scenePerformance.adaptiveLoadScale * 100)}%`}
              sx={{
                height: 22,
                color: '#e7fbff',
                borderColor: alpha(sceneAccent, 0.62),
                backgroundColor: alpha(sceneAccent, 0.14),
              }}
              variant="outlined"
            />
          </Stack>
        </Paper>
      )}

      {hasSceneData && isBusy && centerOverlayReady && (
        <Box
          sx={{
            position: 'absolute',
            left: { xs: 8, md: 16 },
            bottom: { xs: 8, md: centerBusyBottom },
            zIndex: 12,
            display: { xs: 'none', md: 'block' },
            width: { xs: 'calc(100% - 16px)', md: 316 },
          }}
        >
          <ProgressBar
            progress={progress}
            title="Live Update"
            subtitle="Refreshing city deltas"
            message={message || 'Updating city...'}
            compact
          />
        </Box>
      )}

      {hasSceneData && showFps && !isVeryShortViewport && centerOverlayReady && (
        <Paper
          elevation={2}
          sx={{
            position: 'absolute',
            left: { xs: 8, md: 16 },
            bottom: { xs: 50, md: centerFpsBottom },
            px: 1.5,
            py: 0.8,
            zIndex: 12,
            display: { xs: 'none', md: 'block' },
            pointerEvents: 'none',
            ...panelSurfaceSx,
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: '#b7e8ff', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            FPS // {Math.max(0, Math.round(fpsValue))}
          </Typography>
        </Paper>
      )}

      {showFileInfo && selectedFile && rightAwarePlacementReady && (
        <FileInfoCard
          file={selectedFile}
          riskProfile={selectedRiskProfile}
          desktopTop={panelTopOffset}
          desktopRight={fileCardDesktopRight}
          mobileTop={panelTopOffset}
          mobileBottomInset={overlayBottomInset + 8}
          onClose={onCloseFileCard}
        />
      )}

      {showInsightPanel && insights && leftBottomReady && (
        <InsightPanel
          insights={insights}
          analysis={filteredData?.analysis ?? null}
          topOffset={panelTopOffset}
          desktopBottomOffset={leftBottomReserveFinal}
          compact={panelCompact}
        />
      )}

      {shouldRenderBranchPanel && filteredData && rightBottomReady && (
        <BranchTreePanel
          branches={(filteredData.branches ?? []).slice(0, 24)}
          selectedBranch={branchFilter}
          branchOnlyMode={branchOnlyMode}
          topOffset={branchTopOffset}
          desktopMaxHeight={showNarratorPanel ? '30vh' : '56vh'}
          desktopBottomOffset={rightBottomReserveFinal}
          compact={panelCompact}
          onWidthChange={handleBranchWidthChange}
          onSelectBranch={onSelectBranch}
          onToggleBranchOnly={onToggleBranchOnly}
        />
      )}

      {hasSceneData &&
        filteredData &&
        showMinimap &&
        !showFileInfo &&
        rightAwarePlacementReady && (
        <Minimap
          files={filteredData.files}
          selectedPath={selectedPath}
          hoveredPath={hoveredPath}
          compact={panelCompact}
          rightOffset={minimapRightOffset}
          onHeightChange={handleMinimapHeightChange}
          onSelect={onSelectPath}
        />
      )}

      {hasSceneData && tourMode === 'walk' && centerOverlayReady && (
        <Paper
          elevation={2}
          sx={{
            position: 'absolute',
            left: { xs: 8, md: 16 },
            bottom: { xs: 92, md: centerWalkBottom },
            px: 1.5,
            py: 0.8,
            zIndex: 12,
            display: { xs: 'none', md: 'block' },
            maxWidth: { md: 'min(640px, calc(100% - 32px))' },
            ...panelSurfaceSx,
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: '#b9e9ff', letterSpacing: '0.04em' }}
          >
            {isShortViewport
              ? 'Walk: click lock · WASD move · Shift sprint · E enter · Q/Esc exit'
              : 'Walk mode: click to lock mouse, `W/A/S/D` move, `Shift` sprint, `E` enter, `Q/Esc` exit'}
            {walkBuildingPath ? ` · inside ${walkBuildingPath}` : ''}
          </Typography>
        </Paper>
      )}

      {hasSceneData && tourMode === 'coaster' && centerOverlayReady && (
        <Paper
          elevation={2}
          sx={{
            position: 'absolute',
            left: { xs: 8, md: 16 },
            right: { xs: 8, md: 'auto' },
            bottom: { xs: 74, md: centerWalkBottom },
            px: 1.4,
            py: 1,
            zIndex: 12,
            display: 'block',
            width: { xs: 'calc(100% - 16px)', md: 'min(640px, calc(100% - 32px))' },
            maxWidth: { md: 'min(640px, calc(100% - 32px))' },
            boxSizing: 'border-box',
            ...panelSurfaceSx,
          }}
        >
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box
              sx={{
                width: 58,
                height: 58,
                borderRadius: '50%',
                background: `conic-gradient(#6de6ff ${coasterGaugeFill}, rgba(109,230,255,0.14) ${coasterGaugeFill})`,
                p: '3px',
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background:
                    'radial-gradient(circle at 40% 30%, rgba(8,26,46,0.95), rgba(3,14,27,0.96))',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ lineHeight: 1, color: '#dbf6ff', fontWeight: 700 }}
                >
                  {coasterSpeedKmh}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ lineHeight: 1, color: '#7ab2c8', fontSize: '0.58rem' }}
                >
                  km/h
                </Typography>
              </Box>
            </Box>

            <Stack spacing={0.45} sx={{ minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{ color: '#b9e9ff', letterSpacing: '0.045em', lineHeight: 1.1 }}
              >
                Train mode: first-person ride · drag to look around · `C` center view · `W/S` boost-brake · `R` restart · `1/2/3` profile
              </Typography>
              <Stack direction="row" spacing={0.65} useFlexGap flexWrap="wrap">
                <Button
                  size="small"
                  variant={coasterThrottle > 0.25 ? 'contained' : 'outlined'}
                  color={coasterThrottle > 0.25 ? 'info' : 'primary'}
                  onPointerDown={handleCoasterBoostPress}
                  onPointerUp={handleCoasterThrottleRelease}
                  onPointerLeave={handleCoasterThrottleRelease}
                  onPointerCancel={handleCoasterThrottleRelease}
                  sx={{ minHeight: 24, px: 1.2, py: 0, fontSize: '0.66rem', touchAction: 'none' }}
                >
                  Boost
                </Button>
                <Button
                  size="small"
                  variant={coasterThrottle < -0.25 ? 'contained' : 'outlined'}
                  color={coasterThrottle < -0.25 ? 'warning' : 'primary'}
                  onPointerDown={handleCoasterBrakePress}
                  onPointerUp={handleCoasterThrottleRelease}
                  onPointerLeave={handleCoasterThrottleRelease}
                  onPointerCancel={handleCoasterThrottleRelease}
                  sx={{ minHeight: 24, px: 1.2, py: 0, fontSize: '0.66rem', touchAction: 'none' }}
                >
                  Brake
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onCoasterCameraToggle}
                  sx={{ minHeight: 24, px: 1.1, py: 0, fontSize: '0.66rem' }}
                >
                  Center
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onCoasterReset}
                  sx={{ minHeight: 24, px: 1.1, py: 0, fontSize: '0.66rem' }}
                >
                  Reset
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  onClick={onCoasterRegenerate}
                  sx={{ minHeight: 24, px: 1.1, py: 0, fontSize: '0.66rem' }}
                >
                  Rebuild
                </Button>
              </Stack>
              <Stack direction="row" spacing={0.65} useFlexGap flexWrap="wrap">
                <Button
                  size="small"
                  variant={coasterProfile === 'comfort' ? 'contained' : 'outlined'}
                  color={coasterProfile === 'comfort' ? 'success' : 'primary'}
                  onClick={() => onCoasterProfileChange?.('comfort')}
                  sx={{ minHeight: 22, px: 1.1, py: 0, fontSize: '0.64rem' }}
                >
                  Comfort
                </Button>
                <Button
                  size="small"
                  variant={coasterProfile === 'sport' ? 'contained' : 'outlined'}
                  color={coasterProfile === 'sport' ? 'info' : 'primary'}
                  onClick={() => onCoasterProfileChange?.('sport')}
                  sx={{ minHeight: 22, px: 1.1, py: 0, fontSize: '0.64rem' }}
                >
                  Sport
                </Button>
                <Button
                  size="small"
                  variant={coasterProfile === 'extreme' ? 'contained' : 'outlined'}
                  color={coasterProfile === 'extreme' ? 'warning' : 'primary'}
                  onClick={() => onCoasterProfileChange?.('extreme')}
                  sx={{ minHeight: 22, px: 1.1, py: 0, fontSize: '0.64rem' }}
                >
                  Extreme
                </Button>
              </Stack>
              <Stack direction="row" spacing={0.65} useFlexGap flexWrap="wrap">
                <Chip
                  size="small"
                  label={coasterProfileLabel}
                  color={
                    coasterProfile === 'extreme'
                      ? 'warning'
                      : coasterProfile === 'comfort'
                        ? 'success'
                        : 'info'
                  }
                  sx={{ height: 20, fontSize: '0.68rem' }}
                />
                <Chip
                  size="small"
                  label={`G ${coasterGForce.toFixed(2)}`}
                  sx={{ height: 20, fontSize: '0.68rem' }}
                />
                <Chip
                  size="small"
                  label={`a ${coasterAcceleration >= 0 ? '+' : ''}${coasterAcceleration.toFixed(1)} m/s²`}
                  sx={{ height: 20, fontSize: '0.68rem' }}
                />
                <Chip
                  size="small"
                  label={`Slope ${coasterSlopeLabel}`}
                  sx={{ height: 20, fontSize: '0.68rem' }}
                />
                <Chip
                  size="small"
                  label={`Lap ${coasterLap + 1} · ${coasterLapTime}`}
                  sx={{ height: 20, fontSize: '0.68rem' }}
                />
                <Chip
                  size="small"
                  label={`Best ${coasterBestLap}`}
                  sx={{ height: 20, fontSize: '0.68rem' }}
                />
                <Chip
                  size="small"
                  label={`Top ${coasterTopSpeedKmh} km/h`}
                  sx={{ height: 20, fontSize: '0.68rem' }}
                />
                <Chip
                  size="small"
                  label={`${coasterThrottleState} ${Math.round(Math.abs(coasterThrottle) * 100)}%`}
                  sx={{ height: 20, fontSize: '0.68rem' }}
                />
                <Chip
                  size="small"
                  label={`${coasterCameraMode} · clearance ${
                    Number.isFinite(coasterClearance) ? `${coasterClearance.toFixed(1)}m` : '∞'
                  }`}
                  sx={{ height: 20, fontSize: '0.68rem' }}
                />
                <Chip
                  size="small"
                  label={coasterRideState}
                  color={coasterTelemetry?.emergencyBrake ? 'warning' : 'default'}
                  sx={{ height: 20, fontSize: '0.68rem' }}
                />
              </Stack>
            </Stack>
          </Stack>
        </Paper>
      )}

      {showChatLayer && (
        <ChatDock
          roomId={roomId}
          nickname={nickname}
          roomAccessKey={roomAccessKey}
          activeRoomId={activeRoomId}
          participants={roomParticipants}
          messages={roomMessages}
          roomError={roomError}
          queuedMessagesCount={queuedMessagesCount}
          selfSocketId={selfSocketId}
          connected={isSocketConnected}
          compact={panelCompact}
          topOffset={panelTopOffset}
          onHeightChange={handleChatHeightChange}
          onRoomIdChange={onRoomIdChange}
          onNicknameChange={onNicknameChange}
          onRoomAccessKeyChange={onRoomAccessKeyChange}
          onJoin={onJoinRoom}
          onLeave={onLeaveRoom}
          onSendMessage={onSendMessage}
          onClearError={onClearRoomError}
        />
      )}

      {showMusicLayer && (
        <MusicPlayerDock
          compact={panelCompact || showChatLayer}
          topOffset={panelTopOffset}
          bottomOffset={musicDockBottomOffset}
          onHeightChange={handleMusicHeightChange}
          onSpectrumChange={onMusicSpectrumChange}
        />
      )}

      {showNarratorPanel && (
        <NarratorPanel
          stories={narratorStories}
          status={narratorStatus}
          error={narratorError}
          topOffset={narratorTopOffset}
          compact={panelCompact}
          onHeightChange={handleNarratorHeightChange}
          onWidthChange={handleNarratorWidthChange}
          onManualCue={onNarratorManualCue}
        />
      )}

      {showStatusLayer && (
        <ProductStatusDock
          parseStatus={parseStatus}
          progress={progress}
          message={message}
          stage={stage}
          roomConnected={isSocketConnected}
          activeRoomId={activeRoomId}
          narratorStatus={narratorStatus}
          liveWatch={liveWatch}
          runtimeProfile={scenePerformance.runtimeProfile}
          postFxQuality={scenePerformance.postFxQuality}
          adaptiveDpr={scenePerformance.adaptiveDpr}
          adaptiveLoadScale={scenePerformance.adaptiveLoadScale}
          fovBuildingCoverage={scenePerformance.fovBuildingCoverage}
          fovRoadCoverage={scenePerformance.fovRoadCoverage}
          fovDistrictCoverage={scenePerformance.fovDistrictCoverage}
          sceneFps={scenePerformance.fps}
          effectiveTimeOfDay={effectiveTimeOfDay}
          effectiveWeatherMode={effectiveWeatherMode}
          dynamicAtmosphere={dynamicAtmosphere}
          compact={panelCompact}
          onHeightChange={handleStatusHeightChange}
        />
      )}
    </>
  );
}
