import {
  useEffect,
  useRef,
} from 'react';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import RouterRoundedIcon from '@mui/icons-material/RouterRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import {
  Box,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ParseStatus } from '../types/repository';
import { panelChipSx, panelInsetSx, panelSurfaceSx, panelTitleSx } from './panelStyles';

interface ProductStatusDockProps {
  parseStatus: ParseStatus;
  progress: number;
  message: string;
  stage: string;
  roomConnected: boolean;
  activeRoomId: string | null;
  narratorStatus: 'idle' | 'thinking' | 'error';
  liveWatch: boolean;
  runtimeProfile: 'cinematic' | 'balanced' | 'performance';
  postFxQuality: 'high' | 'medium' | 'low';
  adaptiveDpr: number;
  adaptiveLoadScale: number;
  sceneFps: number;
  effectiveTimeOfDay?: 'auto' | 'dawn' | 'day' | 'sunset' | 'night';
  effectiveWeatherMode?: 'auto' | 'clear' | 'mist' | 'rain' | 'storm';
  dynamicAtmosphere?: boolean;
  compact?: boolean;
  onHeightChange?: (height: number) => void;
}

function statusLabel(status: ParseStatus): string {
  if (status === 'connecting') {
    return 'Connecting';
  }
  if (status === 'parsing') {
    return 'Parsing';
  }
  if (status === 'done') {
    return 'Ready';
  }
  if (status === 'error') {
    return 'Error';
  }
  return 'Idle';
}

export function ProductStatusDock({
  parseStatus,
  progress,
  message,
  stage,
  roomConnected,
  activeRoomId,
  narratorStatus,
  liveWatch,
  runtimeProfile,
  postFxQuality,
  adaptiveDpr,
  adaptiveLoadScale,
  sceneFps,
  effectiveTimeOfDay = 'day',
  effectiveWeatherMode = 'clear',
  dynamicAtmosphere = false,
  compact = false,
  onHeightChange,
}: ProductStatusDockProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef(0);
  const parseBusy = parseStatus === 'connecting' || parseStatus === 'parsing';
  const parseColor =
    parseStatus === 'done'
      ? '#7bf0a6'
      : parseStatus === 'error'
        ? '#ff8ea3'
        : parseBusy
          ? '#9ce6ff'
          : '#c8d9f8';
  const narratorColor =
    narratorStatus === 'thinking'
      ? '#9fe9ff'
      : narratorStatus === 'error'
        ? '#ff9bb0'
        : '#aad8ff';
  const runtimeColor =
    runtimeProfile === 'performance'
      ? '#ffb17d'
      : runtimeProfile === 'balanced'
        ? '#9fd9ff'
        : '#9cf0c6';
  const qualityColor =
    postFxQuality === 'low'
      ? '#ffbe87'
      : postFxQuality === 'medium'
        ? '#a8e5ff'
        : '#9cf4d0';
  const cycleColor =
    effectiveTimeOfDay === 'night'
      ? '#b4c3ff'
      : effectiveTimeOfDay === 'sunset'
        ? '#ffbe88'
      : effectiveTimeOfDay === 'dawn'
          ? '#9de9ff'
      : effectiveTimeOfDay === 'auto'
        ? '#8aa8c8'
        : '#9ce8d1';
  const chipLabelSx = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as const;
  const shouldShowFxChip =
    !compact ||
    postFxQuality !== 'high' ||
    adaptiveLoadScale < 0.95 ||
    sceneFps < 54;

  useEffect(() => {
    if (!onHeightChange) {
      return;
    }

    const node = rootRef.current;
    if (!node) {
      return;
    }

    const emitHeight = () => {
      const next = Math.max(0, Math.ceil(node.getBoundingClientRect().height));
      if (Math.abs(next - lastHeightRef.current) < 1) {
        return;
      }
      lastHeightRef.current = next;
      onHeightChange(next);
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
  }, [onHeightChange]);

  return (
    <Paper
      ref={rootRef}
      elevation={2}
      sx={{
        position: 'absolute',
        left: { xs: 8, md: 16 },
        bottom: { xs: 8, md: 14 },
        zIndex: 12,
        minWidth: { xs: compact ? 228 : 246, md: compact ? 288 : 312 },
        maxWidth: { xs: 'calc(100vw - 16px)', md: compact ? 380 : 420 },
        p: 1,
        ...panelSurfaceSx,
      }}
    >
      <Stack spacing={compact ? 0.65 : 0.8}>
        <Typography
          variant="caption"
          sx={{
            ...panelTitleSx,
            fontWeight: 700,
          }}
        >
          System Pulse
        </Typography>
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
          <Chip
            size="small"
            icon={<HubRoundedIcon sx={{ color: `${parseColor} !important` }} />}
            label={`${statusLabel(parseStatus)}${parseBusy ? ` · ${Math.round(progress)}%` : ''}`}
            sx={{
              ...panelChipSx,
              color: '#e3f1ff',
              borderColor: alpha(parseColor, 0.65),
              backgroundColor: alpha('#0f223f', 0.55),
              '& .MuiChip-label': {
                ...chipLabelSx,
                fontWeight: 700,
                letterSpacing: '0.03em',
              },
            }}
            variant="outlined"
          />
          <Chip
            size="small"
            icon={<ForumRoundedIcon sx={{ color: `${roomConnected ? '#9cf0c6' : '#9fb7d8'} !important` }} />}
            label={
              roomConnected
                ? compact
                  ? `Room ${activeRoomId ?? 'live'}`
                  : `Room ${activeRoomId ?? 'connected'}`
                : compact
                  ? 'Room off'
                  : 'Room offline'
            }
            sx={{
              ...panelChipSx,
              color: '#d8e9ff',
              borderColor: alpha(roomConnected ? '#87eec0' : '#8aa7cf', 0.5),
              backgroundColor: alpha('#0f223f', 0.5),
              '& .MuiChip-label': chipLabelSx,
            }}
            variant="outlined"
          />
          <Chip
            size="small"
            icon={<AutoStoriesRoundedIcon sx={{ color: `${narratorColor} !important` }} />}
            label={`Narrator ${narratorStatus}`}
            sx={{
              ...panelChipSx,
              color: '#d8e9ff',
              borderColor: alpha(narratorColor, 0.5),
              backgroundColor: alpha('#0f223f', 0.5),
              '& .MuiChip-label': chipLabelSx,
            }}
            variant="outlined"
          />
          {liveWatch && (
            <Chip
              size="small"
              icon={<RouterRoundedIcon sx={{ color: '#9ce6ff !important' }} />}
              label="Live watch"
              sx={{
                ...panelChipSx,
                color: '#d8e9ff',
                borderColor: alpha('#8fd8ff', 0.52),
                backgroundColor: alpha('#0f223f', 0.5),
                '& .MuiChip-label': chipLabelSx,
              }}
              variant="outlined"
            />
          )}
          <Chip
            size="small"
            label={`Render ${runtimeProfile}`}
            sx={{
              ...panelChipSx,
              color: '#d8e9ff',
              borderColor: alpha(runtimeColor, 0.55),
              backgroundColor: alpha('#0f223f', 0.5),
              '& .MuiChip-label': chipLabelSx,
            }}
            variant="outlined"
          />
          <Chip
            size="small"
            label={`${dynamicAtmosphere ? 'Cycle' : 'Scene'} ${effectiveTimeOfDay} · ${effectiveWeatherMode}`}
            sx={{
              ...panelChipSx,
              color: '#d8e9ff',
              borderColor: alpha(cycleColor, 0.5),
              backgroundColor: alpha('#0f223f', 0.5),
              '& .MuiChip-label': chipLabelSx,
            }}
            variant="outlined"
          />
          {shouldShowFxChip && (
            <Chip
              size="small"
              label={
                compact
                  ? `FX ${postFxQuality} · ${Math.round(adaptiveLoadScale * 100)}%`
                  : `FX ${postFxQuality} · DPR ${adaptiveDpr.toFixed(2)} · Load ${Math.round(adaptiveLoadScale * 100)}%`
              }
              sx={{
                ...panelChipSx,
                color: '#d8e9ff',
                borderColor: alpha(qualityColor, 0.5),
                backgroundColor: alpha('#0f223f', 0.5),
                '& .MuiChip-label': chipLabelSx,
              }}
              variant="outlined"
            />
          )}
          {sceneFps > 0 && (
            <Chip
              size="small"
              label={`FPS ${Math.round(sceneFps)}`}
              sx={{
                ...panelChipSx,
                color: '#d8e9ff',
                borderColor: alpha(sceneFps < 30 ? '#ff9898' : '#9deec5', 0.5),
                backgroundColor: alpha('#0f223f', 0.5),
                '& .MuiChip-label': chipLabelSx,
              }}
              variant="outlined"
            />
          )}
        </Stack>

        <Box
          sx={{
            ...panelInsetSx,
            minHeight: 18,
            px: 0.7,
            py: 0.45,
          }}
        >
          <Typography variant="caption" sx={{ color: alpha('#c8ddfa', 0.94) }}>
            {message || (stage ? `Stage: ${stage}` : 'Ready for parsing and scene interaction.')}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
