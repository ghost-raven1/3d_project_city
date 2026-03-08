import { useState } from 'react';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { Alert, Button, IconButton, Snackbar, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { panelActionButtonSx } from './panelStyles';

interface ShareButtonProps {
  repoUrl: string;
  compact?: boolean;
}

export function ShareButton({ repoUrl, compact = false }: ShareButtonProps) {
  const [feedback, setFeedback] = useState<{
    open: boolean;
    severity: 'success' | 'error';
    message: string;
  }>({
    open: false,
    severity: 'success',
    message: '',
  });

  const handleShare = async () => {
    try {
      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.set('repo', repoUrl);
      await navigator.clipboard.writeText(shareUrl.toString());
      setFeedback({
        open: true,
        severity: 'success',
        message: 'Ссылка скопирована',
      });
    } catch {
      setFeedback({
        open: true,
        severity: 'error',
        message: 'Не удалось скопировать ссылку',
      });
    }
  };

  return (
    <>
      {compact ? (
        <Tooltip title="Поделиться">
          <span>
            <IconButton
              size="small"
              onClick={handleShare}
              disabled={!repoUrl}
              sx={{
                ...panelActionButtonSx,
                border: `1px solid ${alpha('#84ddff', 0.34)}`,
                backgroundColor: alpha('#0b2746', 0.52),
                '&:hover': {
                  backgroundColor: alpha('#13406a', 0.66),
                },
              }}
            >
              <ContentCopyRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : (
        <Button
          variant="outlined"
          startIcon={<ContentCopyRoundedIcon />}
          onClick={handleShare}
          disabled={!repoUrl}
          sx={{
            ...panelActionButtonSx,
            borderColor: alpha('#84ddff', 0.38),
            backgroundColor: alpha('#0b2746', 0.42),
          }}
        >
          Поделиться
        </Button>
      )}
      <Snackbar
        open={feedback.open}
        autoHideDuration={2500}
        onClose={() =>
          setFeedback((value) => ({
            ...value,
            open: false,
          }))
        }
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          severity={feedback.severity}
          variant="filled"
          sx={{
            border: `1px solid ${alpha('#8fe7ff', 0.42)}`,
            backdropFilter: 'blur(8px)',
          }}
          onClose={() =>
            setFeedback((value) => ({
              ...value,
              open: false,
            }))
          }
        >
          {feedback.message}
        </Alert>
      </Snackbar>
    </>
  );
}
