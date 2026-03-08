import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Box, Paper, Typography, useMediaQuery, useTheme } from '@mui/material';
import { BranchTreePanel } from './BranchTreePanel';
import { ChatDock } from './ChatDock';
import { CyberpunkCanvasOverlay } from './CyberpunkCanvasOverlay';
import { FileInfoCard } from './FileInfoCard';
import { InsightPanel } from './InsightPanel';
import { Minimap } from './Minimap';
import { NarratorPanel } from './NarratorPanel';
import { ProgressBar } from './ProgressBar';
import { ProductStatusDock } from './ProductStatusDock';
import { FileRiskProfile } from '../utils/risk';
import { RepositoryInsights } from '../utils/insights';
import { RepositoryResult, PositionedFileHistory } from '../types/repository';
import { ParseStatus } from '../types/repository';
import { CityDNA } from '../utils/city-dna';
import { ScenePerformanceTelemetry } from './scene/types';
import {
  ChatAttachmentDraft,
  RoomMessage,
  RoomParticipant,
} from '../types/collaboration';
import { NarratorManualCue, NarratorStory } from '../types/narrator';
import { panelSurfaceSx } from './panelStyles';

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
  tourMode: 'orbit' | 'drone' | 'walk';
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
  const [minimapMeasuredHeight, setMinimapMeasuredHeight] = useState(0);
  const compactUi = uiMode === 'balanced';
  const panelCompact = compactUi || isShortViewport;
  const showFileInfo = Boolean(selectedFile && showFileCard);
  const showChatDock = showChat;
  const suppressLeftBottomPanelsForFileCardMobile = isMobile && showFileInfo;
  const suppressNarratorForFileCardMobile = isMobile && showFileInfo;
  const showChatLayer = showChatDock && !suppressLeftBottomPanelsForFileCardMobile;
  const showStatusLayer = !showChatLayer && showStatusDock && !suppressLeftBottomPanelsForFileCardMobile;
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
  const activeMinimapHeight =
    showMinimap && !showFileInfo ? minimapMeasuredHeight : 0;
  const leftBottomReady =
    (!showChatLayer || chatMeasuredHeight > 0) &&
    (showChatLayer || !showStatusLayer || statusMeasuredHeight > 0);
  const rightBottomReady = !showMinimap || showFileInfo || minimapMeasuredHeight > 0;
  const rightAwarePlacementReady =
    (!showNarratorPanel && !shouldRenderBranchPanel) || rightDockWidthReady;
  const centerOverlayReady = leftBottomReady && rightBottomReady;
  const neutralBottomReserve = overlayBottomInset + overlayGap;
  const leftBottomReserve = showChatLayer
    ? activeChatDockHeight + overlayBottomInset + overlayGap
    : showStatusLayer
      ? activeStatusDockHeight + overlayBottomInset + overlayGap
      : neutralBottomReserve;
  const leftBottomReserveFinal = leftBottomReserve;
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
    if (!showMinimap || showFileInfo) {
      setMinimapMeasuredHeight(0);
    }
  }, [showFileInfo, showMinimap]);

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

      {hasSceneData && isBusy && centerOverlayReady && (
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: { xs: 8, md: centerBusyBottom },
            zIndex: 12,
            display: { xs: 'none', md: 'block' },
            width: 316,
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
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: { xs: 50, md: centerFpsBottom },
            px: 1.5,
            py: 0.8,
            zIndex: 12,
            display: { xs: 'none', md: 'block' },
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
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: { xs: 92, md: centerWalkBottom },
            px: 1.5,
            py: 0.8,
            zIndex: 12,
            display: { xs: 'none', md: 'block' },
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
