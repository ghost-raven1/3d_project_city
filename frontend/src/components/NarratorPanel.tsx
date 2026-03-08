import {
  ReactNode,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import TheaterComedyRoundedIcon from '@mui/icons-material/TheaterComedyRounded';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import MovieFilterRoundedIcon from '@mui/icons-material/MovieFilterRounded';
import { Box, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import { NarratorManualCue, NarratorStory, NarratorUiAction } from '../types/narrator';
import {
  panelActionButtonSx,
  panelChipSx,
  panelEmptyStateSx,
  panelMetaTextSx,
  panelScrollSx,
  panelSurfaceSx,
  panelTitleSx,
} from './panelStyles';

interface NarratorPanelProps {
  stories: NarratorStory[];
  status: 'idle' | 'thinking' | 'error';
  error: string | null;
  topOffset?: number;
  compact?: boolean;
  onManualCue?: (cue: NarratorManualCue) => void;
  onHeightChange?: (height: number) => void;
  onWidthChange?: (width: number) => void;
}

const cueButtons: Array<{
  cue: NarratorManualCue;
  label: string;
  icon: ReactNode;
}> = [
  { cue: 'story', label: 'История', icon: <AutoStoriesRoundedIcon sx={{ fontSize: 16 }} /> },
  { cue: 'joke', label: 'Шутка', icon: <TheaterComedyRoundedIcon sx={{ fontSize: 16 }} /> },
  { cue: 'hype', label: 'Хайп', icon: <RocketLaunchRoundedIcon sx={{ fontSize: 16 }} /> },
  { cue: 'retro', label: 'Ретро', icon: <MovieFilterRoundedIcon sx={{ fontSize: 16 }} /> },
];

function formatNarratorUiAction(action: NarratorUiAction): string {
  if (action.type === 'set_view_mode') {
    return `mode=${action.value}`;
  }
  if (action.type === 'set_tour_mode') {
    return `tour=${action.value}`;
  }
  if (action.type === 'set_compare_enabled') {
    return `compare=${action.value}`;
  }
  if (action.type === 'set_compare_mode') {
    return `compare-mode=${action.value}`;
  }
  if (action.type === 'set_panel_visibility') {
    return `${action.target}=${action.value}`;
  }
  if (action.type === 'set_branch_only_mode') {
    return `branch-only=${action.value}`;
  }
  return `file=${action.value}`;
}

export function NarratorPanel({
  stories,
  status,
  error,
  topOffset = 94,
  compact = false,
  onManualCue,
  onHeightChange,
  onWidthChange,
}: NarratorPanelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef(0);
  const lastWidthRef = useRef(0);
  const storyFeed = stories.slice(Math.max(0, stories.length - 4)).reverse();
  const statusLabel = useMemo(() => {
    if (status === 'thinking') {
      return 'thinking';
    }
    if (status === 'error') {
      return 'error';
    }
    return 'live';
  }, [status]);
  const mobileTopOffset = Math.max(72, Math.round(topOffset));

  useEffect(() => {
    if (!onHeightChange && !onWidthChange) {
      return;
    }

    const node = rootRef.current;
    if (!node) {
      return;
    }

    const emitSize = () => {
      const bounds = node.getBoundingClientRect();
      if (onHeightChange) {
        const nextHeight = Math.max(0, Math.ceil(bounds.height));
        if (Math.abs(nextHeight - lastHeightRef.current) >= 1) {
          lastHeightRef.current = nextHeight;
          onHeightChange(nextHeight);
        }
      }
      if (onWidthChange) {
        const nextWidth = Math.max(0, Math.ceil(bounds.width));
        if (Math.abs(nextWidth - lastWidthRef.current) >= 1) {
          lastWidthRef.current = nextWidth;
          onWidthChange(nextWidth);
        }
      }
    };

    emitSize();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => emitSize());
    observer?.observe(node);
    window.addEventListener('resize', emitSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', emitSize);
    };
  }, [onHeightChange, onWidthChange]);

  return (
    <Paper
      ref={rootRef}
      elevation={5}
      sx={{
        position: 'absolute',
        right: { xs: 8, md: 16 },
        top: { xs: mobileTopOffset, md: topOffset },
        width: { xs: 'calc(100% - 16px)', sm: compact ? 338 : 372 },
        zIndex: 17,
        p: compact ? 0.85 : 1,
        ...panelSurfaceSx,
      }}
    >
      <Stack spacing={0.7}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={0.6} alignItems="center">
            <VolumeUpRoundedIcon fontSize="small" sx={{ color: '#8cf0ff' }} />
            <Typography variant="subtitle2" fontWeight={800} sx={panelTitleSx}>
              Neural Narrator
            </Typography>
          </Stack>
          <Chip
            size="small"
            label={statusLabel}
            color={status === 'error' ? 'error' : status === 'thinking' ? 'warning' : 'success'}
            variant="outlined"
            sx={panelChipSx}
          />
        </Stack>

        <Box
          sx={{
            minHeight: 68,
            maxHeight: compact ? 126 : 152,
            overflowY: 'auto',
            pr: 0.3,
            ...panelScrollSx,
          }}
        >
          {storyFeed.length > 0 ? (
            <Stack spacing={0.8}>
              {storyFeed.map((story, index) => (
                <Box
                  key={story.id}
                  sx={{
                    px: 0.8,
                    py: 0.55,
                    borderRadius: 1,
                    border: '1px solid rgba(118,199,238,0.24)',
                    backgroundColor:
                      index === 0
                        ? 'rgba(12,46,72,0.72)'
                        : 'rgba(8,28,51,0.74)',
                    boxShadow:
                      index === 0
                        ? '0 0 16px rgba(71, 209, 255, 0.16)'
                        : 'none',
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}
                  >
                    {new Date(story.createdAt).toLocaleTimeString()} · {story.action}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.4, overflowWrap: 'anywhere' }}
                  >
                    {story.text}
                  </Typography>
                  {story.uiActions && story.uiActions.length > 0 && (
                    <Stack direction="row" spacing={0.4} mt={0.7} flexWrap="wrap">
                      {story.uiActions.slice(0, 4).map((action, actionIndex) => (
                        <Chip
                          key={`${story.id}_action_${actionIndex}`}
                          size="small"
                          label={formatNarratorUiAction(action)}
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          ) : (
            <Box sx={panelEmptyStateSx}>
              <Typography variant="body2" sx={panelMetaTextSx}>
                Narrator is ready. Interact with the city to hear repository story beats.
              </Typography>
            </Box>
          )}
        </Box>

        {onManualCue && (
          <>
            <Divider />
            <Stack direction="row" spacing={0.45} flexWrap="wrap">
              {cueButtons.map((item) => (
                <Button
                  key={item.cue}
                  size="small"
                  variant="outlined"
                  startIcon={item.icon}
                  disabled={status === 'thinking'}
                  sx={{
                    ...panelActionButtonSx,
                  }}
                  onClick={() => onManualCue(item.cue)}
                >
                  {item.label}
                </Button>
              ))}
            </Stack>
          </>
        )}

        {error && (
          <Typography variant="caption" color="error" sx={{ overflowWrap: 'anywhere' }}>
            {error}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
