import { FormEvent } from 'react';
import { Box, Button, Paper, TextField, Typography } from '@mui/material';
import { panelSurfaceSx } from './panelStyles';

interface RepoFormProps {
  repoUrl: string;
  disabled: boolean;
  onRepoUrlChange: (value: string) => void;
  onSubmit: () => void;
}

export function RepoForm({
  repoUrl,
  disabled,
  onRepoUrlChange,
  onSubmit,
}: RepoFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <Paper
      component="form"
      onSubmit={handleSubmit}
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        gap: 1.5,
        alignItems: { xs: 'stretch', md: 'center' },
        ...panelSurfaceSx,
      }}
      elevation={2}
    >
      <Box sx={{ flexGrow: 1 }}>
        <Typography
          variant="subtitle2"
          sx={{
            mb: 0.5,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#b2f2ff',
          }}
        >
          Public GitHub repository URL
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="https://github.com/facebook/react"
          value={repoUrl}
          onChange={(event) => onRepoUrlChange(event.target.value)}
          disabled={disabled}
        />
      </Box>
      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={disabled || !repoUrl.trim()}
        sx={{ minWidth: { md: 180 } }}
      >
        Построить город
      </Button>
    </Paper>
  );
}
