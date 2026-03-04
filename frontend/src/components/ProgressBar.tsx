import { Paper, LinearProgress, Typography } from '@mui/material';

interface ProgressBarProps {
  progress: number;
  message: string;
}

export function ProgressBar({ progress, message }: ProgressBarProps) {
  return (
    <Paper
      sx={{
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        backdropFilter: 'blur(4px)',
        backgroundColor: 'rgba(255,255,255,0.85)',
      }}
      elevation={2}
    >
      <Typography variant="body2">{message || 'Parsing repository...'}</Typography>
      <LinearProgress variant="determinate" value={progress} />
      <Typography variant="caption" color="text.secondary">
        {Math.round(progress)}%
      </Typography>
    </Paper>
  );
}
