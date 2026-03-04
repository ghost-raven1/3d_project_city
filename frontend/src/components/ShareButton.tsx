import { useState } from 'react';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { Alert, Button, IconButton, Snackbar, Tooltip } from '@mui/material';

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
            <IconButton size="small" onClick={handleShare} disabled={!repoUrl}>
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
