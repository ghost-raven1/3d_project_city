import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import SummarizeRoundedIcon from '@mui/icons-material/SummarizeRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Chip,
  Container,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { RepositoryResult } from '../types/repository';
import { TimelineBounds } from '../utils/city';
import { CityDNA } from '../utils/city-dna';
import {
  CoasterDriveProfile,
  ScenePerformanceTelemetry,
  TourMode,
} from './scene/types';
import {
  panelActionButtonSx,
  panelChipSx,
  panelScrollSx,
  panelSectionSx,
  panelSurfaceSx,
  panelTitleSx,
} from './panelStyles';
import { ProgressBar } from './ProgressBar';
import { ShareButton } from './ShareButton';

interface TopControlPanelProps {
  repoUrl: string;
  isBusy: boolean;
  progress: number;
  message: string;
  error: string | null;
  data: RepositoryResult | null;
  timelineBounds: TimelineBounds | null;
  timelineTs: number | null;
  timelineLabel: string;
  cityDna: CityDNA | null;
  scenePerformance: ScenePerformanceTelemetry;
  githubToken: string;
  languageFilter: string;
  authorFilter: string;
  districtFilter: string;
  branchFilter: string;
  riskFilter: 'all' | 'low' | 'medium' | 'high';
  pathFilter: string;
  viewMode: 'overview' | 'architecture' | 'risk' | 'stack';
  compareEnabled: boolean;
  compareMode: 'ghost' | 'split';
  compareTs: number | null;
  compareLabel: string;
  compareSummary: {
    filesDelta: number;
    roadsDelta: number;
    riskDelta: number;
    hubsDelta: number;
  } | null;
  languageOptions: string[];
  authorOptions: string[];
  districtOptions: string[];
  branchOptions: string[];
  jumpOptions: string[];
  autoTour: boolean;
  tourMode: TourMode;
  followDroneIndex: number;
  liveWatch: boolean;
  showAtmosphere: boolean;
  showWeather: boolean;
  showBuilders: boolean;
  showMinimap: boolean;
  showInsights: boolean;
  showBranchMap: boolean;
  showFileCard: boolean;
  showChat: boolean;
  showNarrator: boolean;
  showPostProcessing: boolean;
  adaptivePostFx: boolean;
  modePresetIntensity: number;
  coasterIntensity: number;
  coasterProfile: CoasterDriveProfile;
  visualPreset: 'immersive' | 'balanced' | 'performance';
  targetFps: 30 | 45 | 60;
  renderProfileLock: 'auto' | 'cinematic' | 'balanced' | 'performance';
  showFps: boolean;
  showCyberpunkOverlay: boolean;
  timeOfDay: 'auto' | 'dawn' | 'day' | 'sunset' | 'night';
  weatherMode: 'auto' | 'clear' | 'mist' | 'rain' | 'storm';
  dynamicAtmosphere: boolean;
  constructionMode: boolean;
  constructionSpeed: number;
  constructionProgress: number;
  uiMode: 'full' | 'balanced' | 'focus';
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRepoUrlChange: (value: string) => void;
  onGithubTokenChange: (value: string) => void;
  onStartParsing: () => void;
  onTimelineChange: (value: number) => void;
  onAutoTourChange: (value: boolean) => void;
  onTourModeChange: (value: TourMode) => void;
  onFollowDroneIndexChange: (value: number) => void;
  onLiveWatchChange: (value: boolean) => void;
  onShowAtmosphereChange: (value: boolean) => void;
  onShowWeatherChange: (value: boolean) => void;
  onShowBuildersChange: (value: boolean) => void;
  onShowMinimapChange: (value: boolean) => void;
  onShowInsightsChange: (value: boolean) => void;
  onShowBranchMapChange: (value: boolean) => void;
  onShowFileCardChange: (value: boolean) => void;
  onShowChatChange: (value: boolean) => void;
  onShowNarratorChange: (value: boolean) => void;
  onShowPostProcessingChange: (value: boolean) => void;
  onAdaptivePostFxChange: (value: boolean) => void;
  onModePresetIntensityChange: (value: number) => void;
  onCoasterIntensityChange: (value: number) => void;
  onCoasterProfileChange: (value: CoasterDriveProfile) => void;
  onVisualPresetChange: (value: 'immersive' | 'balanced' | 'performance') => void;
  onTargetFpsChange: (value: 30 | 45 | 60) => void;
  onRenderProfileLockChange: (
    value: 'auto' | 'cinematic' | 'balanced' | 'performance',
  ) => void;
  onShowFpsChange: (value: boolean) => void;
  onShowCyberpunkOverlayChange: (value: boolean) => void;
  onTimeOfDayChange: (value: 'auto' | 'dawn' | 'day' | 'sunset' | 'night') => void;
  onWeatherModeChange: (value: 'auto' | 'clear' | 'mist' | 'rain' | 'storm') => void;
  onDynamicAtmosphereChange: (value: boolean) => void;
  onConstructionModeChange: (value: boolean) => void;
  onConstructionSpeedChange: (value: number) => void;
  onUiModeChange: (value: 'full' | 'balanced' | 'focus') => void;
  onLanguageFilterChange: (value: string) => void;
  onAuthorFilterChange: (value: string) => void;
  onDistrictFilterChange: (value: string) => void;
  onBranchFilterChange: (value: string) => void;
  onRiskFilterChange: (value: 'all' | 'low' | 'medium' | 'high') => void;
  onPathFilterChange: (value: string) => void;
  onViewModeChange: (value: 'overview' | 'architecture' | 'risk' | 'stack') => void;
  onCompareEnabledChange: (value: boolean) => void;
  onCompareModeChange: (value: 'ghost' | 'split') => void;
  onCompareTsChange: (value: number) => void;
  onExportSummary: () => void;
  onExportPng: () => void;
  onExportJson: () => void;
  onExportHotspots: () => void;
  onJumpToFile: (path: string) => void;
  onHeaderHeightChange?: (height: number) => void;
}

export function TopControlPanel({
  repoUrl,
  isBusy,
  progress,
  message,
  error,
  data,
  timelineBounds,
  timelineTs,
  timelineLabel,
  cityDna,
  scenePerformance,
  githubToken,
  languageFilter,
  authorFilter,
  districtFilter,
  branchFilter,
  riskFilter,
  pathFilter,
  viewMode,
  compareEnabled,
  compareMode,
  compareTs,
  compareLabel,
  compareSummary,
  languageOptions,
  authorOptions,
  districtOptions,
  branchOptions,
  jumpOptions,
  autoTour,
  tourMode,
  followDroneIndex,
  liveWatch,
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
  coasterIntensity,
  coasterProfile,
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
  constructionProgress,
  uiMode,
  collapsed,
  onToggleCollapsed,
  onRepoUrlChange,
  onGithubTokenChange,
  onStartParsing,
  onTimelineChange,
  onAutoTourChange,
  onTourModeChange,
  onFollowDroneIndexChange,
  onLiveWatchChange,
  onShowAtmosphereChange,
  onShowWeatherChange,
  onShowBuildersChange,
  onShowMinimapChange,
  onShowInsightsChange,
  onShowBranchMapChange,
  onShowFileCardChange,
  onShowChatChange,
  onShowNarratorChange,
  onShowPostProcessingChange,
  onAdaptivePostFxChange,
  onModePresetIntensityChange,
  onCoasterIntensityChange,
  onCoasterProfileChange,
  onVisualPresetChange,
  onTargetFpsChange,
  onRenderProfileLockChange,
  onShowFpsChange,
  onShowCyberpunkOverlayChange,
  onTimeOfDayChange,
  onWeatherModeChange,
  onDynamicAtmosphereChange,
  onConstructionModeChange,
  onConstructionSpeedChange,
  onUiModeChange,
  onLanguageFilterChange,
  onAuthorFilterChange,
  onDistrictFilterChange,
  onBranchFilterChange,
  onRiskFilterChange,
  onPathFilterChange,
  onViewModeChange,
  onCompareEnabledChange,
  onCompareModeChange,
  onCompareTsChange,
  onExportSummary,
  onExportPng,
  onExportJson,
  onExportHotspots,
  onJumpToFile,
  onHeaderHeightChange,
}: TopControlPanelProps) {
  const denseHeader = useMediaQuery('(max-width: 1580px)');
  const veryDenseHeader = useMediaQuery('(max-width: 1360px)');
  const ultraDenseHeader = useMediaQuery('(max-width: 1240px)');
  const [tokenVisible, setTokenVisible] = useState(false);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const lastHeaderHeightRef = useRef(0);
  const stackChips = data?.stack
    ? [
        ...data.stack.runtimes.slice(0, 2),
        ...data.stack.frameworks.slice(0, 3),
        ...data.stack.infrastructure.slice(0, 2),
      ]
    : [];

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (languageFilter !== 'all') {
      count += 1;
    }
    if (authorFilter !== 'all') {
      count += 1;
    }
    if (districtFilter !== 'all') {
      count += 1;
    }
    if (branchFilter !== 'all') {
      count += 1;
    }
    if (riskFilter !== 'all') {
      count += 1;
    }
    if (pathFilter.trim().length > 0) {
      count += 1;
    }

    return count;
  }, [authorFilter, branchFilter, districtFilter, languageFilter, pathFilter, riskFilter]);

  const hasTimeline = Boolean(data && timelineBounds && timelineTs !== null);
  const drawerOpen = !collapsed;
  const maxDroneIndex = 9;
  const safeFollowDroneIndex = Math.max(0, Math.min(maxDroneIndex, followDroneIndex));
  const sectionPaperSx = { p: 1.2, ...panelSectionSx };
  const toggleGroupSx = {
    width: '100%',
    flexWrap: 'wrap',
    '& .MuiToggleButtonGroup-grouped': {
      flex: '1 1 118px',
      minWidth: 0,
      whiteSpace: 'nowrap',
    },
  } as const;
  const iconActionSx = {
    ...panelActionButtonSx,
    border: '1px solid rgba(126,224,255,0.22)',
  };
  const runtimeChipColor =
    scenePerformance.runtimeProfile === 'performance'
      ? 'warning'
      : scenePerformance.runtimeProfile === 'balanced'
        ? 'info'
        : 'success';
  const fxChipColor =
    scenePerformance.postFxQuality === 'low'
      ? 'warning'
      : scenePerformance.postFxQuality === 'medium'
        ? 'info'
        : 'success';
  const timelineLabelCompact = timelineLabel.length > 22
    ? `${timelineLabel.slice(0, 21)}…`
    : timelineLabel;
  const fxLabel = veryDenseHeader
    ? `FX ${scenePerformance.postFxQuality.toUpperCase()} · ${Math.round(scenePerformance.adaptiveLoadScale * 100)}%`
    : `FX ${scenePerformance.postFxQuality.toUpperCase()} · DPR ${scenePerformance.adaptiveDpr.toFixed(2)} · Load ${Math.round(scenePerformance.adaptiveLoadScale * 100)}%`;
  const coasterProfileHint =
    coasterProfile === 'comfort'
      ? 'Comfort: softer slope response, lower peak speed, gentler turns.'
      : coasterProfile === 'extreme'
        ? 'Extreme: stronger slope acceleration, higher peak speed, sharper dynamics.'
        : 'Sport: balanced dynamics with clear slope feel and moderate safety margins.';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStartParsing();
  };

  useEffect(() => {
    if (!onHeaderHeightChange) {
      return;
    }

    const node = headerRef.current;
    if (!node) {
      return;
    }

    const emitHeight = () => {
      const next = Math.max(0, Math.ceil(node.getBoundingClientRect().height));
      if (Math.abs(next - lastHeaderHeightRef.current) < 1) {
        return;
      }
      lastHeaderHeightRef.current = next;
      onHeaderHeightChange(next);
    };

    emitHeight();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => emitHeight());
    observer?.observe(node);
    window.addEventListener('resize', emitHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', emitHeight);
    };
  }, [onHeaderHeightChange]);

  return (
    <>
      <Box
        ref={headerRef}
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <Container maxWidth="xl" sx={{ pt: { xs: 0.8, md: 1.1 }, pb: 0 }}>
          <Paper
            elevation={6}
            sx={{
              p: 1,
              pointerEvents: 'auto',
              ...panelSurfaceSx,
            }}
          >
            <Stack spacing={0.9}>
              <Stack
                direction={{ xs: 'column', lg: 'row' }}
                spacing={0.9}
                alignItems={{ xs: 'stretch', lg: 'center' }}
                sx={{
                  flexWrap: { lg: 'wrap', xl: 'nowrap' },
                }}
              >
                <Stack
                  direction="row"
                  spacing={0.7}
                  alignItems="center"
                  flexWrap="wrap"
                  sx={{
                    minWidth: 0,
                    maxWidth: '100%',
                    flex: { xs: '1 1 auto', lg: '1 1 340px', xl: '0 1 auto' },
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 900,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#aef3ff',
                      fontSize: { xs: '0.9rem', sm: '0.96rem' },
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Repo City // Neural Ops
                  </Typography>
                  {hasTimeline && (
                    <Chip
                      size="small"
                      label={denseHeader ? timelineLabelCompact : timelineLabel}
                      color="primary"
                      variant="outlined"
                      sx={{
                        ...panelChipSx,
                        maxWidth: denseHeader ? 178 : 228,
                      }}
                    />
                  )}
                  {data && (
                    <Chip
                      size="small"
                      label={`${data.files.length} files · ${data.imports.length} roads`}
                      variant="outlined"
                      sx={{
                        ...panelChipSx,
                        display: {
                          xs: 'none',
                          lg: veryDenseHeader ? 'none' : 'inline-flex',
                        },
                      }}
                    />
                  )}
                  <Chip
                    size="small"
                    color={uiMode === 'focus' ? 'warning' : uiMode === 'balanced' ? 'info' : 'default'}
                    label={
                      uiMode === 'focus'
                        ? 'UI // Focus'
                        : uiMode === 'balanced'
                          ? 'UI // Balanced'
                          : 'UI // Full'
                    }
                    variant="outlined"
                    sx={panelChipSx}
                  />
                  <Chip
                    size="small"
                    color={liveWatch ? 'success' : 'default'}
                    label={liveWatch ? 'Sync // Live' : 'Sync // Snapshot'}
                    variant="outlined"
                    sx={{
                      ...panelChipSx,
                      display: { xs: 'none', lg: 'inline-flex' },
                    }}
                  />
                  <Chip
                    size="small"
                    color={autoTour ? 'info' : 'default'}
                    label={autoTour ? 'Tour // Auto' : 'Tour // Manual'}
                    variant="outlined"
                    sx={{
                      ...panelChipSx,
                      display: { xs: 'none', xl: 'inline-flex' },
                    }}
                  />
                  <Chip
                    size="small"
                    color={runtimeChipColor}
                    label={denseHeader ? `Render ${scenePerformance.runtimeProfile}` : `Render // ${scenePerformance.runtimeProfile}`}
                    variant="outlined"
                    sx={panelChipSx}
                  />
                  <Chip
                    size="small"
                    color={visualPreset === 'performance' ? 'warning' : visualPreset === 'immersive' ? 'success' : 'info'}
                    label={`Preset // ${visualPreset}`}
                    variant="outlined"
                    sx={{ ...panelChipSx, display: { xs: 'none', xl: 'inline-flex' } }}
                  />
                  <Chip
                    size="small"
                    label={`Target // ${targetFps}fps`}
                    variant="outlined"
                    sx={{ ...panelChipSx, display: { xs: 'none', xl: 'inline-flex' } }}
                  />
                  <Chip
                    size="small"
                    color={renderProfileLock === 'auto' ? 'default' : 'secondary'}
                    label={
                      renderProfileLock === 'auto'
                        ? 'Lock // auto'
                        : `Lock // ${renderProfileLock}`
                    }
                    variant="outlined"
                    sx={{
                      ...panelChipSx,
                      display: { xs: 'none', xl: ultraDenseHeader ? 'none' : 'inline-flex' },
                    }}
                  />
                  <Chip
                    size="small"
                    color={fxChipColor}
                    label={fxLabel}
                    variant="outlined"
                    sx={{
                      ...panelChipSx,
                      display: { xs: 'none', xl: ultraDenseHeader ? 'none' : 'inline-flex' },
                      maxWidth: veryDenseHeader ? 196 : 286,
                    }}
                  />
                  {scenePerformance.fps > 0 && (
                    <Chip
                      size="small"
                      color={scenePerformance.fps < 30 ? 'error' : 'success'}
                      label={`FPS ${Math.round(scenePerformance.fps)}`}
                      variant="outlined"
                      sx={{
                        ...panelChipSx,
                        display: { xs: 'inline-flex', lg: denseHeader ? 'none' : 'inline-flex' },
                      }}
                    />
                  )}
                </Stack>

                <Box
                  component="form"
                  onSubmit={handleSubmit}
                  sx={{
                    display: 'flex',
                    gap: 0.8,
                    flex: { xs: '1 1 auto', lg: '1 1 380px' },
                    minWidth: 0,
                    alignItems: 'center',
                    width: '100%',
                  }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="https://github.com/facebook/react"
                    value={repoUrl}
                    onChange={(event) => onRepoUrlChange(event.target.value)}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={isBusy || !repoUrl.trim()}
                    sx={{ ...panelActionButtonSx, whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    Построить
                  </Button>
                </Box>

                <Stack
                  direction="row"
                  spacing={0.4}
                  alignItems="center"
                  flexWrap="wrap"
                  sx={{
                    minWidth: 0,
                    flexShrink: 0,
                    rowGap: 0.35,
                    justifyContent: { xs: 'flex-start', lg: 'flex-end' },
                  }}
                >
                  {isBusy && (
                    <Chip
                      size="small"
                      color="warning"
                      label={`${Math.round(progress)}%`}
                      sx={{
                        ...panelChipSx,
                        '& .MuiChip-label': {
                          fontWeight: 700,
                        },
                      }}
                    />
                  )}

                  <Tooltip title="Controls, timeline and filters">
                    <IconButton
                      size="small"
                      onClick={onToggleCollapsed}
                      sx={iconActionSx}
                    >
                      <Badge
                        color="secondary"
                        badgeContent={activeFilterCount > 0 ? activeFilterCount : 0}
                        overlap="circular"
                      >
                        <TuneRoundedIcon fontSize="small" />
                      </Badge>
                    </IconButton>
                  </Tooltip>

                  <ShareButton repoUrl={repoUrl} compact />

                  <Tooltip title="Copy executive summary">
                    <IconButton
                      size="small"
                      onClick={onExportSummary}
                      sx={{ ...iconActionSx, display: { xs: 'none', sm: 'inline-flex' } }}
                    >
                      <SummarizeRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export scene PNG">
                    <IconButton
                      size="small"
                      onClick={onExportPng}
                      sx={{ ...iconActionSx, display: { xs: 'none', sm: 'inline-flex' } }}
                    >
                      <ImageRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export JSON report">
                    <IconButton
                      size="small"
                      onClick={onExportJson}
                      sx={{ ...iconActionSx, display: { xs: 'none', sm: 'inline-flex' } }}
                    >
                      <DataObjectRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export risk hotspots">
                    <IconButton
                      size="small"
                      onClick={onExportHotspots}
                      sx={{ ...iconActionSx, display: { xs: 'none', sm: 'inline-flex' } }}
                    >
                      <WarningAmberRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>

              {isBusy && (
                <ProgressBar
                  progress={progress}
                  title="Repository Parsing"
                  subtitle="Commit graph to city topology"
                  message={message || 'Parsing repository...'}
                  sx={{ mt: 0.3 }}
                />
              )}

              {collapsed && error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </Paper>
        </Container>
      </Box>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={onToggleCollapsed}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 420, md: 470 },
            p: 1.5,
            ...panelSurfaceSx,
          },
        }}
      >
        <Stack spacing={1.2} sx={{ height: '100%', overflowY: 'auto', ...panelScrollSx }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={900}>
              Command Deck
            </Typography>
            <IconButton size="small" sx={iconActionSx} onClick={onToggleCollapsed}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          <Paper variant="outlined" sx={sectionPaperSx}>
            <Stack spacing={0.8}>
              <Typography variant="subtitle2" fontWeight={800} sx={panelTitleSx}>
                Interface mode
              </Typography>
              <ToggleButtonGroup
                size="small"
                value={uiMode}
                exclusive
                sx={toggleGroupSx}
                onChange={(_, value) => {
                  if (value) {
                    onUiModeChange(value as 'full' | 'balanced' | 'focus');
                  }
                }}
              >
                <ToggleButton value="full">Full</ToggleButton>
                <ToggleButton value="balanced">Balanced</ToggleButton>
                <ToggleButton value="focus">Focus</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary">
                `H` toggles Focus/Full. `Shift + H` cycles all modes.
              </Typography>
              <ToggleButtonGroup
                size="small"
                value={visualPreset}
                exclusive
                sx={toggleGroupSx}
                onChange={(_, value) => {
                  if (value) {
                    onVisualPresetChange(
                      value as 'immersive' | 'balanced' | 'performance',
                    );
                  }
                }}
              >
                <ToggleButton value="immersive">Immersive</ToggleButton>
                <ToggleButton value="balanced">Balanced</ToggleButton>
                <ToggleButton value="performance">Performance</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary">
                Render preset: cinematic density/FX profile cap for quick tuning.
              </Typography>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={sectionPaperSx}>
            <Stack spacing={0.8}>
              <Typography variant="subtitle2" fontWeight={800} sx={panelTitleSx}>
                Runtime telemetry
              </Typography>
              <Stack direction="row" spacing={0.6} flexWrap="wrap">
                <Chip
                  size="small"
                  color={runtimeChipColor}
                  label={`Profile: ${scenePerformance.runtimeProfile}`}
                  variant="outlined"
                  sx={panelChipSx}
                />
                <Chip
                  size="small"
                  color={fxChipColor}
                  label={`PostFX: ${scenePerformance.postFxQuality}`}
                  variant="outlined"
                  sx={panelChipSx}
                />
                <Chip
                  size="small"
                  label={`DPR: ${scenePerformance.adaptiveDpr.toFixed(2)}`}
                  variant="outlined"
                  sx={panelChipSx}
                />
                <Chip
                  size="small"
                  label={`Load: ${Math.round(scenePerformance.adaptiveLoadScale * 100)}%`}
                  variant="outlined"
                  sx={panelChipSx}
                />
                <Chip
                  size="small"
                  label={`FOV B${Math.round(scenePerformance.fovBuildingCoverage * 100)} R${Math.round(scenePerformance.fovRoadCoverage * 100)} D${Math.round(scenePerformance.fovDistrictCoverage * 100)}`}
                  variant="outlined"
                  sx={panelChipSx}
                />
                <Chip
                  size="small"
                  color={scenePerformance.fps < 30 ? 'error' : 'success'}
                  label={
                    scenePerformance.fps > 0
                      ? `FPS: ${Math.round(scenePerformance.fps)}`
                      : 'FPS: ...'
                  }
                  variant="outlined"
                  sx={panelChipSx}
                />
              </Stack>
              <ToggleButtonGroup
                size="small"
                value={targetFps}
                exclusive
                sx={toggleGroupSx}
                onChange={(_, value) => {
                  if (value === 30 || value === 45 || value === 60) {
                    onTargetFpsChange(value as 30 | 45 | 60);
                  }
                }}
              >
                <ToggleButton value={30}>Target 30</ToggleButton>
                <ToggleButton value={45}>Target 45</ToggleButton>
                <ToggleButton value={60}>Target 60</ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup
                size="small"
                value={renderProfileLock}
                exclusive
                sx={toggleGroupSx}
                onChange={(_, value) => {
                  if (
                    value === 'auto' ||
                    value === 'cinematic' ||
                    value === 'balanced' ||
                    value === 'performance'
                  ) {
                    onRenderProfileLockChange(
                      value as 'auto' | 'cinematic' | 'balanced' | 'performance',
                    );
                  }
                }}
              >
                <ToggleButton value="auto">Lock Auto</ToggleButton>
                <ToggleButton value="cinematic">Lock Cine</ToggleButton>
                <ToggleButton value="balanced">Lock Balanced</ToggleButton>
                <ToggleButton value="performance">Lock Perf</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary">
                Goal: keep FPS above 30 while preserving atmosphere and mode readability.
                Lock fixes render profile for predictable visuals.
              </Typography>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={sectionPaperSx}>
            <Stack spacing={0.8}>
              <Typography variant="subtitle2" fontWeight={800} sx={panelTitleSx}>
                GitHub token (optional)
              </Typography>
              <TextField
                size="small"
                fullWidth
                type={tokenVisible ? 'text' : 'password'}
                value={githubToken}
                placeholder="github_pat_..."
                onChange={(event) => onGithubTokenChange(event.target.value)}
                helperText="Used only for API requests from this browser session."
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setTokenVisible((value) => !value)}
                        edge="end"
                      >
                        {tokenVisible ? (
                          <VisibilityOffRoundedIcon fontSize="small" />
                        ) : (
                          <VisibilityRoundedIcon fontSize="small" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {githubToken.trim().length > 0 && (
                <Stack direction="row" spacing={0.6}>
                  <Chip
                    size="small"
                    color="success"
                    label="Custom token enabled"
                    sx={panelChipSx}
                  />
                  <Button
                    size="small"
                    sx={panelActionButtonSx}
                    onClick={() => onGithubTokenChange('')}
                  >
                    Clear
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>

          {data && (
            <Paper variant="outlined" sx={sectionPaperSx}>
              <Stack direction="row" spacing={0.6} flexWrap="wrap">
                <Chip
                  size="small"
                  label={`Files: ${data.files.length}`}
                  color="primary"
                  variant="outlined"
                  sx={panelChipSx}
                />
                <Chip
                  size="small"
                  label={`Roads: ${data.imports.length}`}
                  color="secondary"
                  variant="outlined"
                  sx={panelChipSx}
                />
                <Chip
                  size="small"
                  label={`Branches: ${data.branches?.length ?? 0}`}
                  color="success"
                  variant="outlined"
                  sx={panelChipSx}
                />
                {data.analysis && (
                  <Chip
                    size="small"
                    label={`GitHub req: ${data.analysis.diagnostics.githubRequests}`}
                    variant="outlined"
                    sx={panelChipSx}
                  />
                )}
              </Stack>

              {(cityDna || stackChips.length > 0) && (
                <Stack direction="row" spacing={0.6} flexWrap="wrap" mt={0.9}>
                  {cityDna && (
                    <>
                      <Chip
                        size="small"
                        label={`Layout: ${cityDna.layout}`}
                        variant="outlined"
                        sx={panelChipSx}
                      />
                      <Chip
                        size="small"
                        label={`Style: ${cityDna.architecture}`}
                        variant="outlined"
                        sx={panelChipSx}
                      />
                      <Chip
                        size="small"
                        label={`Lang: ${cityDna.metrics.primaryLanguage}`}
                        variant="outlined"
                        sx={panelChipSx}
                      />
                    </>
                  )}
                  {stackChips.map((chip) => (
                    <Chip
                      key={chip}
                      size="small"
                      label={chip}
                      color="info"
                      variant="outlined"
                      sx={panelChipSx}
                    />
                  ))}
                </Stack>
              )}
            </Paper>
          )}

          {hasTimeline && timelineBounds && timelineTs !== null && (
            <Paper variant="outlined" sx={sectionPaperSx}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" fontWeight={800} sx={panelTitleSx}>
                  Time Machine
                </Typography>

                <Slider
                  min={timelineBounds.min}
                  max={timelineBounds.max}
                  value={timelineTs}
                  onChange={(_, value) => onTimelineChange(value as number)}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(value) =>
                    new Date(value).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />

                <ToggleButtonGroup
                  size="small"
                  value={viewMode}
                  exclusive
                  sx={toggleGroupSx}
                  onChange={(_, value) => {
                    if (value) {
                      onViewModeChange(value as 'overview' | 'architecture' | 'risk' | 'stack');
                    }
                  }}
                >
                  <ToggleButton value="overview">Overview</ToggleButton>
                  <ToggleButton value="architecture">Architecture</ToggleButton>
                  <ToggleButton value="risk">Risk</ToggleButton>
                  <ToggleButton value="stack">Stack</ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary">
                  {viewMode === 'overview'
                    ? 'Balanced scene: branches, traffic, atmosphere.'
                    : viewMode === 'architecture'
                      ? 'Architecture focus: denser roads and dependency flow.'
                      : viewMode === 'risk'
                        ? 'Risk focus: weather/risk overlays with calmer transport.'
                        : 'Stack focus: stack towers and layer-colored buildings.'}
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      checked={compareEnabled}
                      onChange={(_, checked) => onCompareEnabledChange(checked)}
                    />
                  }
                  label="Compare dates"
                  sx={{ m: 0 }}
                />

                {compareEnabled && compareTs !== null && (
                  <Stack spacing={0.8}>
                    <ToggleButtonGroup
                      size="small"
                      value={compareMode}
                      exclusive
                      sx={toggleGroupSx}
                      onChange={(_, value) => {
                        if (value) {
                          onCompareModeChange(value as 'ghost' | 'split');
                        }
                      }}
                    >
                      <ToggleButton value="ghost">Ghost</ToggleButton>
                      <ToggleButton value="split">Split</ToggleButton>
                    </ToggleButtonGroup>
                    <Typography variant="caption" color="text.secondary">
                      Baseline: {compareLabel}
                    </Typography>
                    <Slider
                      min={timelineBounds.min}
                      max={timelineTs}
                      value={compareTs}
                      onChange={(_, value) => onCompareTsChange(value as number)}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(value) =>
                        new Date(value).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      }
                    />
                    {compareSummary && (
                      <Stack direction="row" spacing={0.6} flexWrap="wrap">
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Δ files ${compareSummary.filesDelta >= 0 ? '+' : ''}${compareSummary.filesDelta}`}
                          sx={panelChipSx}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Δ roads ${compareSummary.roadsDelta >= 0 ? '+' : ''}${compareSummary.roadsDelta}`}
                          sx={panelChipSx}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Δ risk ${compareSummary.riskDelta >= 0 ? '+' : ''}${Math.round(compareSummary.riskDelta * 100)}%`}
                          sx={panelChipSx}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Δ hubs ${compareSummary.hubsDelta >= 0 ? '+' : ''}${compareSummary.hubsDelta}`}
                          sx={panelChipSx}
                        />
                      </Stack>
                    )}
                  </Stack>
                )}
              </Stack>
            </Paper>
          )}

          <Paper variant="outlined" sx={sectionPaperSx}>
            <Stack spacing={0.6}>
              <Typography variant="subtitle2" fontWeight={800} sx={panelTitleSx}>
                Scene toggles
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField
                  select
                  size="small"
                  label="Time of day"
                  value={timeOfDay}
                  disabled={dynamicAtmosphere}
                  onChange={(event) =>
                    onTimeOfDayChange(
                      event.target.value as 'auto' | 'dawn' | 'day' | 'sunset' | 'night',
                    )
                  }
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="auto">Auto</MenuItem>
                  <MenuItem value="dawn">Dawn</MenuItem>
                  <MenuItem value="day">Day</MenuItem>
                  <MenuItem value="sunset">Sunset</MenuItem>
                  <MenuItem value="night">Night</MenuItem>
                </TextField>

                <TextField
                  select
                  size="small"
                  label="Weather"
                  value={weatherMode}
                  disabled={dynamicAtmosphere}
                  onChange={(event) =>
                    onWeatherModeChange(
                      event.target.value as 'auto' | 'clear' | 'mist' | 'rain' | 'storm',
                    )
                  }
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="auto">Auto</MenuItem>
                  <MenuItem value="clear">Clear</MenuItem>
                  <MenuItem value="mist">Mist</MenuItem>
                  <MenuItem value="rain">Rain</MenuItem>
                  <MenuItem value="storm">Storm</MenuItem>
                </TextField>
              </Stack>
              <FormControlLabel
                control={
                  <Switch
                    checked={dynamicAtmosphere}
                    onChange={(_, checked) => onDynamicAtmosphereChange(checked)}
                  />
                }
                label="Dynamic atmosphere cycle"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={constructionMode}
                    onChange={(_, checked) => onConstructionModeChange(checked)}
                  />
                }
                label="Construction timelapse"
                sx={{ m: 0 }}
              />
              {constructionMode && (
                <Stack spacing={0.3}>
                  <Typography variant="caption" color="text.secondary">
                    Build speed: {constructionSpeed.toFixed(2)}x
                  </Typography>
                  <Slider
                    size="small"
                    min={0.2}
                    max={2}
                    step={0.05}
                    value={constructionSpeed}
                    onChange={(_, value) => onConstructionSpeedChange(value as number)}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Build progress: {Math.round(constructionProgress * 100)}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.max(1, Math.min(100, constructionProgress * 100))}
                    sx={{ height: 5, borderRadius: 4 }}
                  />
                </Stack>
              )}

              <Stack spacing={0.3}>
                <Typography variant="caption" color="text.secondary">
                  Cinematic preset intensity: {Math.round(modePresetIntensity * 100)}%
                </Typography>
                <Slider
                  size="small"
                  min={0.55}
                  max={1.8}
                  step={0.05}
                  value={modePresetIntensity}
                  onChange={(_, value) =>
                    onModePresetIntensityChange(value as number)
                  }
                />
              </Stack>

              <TextField
                select
                size="small"
                label="Tour mode"
                value={tourMode}
                onChange={(event) =>
                  onTourModeChange(event.target.value as TourMode)
                }
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="orbit">Orbit</MenuItem>
                <MenuItem value="drone">Follow drone</MenuItem>
                <MenuItem value="walk">Walk surface</MenuItem>
                <MenuItem value="coaster">Train ride</MenuItem>
              </TextField>

              {(tourMode === 'drone' || tourMode === 'walk') && (
                <Stack spacing={0.3}>
                  <Typography variant="caption" color="text.secondary">
                    Drone anchor: #{safeFollowDroneIndex + 1}
                  </Typography>
                  <Slider
                    size="small"
                    min={0}
                    max={maxDroneIndex}
                    step={1}
                    value={safeFollowDroneIndex}
                    onChange={(_, value) => onFollowDroneIndexChange(value as number)}
                  />
                </Stack>
              )}

              {tourMode === 'walk' && (
                <Typography variant="caption" color="text.secondary">
                  Walk controls: click scene + mouse look, WASD move, Shift sprint, E enter building, Q/Esc exit.
                </Typography>
              )}
              {tourMode === 'coaster' && (
                <Stack spacing={0.3}>
                  <Typography variant="caption" color="text.secondary">
                    Train ride: camera is inside the lead car, speed adapts to slope, turns and safety braking.
                  </Typography>
                  <TextField
                    select
                    size="small"
                    label="Drive profile"
                    value={coasterProfile}
                    onChange={(event) =>
                      onCoasterProfileChange(event.target.value as CoasterDriveProfile)
                    }
                    sx={{ minWidth: 150 }}
                  >
                    <MenuItem value="comfort">Comfort</MenuItem>
                    <MenuItem value="sport">Sport</MenuItem>
                    <MenuItem value="extreme">Extreme</MenuItem>
                  </TextField>
                  <Typography variant="caption" color="text.secondary">
                    {coasterProfileHint}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Coaster intensity: {Math.round(coasterIntensity * 100)}%
                  </Typography>
                  <Slider
                    size="small"
                    min={0.65}
                    max={1.8}
                    step={0.05}
                    value={coasterIntensity}
                    onChange={(_, value) =>
                      onCoasterIntensityChange(value as number)
                    }
                  />
                </Stack>
              )}

              <FormControlLabel
                control={<Switch checked={autoTour} onChange={(_, checked) => onAutoTourChange(checked)} />}
                label="Auto tour"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={liveWatch} onChange={(_, checked) => onLiveWatchChange(checked)} />}
                label="Live watch (2m)"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={
                  <Switch checked={showAtmosphere} onChange={(_, checked) => onShowAtmosphereChange(checked)} />
                }
                label="Atmosphere"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={showWeather} onChange={(_, checked) => onShowWeatherChange(checked)} />}
                label="Code weather"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={showBuilders} onChange={(_, checked) => onShowBuildersChange(checked)} />}
                label="Builders"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={showMinimap} onChange={(_, checked) => onShowMinimapChange(checked)} />}
                label="Minimap"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={showInsights} onChange={(_, checked) => onShowInsightsChange(checked)} />}
                label="Insights panel"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={showBranchMap} onChange={(_, checked) => onShowBranchMapChange(checked)} />}
                label="Branch panel"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={showFileCard} onChange={(_, checked) => onShowFileCardChange(checked)} />}
                label="File details card"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={showChat} onChange={(_, checked) => onShowChatChange(checked)} />}
                label="Chat dock"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={
                  <Switch checked={showNarrator} onChange={(_, checked) => onShowNarratorChange(checked)} />
                }
                label="LLM narrator"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={showPostProcessing}
                    onChange={(_, checked) => onShowPostProcessingChange(checked)}
                  />
                }
                label="Post FX"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={adaptivePostFx}
                    onChange={(_, checked) => onAdaptivePostFxChange(checked)}
                    disabled={!showPostProcessing}
                  />
                }
                label="Adaptive Post FX (FPS)"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={<Switch checked={showFps} onChange={(_, checked) => onShowFpsChange(checked)} />}
                label="FPS indicator (on demand)"
                sx={{ m: 0 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={showCyberpunkOverlay}
                    onChange={(_, checked) => onShowCyberpunkOverlayChange(checked)}
                  />
                }
                label="Cyberpunk FX overlay"
                sx={{ m: 0 }}
              />
            </Stack>
          </Paper>

          {data && (
            <Paper variant="outlined" sx={sectionPaperSx}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" fontWeight={800} sx={panelTitleSx}>
                  Filters and search
                </Typography>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    select
                    size="small"
                    label="Language"
                    value={languageFilter}
                    onChange={(event) => onLanguageFilterChange(event.target.value)}
                    sx={{ minWidth: 140 }}
                  >
                    <MenuItem value="all">All languages</MenuItem>
                    {languageOptions.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    size="small"
                    label="Author"
                    value={authorFilter}
                    onChange={(event) => onAuthorFilterChange(event.target.value)}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="all">All authors</MenuItem>
                    {authorOptions.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    select
                    size="small"
                    label="District"
                    value={districtFilter}
                    onChange={(event) => onDistrictFilterChange(event.target.value)}
                    sx={{ minWidth: 140 }}
                  >
                    <MenuItem value="all">All districts</MenuItem>
                    {districtOptions.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    size="small"
                    label="Branch"
                    value={branchFilter}
                    onChange={(event) => onBranchFilterChange(event.target.value)}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="all">All branches</MenuItem>
                    {branchOptions.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    size="small"
                    label="Risk"
                    value={riskFilter}
                    onChange={(event) => onRiskFilterChange(event.target.value as 'all' | 'low' | 'medium' | 'high')}
                    sx={{ minWidth: 120 }}
                  >
                    <MenuItem value="all">All risk</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="low">Low</MenuItem>
                  </TextField>
                </Stack>

                <TextField
                  size="small"
                  label="Path filter"
                  placeholder="src/components/Button.tsx"
                  value={pathFilter}
                  onChange={(event) => onPathFilterChange(event.target.value)}
                />

                <Autocomplete
                  size="small"
                  options={jumpOptions}
                  onChange={(_, value) => {
                    if (value) {
                      onJumpToFile(value);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Jump to file"
                      placeholder="Select file to focus"
                    />
                  )}
                />
              </Stack>
            </Paper>
          )}

          <Paper variant="outlined" sx={sectionPaperSx}>
            <Stack direction="row" spacing={0.7} flexWrap="wrap">
              <Button
                size="small"
                variant="outlined"
                startIcon={<SummarizeRoundedIcon />}
                sx={panelActionButtonSx}
                onClick={onExportSummary}
              >
                Summary
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ImageRoundedIcon />}
                sx={panelActionButtonSx}
                onClick={onExportPng}
              >
                PNG
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DataObjectRoundedIcon />}
                sx={panelActionButtonSx}
                onClick={onExportJson}
              >
                JSON
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<WarningAmberRoundedIcon />}
                sx={panelActionButtonSx}
                onClick={onExportHotspots}
              >
                Hotspots
              </Button>
            </Stack>
          </Paper>
        </Stack>
      </Drawer>
    </>
  );
}
