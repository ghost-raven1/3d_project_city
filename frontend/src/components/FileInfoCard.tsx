import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useMemo } from 'react';
import { PositionedFileHistory } from '../types/repository';
import { classifyBuildingMood } from '../utils/city';
import { FileRiskProfile, riskBand } from '../utils/risk';

interface FileInfoCardProps {
  file: PositionedFileHistory;
  riskProfile: FileRiskProfile | null;
  onClose: () => void;
}

const moodLabelMap: Record<ReturnType<typeof classifyBuildingMood>, string> = {
  storm: 'Storm zone',
  rain: 'Active zone',
  sun: 'Stable zone',
};

const moodColorMap: Record<ReturnType<typeof classifyBuildingMood>, 'warning' | 'info' | 'success'> = {
  storm: 'warning',
  rain: 'info',
  sun: 'success',
};

export function FileInfoCard({ file, riskProfile, onClose }: FileInfoCardProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const authorStats = useMemo(() => {
    const map = new Map<string, number>();

    file.commits.forEach((commit) => {
      map.set(commit.author, (map.get(commit.author) ?? 0) + 1);
    });

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [file.commits]);

  const mood = useMemo(() => classifyBuildingMood(file), [file]);
  const latestCommit = file.commits[file.commits.length - 1] ?? null;
  const risk = riskProfile?.risk ?? 0;
  const riskLabel = riskBand(risk);
  const activityTimeline = useMemo(() => {
    const sorted = [...file.commits]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-28);
    const maxChanges = Math.max(1, ...sorted.map((item) => item.changes));

    return sorted.map((item) => ({
      intensity: item.changes / maxChanges,
      isBugfix: /(^|\b)(fix|bug|hotfix|patch)(\b|$)/i.test(item.message),
      date: item.date,
      changes: item.changes,
    }));
  }, [file.commits]);

  return (
    <Card
      sx={{
        position: 'absolute',
        top: isMobile ? 'auto' : 118,
        right: isMobile ? 8 : 20,
        left: isMobile ? 8 : 'auto',
        bottom: isMobile ? 8 : 'auto',
        width: isMobile ? 'auto' : 400,
        maxHeight: isMobile ? '48vh' : '70vh',
        overflow: 'auto',
        zIndex: 12,
        backgroundColor: 'rgba(255,255,255,0.94)',
        backdropFilter: 'blur(6px)',
      }}
      elevation={4}
    >
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6" sx={{ pr: 2 }}>
            File Details
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Typography variant="body2" color="text.secondary" mb={1}>
          {file.path}
        </Typography>

        <Stack direction="row" spacing={1} mb={1.5}>
          <Chip
            size="small"
            color={moodColorMap[mood]}
            variant="filled"
            label={moodLabelMap[mood]}
          />
          <Chip
            size="small"
            color={riskLabel === 'high' ? 'error' : riskLabel === 'medium' ? 'warning' : 'success'}
            variant="outlined"
            label={`Risk ${Math.round(risk * 100)}%`}
          />
        </Stack>

        <Stack direction="row" spacing={2} mb={1}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Commits
            </Typography>
            <Typography fontWeight={700}>{file.commits.length}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              + Additions
            </Typography>
            <Typography fontWeight={700}>{file.totalAdditions}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              - Deletions
            </Typography>
            <Typography fontWeight={700}>{file.totalDeletions}</Typography>
          </Box>
        </Stack>

        {latestCommit && (
          <Box mb={1.5}>
            <Typography variant="subtitle2">Latest commit</Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(latestCommit.date).toLocaleString()} • {latestCommit.author}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.4 }}>
              {latestCommit.message.split('\n')[0]}
            </Typography>
          </Box>
        )}

        {activityTimeline.length > 1 && (
          <Box mb={1.5}>
            <Typography variant="subtitle2">Activity timeline</Typography>
            <Stack direction="row" spacing={0.35} alignItems="flex-end" sx={{ height: 44, mt: 0.7 }}>
              {activityTimeline.map((point) => (
                <Box
                  key={`${point.date}-${point.changes}`}
                  title={`${new Date(point.date).toLocaleDateString()} • ${point.changes} changes`}
                  sx={{
                    width: 6,
                    borderRadius: '6px 6px 2px 2px',
                    height: 8 + point.intensity * 32,
                    backgroundColor: point.isBugfix ? '#ff7f96' : '#6ea8ff',
                    opacity: 0.68 + point.intensity * 0.3,
                  }}
                />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Recent commit intensity, red bars indicate bugfix-like commits.
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 1.5 }} />

        {riskProfile && (
          <Box mb={1.2}>
            <Typography variant="subtitle2">Risk profile</Typography>
            <Typography variant="caption" color="text.secondary">
              churn {Math.round(riskProfile.churn * 100)}% • bugfix{' '}
              {Math.round(riskProfile.bugfixRatio * 100)}% • low bus factor{' '}
              {Math.round(riskProfile.lowBusFactor * 100)}%
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              dominant author: {riskProfile.topAuthor} ({Math.round(riskProfile.topAuthorShare * 100)}%)
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="subtitle2" mb={1}>
          Authors
        </Typography>

        <Table size="small" aria-label="authors table">
          <TableHead>
            <TableRow>
              <TableCell>Author</TableCell>
              <TableCell align="right">Commits</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {authorStats.map(([author, commits]) => (
              <TableRow key={author}>
                <TableCell>{author}</TableCell>
                <TableCell align="right">{commits}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
