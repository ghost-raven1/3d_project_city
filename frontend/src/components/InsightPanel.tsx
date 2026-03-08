import {
  Box,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import { RepositoryAnalysis } from '../types/repository';
import { RepositoryInsights } from '../utils/insights';
import { stringToColor } from '../utils/color';
import {
  panelChipSx,
  panelEmptyStateSx,
  panelMetaTextSx,
  panelScrollSx,
  panelSurfaceSx,
  panelTitleSx,
} from './panelStyles';

interface InsightPanelProps {
  insights: RepositoryInsights;
  analysis?: RepositoryAnalysis | null;
  topOffset?: number;
  desktopBottomOffset?: number;
  compact?: boolean;
}

export function InsightPanel({
  insights,
  analysis,
  topOffset = 116,
  desktopBottomOffset = 136,
  compact = false,
}: InsightPanelProps) {
  const shortenPath = (value: string): string => {
    if (value.length <= 34) {
      return value;
    }

    return `…${value.slice(-33)}`;
  };

  const from = new Date(insights.fromDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const to = new Date(insights.toDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const desktopMaxHeight = `max(188px, calc(100vh - ${
    topOffset + desktopBottomOffset
  }px))`;
  const mobileTopOffset = Math.max(82, Math.round(topOffset));

  return (
    <Paper
      elevation={5}
      sx={{
        position: 'absolute',
        left: { xs: 8, md: 16 },
        top: { xs: mobileTopOffset, md: topOffset },
        width: { xs: 'calc(100% - 16px)', sm: compact ? 332 : 360 },
        maxHeight: {
          xs: compact ? '36%' : '40%',
          md: desktopMaxHeight,
        },
        overflowY: 'auto',
        p: compact ? 1.1 : 1.4,
        zIndex: 16,
        ...panelSurfaceSx,
        ...panelScrollSx,
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={0.6} alignItems="center">
            <InsightsRoundedIcon fontSize="small" sx={{ color: '#8ef1ff' }} />
            <Typography variant="subtitle2" fontWeight={800} sx={panelTitleSx}>
              City Telemetry
            </Typography>
          </Stack>
          <Chip
            size="small"
            variant="outlined"
            label={`Graph ${Math.round(insights.graph.density * 100)}%`}
            sx={panelChipSx}
          />
        </Stack>

        <Stack direction="row" spacing={0.8} flexWrap="wrap">
          <Chip size="small" label={`Files: ${insights.totalFiles}`} sx={panelChipSx} />
          <Chip size="small" label={`Commits: ${insights.totalCommits}`} sx={panelChipSx} />
          <Chip size="small" label={`Age: ${insights.ageDays}d`} sx={panelChipSx} />
        </Stack>

        <Typography variant="caption" sx={panelMetaTextSx}>
          History: {from} - {to}
        </Typography>

        <Divider />

        <Typography variant="caption" fontWeight={700} sx={panelTitleSx}>
          Stack (by file distribution)
        </Typography>
        <Stack spacing={0.5}>
          {insights.languages.map((language) => (
            <Box key={language.name}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption">{language.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {Math.round(language.share * 100)}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.round(language.share * 100)}
                sx={{
                  height: 5,
                  borderRadius: 8,
                  backgroundColor: 'rgba(88, 121, 168, 0.24)',
                  '& .MuiLinearProgress-bar': {
                    background:
                      'linear-gradient(90deg, rgba(68,231,255,0.95), rgba(132,250,255,0.92), rgba(115,140,255,0.9))',
                  },
                }}
              />
            </Box>
          ))}
        </Stack>

        {insights.frameworks.length > 0 && (
          <>
            <Typography variant="caption" fontWeight={700} sx={panelTitleSx}>
              Framework Hints
            </Typography>
            <Stack direction="row" spacing={0.6} flexWrap="wrap">
              {insights.frameworks.map((framework) => (
                <Chip
                  key={framework}
                  size="small"
                  label={framework}
                  variant="outlined"
                  color="primary"
                  sx={panelChipSx}
                />
              ))}
            </Stack>
          </>
        )}

        {(insights.stack.runtimes.length > 0 ||
          insights.stack.infrastructure.length > 0 ||
          insights.stack.databases.length > 0 ||
          insights.stack.ci.length > 0) && (
          <>
            <Divider />
            <Typography variant="caption" fontWeight={700} sx={panelTitleSx}>
              Stack Passport
            </Typography>

            {insights.stack.runtimes.length > 0 && (
              <Stack direction="row" spacing={0.6} flexWrap="wrap">
                {insights.stack.runtimes.slice(0, 4).map((item) => (
                  <Chip
                    key={`runtime-${item}`}
                    size="small"
                    label={item}
                    variant="outlined"
                    color="info"
                    sx={panelChipSx}
                  />
                ))}
              </Stack>
            )}

            {insights.stack.infrastructure.length > 0 && (
              <Stack direction="row" spacing={0.6} flexWrap="wrap">
                {insights.stack.infrastructure.slice(0, 4).map((item) => (
                  <Chip
                    key={`infra-${item}`}
                    size="small"
                    label={item}
                    variant="outlined"
                    color="secondary"
                    sx={panelChipSx}
                  />
                ))}
              </Stack>
            )}

            {insights.stack.databases.length > 0 && (
              <Stack direction="row" spacing={0.6} flexWrap="wrap">
                {insights.stack.databases.slice(0, 4).map((item) => (
                  <Chip
                    key={`db-${item}`}
                    size="small"
                    label={item}
                    variant="outlined"
                    color="warning"
                    sx={panelChipSx}
                  />
                ))}
              </Stack>
            )}

            {insights.stack.ci.length > 0 && (
              <Stack direction="row" spacing={0.6} flexWrap="wrap">
                {insights.stack.ci.slice(0, 3).map((item) => (
                  <Chip
                    key={`ci-${item}`}
                    size="small"
                    label={item}
                    variant="outlined"
                    color="success"
                    sx={panelChipSx}
                  />
                ))}
              </Stack>
            )}
          </>
        )}

        {insights.branches.length > 0 && (
          <>
            <Divider />
            <Typography variant="caption" fontWeight={700} sx={panelTitleSx}>
              Branch Pulse (merge signals)
            </Typography>
            <Stack spacing={0.35}>
              {insights.branches.slice(0, 5).map((branch) => (
                <Stack
                  key={branch.name}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Stack direction="row" spacing={0.7} alignItems="center">
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: stringToColor(branch.name),
                        border: '1px solid rgba(0,0,0,0.15)',
                      }}
                    />
                    <Typography variant="caption">{branch.name}</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {branch.commits}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </>
        )}

        <Divider />
        {analysis && (
          <>
            <Typography variant="caption" fontWeight={700} sx={panelTitleSx}>
              Data Quality
            </Typography>
            <Stack direction="row" spacing={0.6} flexWrap="wrap">
              <Chip
                size="small"
                label={
                  analysis.commitHistory.truncated
                    ? `History: truncated`
                    : 'History: full'
                }
                color={analysis.commitHistory.truncated ? 'warning' : 'success'}
                variant="outlined"
                sx={panelChipSx}
              />
              <Chip
                size="small"
                label={analysis.imports.truncated ? 'Imports: truncated' : 'Imports: full'}
                color={analysis.imports.truncated ? 'warning' : 'success'}
                variant="outlined"
                sx={panelChipSx}
              />
              <Chip
                size="small"
                label={analysis.stack.truncated ? 'Stack: truncated' : 'Stack: full'}
                color={analysis.stack.truncated ? 'warning' : 'success'}
                variant="outlined"
                sx={panelChipSx}
              />
              <Chip
                size="small"
                label={`GitHub requests: ${analysis.diagnostics.githubRequests}`}
                variant="outlined"
                sx={panelChipSx}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Stages (ms): {Object.entries(analysis.diagnostics.stageMs)
                .map(([stage, ms]) => `${stage}=${ms}`)
                .join(', ')}
            </Typography>
            <Divider />
          </>
        )}

        <Typography variant="caption" fontWeight={700} sx={panelTitleSx}>
          Graph Intelligence
        </Typography>
        <Stack direction="row" spacing={0.6} flexWrap="wrap">
          <Chip size="small" label={`Hubs: ${insights.graph.hubs.length}`} variant="outlined" sx={panelChipSx} />
          <Chip size="small" label={`Cycles: ${insights.graph.cycleCount}`} variant="outlined" sx={panelChipSx} />
          <Chip
            size="small"
            label={`Layer violations: ${insights.graph.layerViolationCount}`}
            variant="outlined"
            sx={panelChipSx}
          />
          <Chip
            size="small"
            label={`Graph density: ${Math.round(insights.graph.density * 100)}%`}
            variant="outlined"
            sx={panelChipSx}
          />
        </Stack>
        {insights.graph.hubs.length === 0 && (
          <Box sx={panelEmptyStateSx}>
            <Typography variant="caption" color="text.secondary">
              No dominant hubs detected for this snapshot.
            </Typography>
          </Box>
        )}
        {insights.graph.hubs.length > 0 && (
          <Stack spacing={0.35}>
            {insights.graph.hubs.slice(0, 4).map((hub) => (
              <Stack
                key={hub.path}
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography variant="caption">{shortenPath(hub.path)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  hub {Math.round(hub.score)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
        {insights.graph.forbiddenEdges.length > 0 && (
          <Stack spacing={0.35}>
            <Typography variant="caption" color="text.secondary">
              Forbidden imports (top)
            </Typography>
            {insights.graph.forbiddenEdges.slice(0, 3).map((edge) => (
              <Typography key={`${edge.from}-${edge.to}`} variant="caption" color="text.secondary">
                {shortenPath(edge.from)}
                {' -> '}
                {shortenPath(edge.to)} ({edge.count})
              </Typography>
            ))}
          </Stack>
        )}
        {insights.graph.cycleEdges.length > 0 && (
          <Stack spacing={0.35}>
            <Typography variant="caption" color="text.secondary">
              Cycle edges (top)
            </Typography>
            {insights.graph.cycleEdges.slice(0, 3).map((edge) => (
              <Typography key={`${edge.from}-${edge.to}`} variant="caption" color="text.secondary">
                {shortenPath(edge.from)}
                {' -> '}
                {shortenPath(edge.to)} ({edge.count})
              </Typography>
            ))}
          </Stack>
        )}

        <Divider />

        <Typography variant="caption" fontWeight={700} sx={panelTitleSx}>
          Top Authors (color = floors)
        </Typography>
        <Stack spacing={0.35}>
          {insights.authors.slice(0, 5).map((author) => (
            <Stack
              key={author.name}
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Stack direction="row" spacing={0.7} alignItems="center">
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: stringToColor(author.name),
                    border: '1px solid rgba(0,0,0,0.15)',
                  }}
                />
                <Typography variant="caption">{author.name}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {author.commits}
              </Typography>
            </Stack>
          ))}
        </Stack>

        <Divider />

        <Typography variant="caption" fontWeight={700} sx={panelTitleSx}>
          Visual Legend
        </Typography>
        <Typography variant="caption" color="text.secondary">
          `Highway` roads = strong dependencies, `Arterial` = medium, `Local` = weak.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          District label shows folder archetype; holograms mark hotspot files.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Risk aura: green (low), orange (medium), red (high tech debt hotspot).
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Branch map + filter show scoped branch changes.
        </Typography>
      </Stack>
    </Paper>
  );
}
