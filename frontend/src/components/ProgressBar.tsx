import { Box, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import { SxProps, Theme } from '@mui/material/styles';
import { panelMetaTextSx, panelTitleSx } from './panelStyles';
import { UI_MOTION } from '../theme/motion';

interface ProgressBarProps {
  progress?: number;
  message?: string;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  sx?: SxProps<Theme>;
}

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.35; transform: scale(0.94); }
  50% { opacity: 0.9; transform: scale(1); }
`;

const scan = keyframes`
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
`;

function clampProgress(value?: number): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, value));
}

export function ProgressBar({
  progress,
  message,
  title = 'City Pipeline',
  subtitle = 'Synthesizing repo skyline',
  compact = false,
  sx,
}: ProgressBarProps) {
  const safeProgress = clampProgress(progress);
  const determinate = safeProgress !== null;
  const phase = determinate ? Math.max(0, Math.min(3, Math.floor((safeProgress / 100) * 4))) : 0;
  const stages = ['Ingest', 'Parse', 'Build', 'Render'];

  return (
    <Paper
      sx={{
        p: compact ? 1 : 1.4,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 0.55 : 0.9,
        border: `1px solid ${alpha('#7acbff', 0.45)}`,
        borderRadius: compact ? 2 : 2.4,
        backdropFilter: 'blur(9px)',
        background:
          'linear-gradient(140deg, rgba(8,20,43,0.88) 0%, rgba(12,30,62,0.82) 58%, rgba(9,18,39,0.9) 100%)',
        boxShadow: `0 10px 30px ${alpha('#081a38', 0.36)}`,
        color: '#e8f4ff',
        overflow: 'hidden',
        ...sx,
      }}
      elevation={2}
    >
      <Stack direction="row" spacing={compact ? 1 : 1.15} alignItems="center">
        <Box
          sx={{
            width: compact ? 26 : 34,
            height: compact ? 26 : 34,
            borderRadius: '50%',
            border: `1px solid ${alpha('#8ce8ff', 0.85)}`,
            position: 'relative',
            flexShrink: 0,
            boxShadow: `0 0 18px ${alpha('#6be6ff', 0.24)}`,
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: compact ? -3 : -4,
              borderRadius: '50%',
              border: `1px dashed ${alpha('#64b2ff', 0.62)}`,
              animation: `${spin} ${UI_MOTION.progressSpinSec}s linear infinite`,
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              inset: compact ? 6 : 8,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${alpha('#9dfeff', 0.8)} 0%, ${alpha('#3b8cff', 0.35)} 78%, transparent 100%)`,
              animation: `${pulse} ${UI_MOTION.progressPulseSec}s ease-in-out infinite`,
            },
          }}
        />

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant={compact ? 'caption' : 'body2'}
            sx={{
              ...panelTitleSx,
              lineHeight: 1.1,
              letterSpacing: compact ? '0.08em' : '0.11em',
              fontFamily: '"Orbitron", "Space Grotesk", sans-serif',
              fontWeight: 700,
            }}
          >
            {title}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              ...panelMetaTextSx,
              letterSpacing: '0.03em',
              lineHeight: 1.2,
              display: 'block',
              mt: 0.2,
            }}
          >
            {subtitle}
          </Typography>
        </Box>

        {determinate && (
          <Typography
            variant="caption"
            sx={{
              fontFamily: '"JetBrains Mono", monospace',
              fontWeight: 700,
              color: '#96f1ff',
              letterSpacing: '0.04em',
              minWidth: compact ? 34 : 40,
              textAlign: 'right',
            }}
          >
            {Math.round(safeProgress)}%
          </Typography>
        )}
      </Stack>

      <Box sx={{ position: 'relative' }}>
        <LinearProgress
          variant={determinate ? 'determinate' : 'indeterminate'}
          value={safeProgress ?? undefined}
          sx={{
            height: compact ? 5 : 6,
            borderRadius: 999,
            backgroundColor: alpha('#89a8d6', 0.25),
            '& .MuiLinearProgress-bar': {
              borderRadius: 999,
              background:
                'linear-gradient(90deg, #45d4ff 0%, #8ef7ff 48%, #5d72ff 100%)',
              boxShadow: `0 0 14px ${alpha('#4be3ff', 0.6)}`,
            },
          }}
        />
        <Box
          sx={{
            pointerEvents: 'none',
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            borderRadius: 999,
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              width: '44%',
              background: `linear-gradient(90deg, transparent 0%, ${alpha('#ffffff', 0.58)} 48%, transparent 100%)`,
              animation: `${scan} ${UI_MOTION.progressScanSec}s linear infinite`,
            },
          }}
        />
      </Box>

      <Stack direction="row" spacing={0.55} alignItems="center" sx={{ mt: 0.1 }}>
        {stages.map((stage, index) => (
          <Box
            key={stage}
            sx={{
              flex: 1,
              minWidth: 0,
              borderRadius: 99,
              height: compact ? 3 : 4,
              backgroundColor:
                index <= phase
                  ? alpha('#76e7ff', compact ? 0.82 : 0.9)
                  : alpha('#7f97bf', 0.24),
              boxShadow:
                index <= phase
                  ? `0 0 10px ${alpha('#6de8ff', 0.42)}`
                  : 'none',
            }}
            title={stage}
          />
        ))}
      </Stack>

      <Typography
        variant="caption"
        sx={{
          ...panelMetaTextSx,
          lineHeight: 1.2,
          letterSpacing: '0.02em',
        }}
      >
        {message || 'Parsing repository timeline and generating city layers...'}
      </Typography>
    </Paper>
  );
}
