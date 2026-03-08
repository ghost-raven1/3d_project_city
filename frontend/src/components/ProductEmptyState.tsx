import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  panelCardHoverSx,
  panelInsetSx,
  panelMetaTextSx,
  panelTitleSx,
} from './panelStyles';

interface ProductEmptyStateProps {
  onParseRepo: (repoUrl: string) => void;
}

const SAMPLE_REPOS = [
  'https://github.com/facebook/react',
  'https://github.com/vercel/next.js',
  'https://github.com/nestjs/nest',
];

const QUICK_SIGNAL_CHIPS = [
  'Realtime telemetry',
  'Narrated insights',
  'Architecture mapping',
  'Risk hotspots',
  'Shareable reports',
];

export function ProductEmptyState({ onParseRepo }: ProductEmptyStateProps) {
  return (
    <Box
      sx={{
        p: { xs: 1.2, md: 2.2 },
        height: '100%',
      }}
    >
      <Paper
        sx={{
          height: '100%',
          borderRadius: 3,
          border: `1px solid ${alpha('#7cc8ff', 0.5)}`,
          background:
            'radial-gradient(circle at 12% 16%, rgba(98,231,255,0.2), transparent 38%), radial-gradient(circle at 86% 24%, rgba(116,142,255,0.24), transparent 35%), linear-gradient(145deg, rgba(8,18,38,0.9), rgba(9,23,48,0.83) 55%, rgba(7,16,32,0.92))',
          boxShadow: `0 24px 56px ${alpha('#061229', 0.48)}`,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(115deg, rgba(150,236,255,0.08), transparent 28%, transparent 72%, rgba(118,146,255,0.1))',
            opacity: 0.85,
          },
        }}
      >
        <Stack
          spacing={2}
          sx={{
            width: 'min(980px, 92vw)',
            color: '#e8f4ff',
            px: { xs: 1.2, md: 2.4 },
            py: { xs: 1.8, md: 2.8 },
          }}
        >
          <Stack spacing={0.7}>
            <Typography
              sx={{
                fontFamily: '"Orbitron", "Space Grotesk", sans-serif',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: panelTitleSx.color,
                fontSize: { xs: 12, md: 13 },
              }}
            >
              Repo City Platform
            </Typography>
            <Typography
              sx={{
                fontFamily: '"Orbitron", "Space Grotesk", sans-serif',
                fontWeight: 800,
                letterSpacing: '0.02em',
                lineHeight: 1.07,
                fontSize: { xs: 28, md: 44 },
              }}
            >
              Digital twin of your repository, not just a demo scene.
            </Typography>
            <Typography
              sx={{
                color: alpha('#d2e5ff', 0.9),
                maxWidth: 740,
                fontSize: { xs: 13, md: 16 },
              }}
            >
              Build a living 3D city from commit history, architecture dependencies, risk hotspots,
              collaboration streams and narrator stories.
            </Typography>
          </Stack>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            alignItems={{ xs: 'stretch', md: 'center' }}
          >
            <Button
              startIcon={<RocketLaunchRoundedIcon />}
              variant="contained"
              onClick={() => onParseRepo(SAMPLE_REPOS[0] ?? 'https://github.com/facebook/react')}
              sx={{
                px: 2.2,
                py: 1.1,
                borderRadius: 2,
                fontWeight: 700,
                boxShadow: `0 8px 26px ${alpha('#53d5ff', 0.42)}`,
                background:
                  'linear-gradient(95deg, #35cbff 0%, #57e4ff 40%, #6d7dff 100%)',
                color: '#062031',
                '&:hover': {
                  background:
                    'linear-gradient(95deg, #2cb8f8 0%, #46d7ff 40%, #6576f8 100%)',
                },
              }}
            >
              Launch Demo City
            </Button>
            <Typography variant="caption" sx={panelMetaTextSx}>
              Or use one of sample repositories:
            </Typography>
            <Stack direction="row" spacing={0.7} flexWrap="wrap">
              {SAMPLE_REPOS.map((repo) => (
                <Button
                  key={repo}
                  size="small"
                  variant="outlined"
                  onClick={() => onParseRepo(repo)}
                  sx={{
                    borderColor: alpha('#84d9ff', 0.6),
                    color: '#d4ecff',
                    textTransform: 'none',
                    fontWeight: 600,
                    '&:hover': {
                      borderColor: alpha('#a8e3ff', 0.88),
                      backgroundColor: alpha('#89d8ff', 0.08),
                    },
                  }}
                >
                  {repo.split('/').slice(-2).join('/')}
                </Button>
              ))}
            </Stack>
          </Stack>

          <Stack direction="row" spacing={0.7} flexWrap="wrap">
            {QUICK_SIGNAL_CHIPS.map((chip) => (
              <Chip
                key={chip}
                size="small"
                label={chip}
                variant="outlined"
                sx={{
                  borderColor: alpha('#87ddff', 0.5),
                  color: '#d5edff',
                  backgroundColor: alpha('#08203d', 0.42),
                  '& .MuiChip-label': {
                    letterSpacing: '0.03em',
                  },
                }}
              />
            ))}
          </Stack>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            sx={{ mt: 0.8 }}
          >
            {[
              {
                icon: <VisibilityRoundedIcon fontSize="small" />,
                title: 'Architecture Lens',
                text: 'Modules, dependency highways and layered constraints in one glance.',
              },
              {
                icon: <TimelineRoundedIcon fontSize="small" />,
                title: 'Time Travel',
                text: 'Replay repository evolution across timeline snapshots and release waves.',
              },
              {
                icon: <AutoAwesomeRoundedIcon fontSize="small" />,
                title: 'Live Narrative',
                text: 'Neural narrator comments on scene interactions, events and team activity.',
              },
            ].map((card) => (
              <Paper
                key={card.title}
                variant="outlined"
                sx={{
                  ...panelCardHoverSx,
                  ...panelInsetSx,
                  flex: 1,
                  p: 1.25,
                  borderRadius: 2,
                  borderColor: alpha('#8bd7ff', 0.42),
                  backgroundColor: alpha('#061429', 0.4),
                }}
              >
                <Stack spacing={0.55}>
                  <Stack direction="row" spacing={0.7} alignItems="center">
                    <Box sx={{ color: '#8ce6ff', display: 'grid', placeItems: 'center' }}>
                      {card.icon}
                    </Box>
                    <Typography
                      sx={{
                        fontFamily: '"Orbitron", "Space Grotesk", sans-serif',
                        fontWeight: 700,
                        letterSpacing: '0.03em',
                        color: '#e4f2ff',
                        fontSize: 13,
                      }}
                    >
                      {card.title}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" sx={panelMetaTextSx}>
                    {card.text}
                  </Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
