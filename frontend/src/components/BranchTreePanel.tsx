import {
  Box,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { BranchSignal } from '../types/repository';
import { stringToColor } from '../utils/color';

interface BranchTreePanelProps {
  branches: BranchSignal[];
  selectedBranch: string;
  branchOnlyMode: boolean;
  onSelectBranch: (value: string) => void;
  onToggleBranchOnly: (value: boolean) => void;
}

interface BranchNode {
  name: string;
  depth: number;
  commits: number;
}

function buildTree(branches: BranchSignal[]): BranchNode[] {
  const ordered = [...branches].sort((a, b) => b.commits - a.commits);

  return ordered.map((branch) => {
    const depth = Math.max(0, branch.name.split('/').length - 1);
    return {
      name: branch.name,
      depth: Math.min(3, depth),
      commits: branch.commits,
    };
  });
}

export function BranchTreePanel({
  branches,
  selectedBranch,
  branchOnlyMode,
  onSelectBranch,
  onToggleBranchOnly,
}: BranchTreePanelProps) {
  if (branches.length === 0) {
    return null;
  }

  const tree = buildTree(branches).slice(0, 24);

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'absolute',
        right: { xs: 8, md: 16 },
        top: { xs: 112, md: 116 },
        width: { xs: 230, md: 280 },
        maxHeight: { xs: '42%', md: '56%' },
        overflowY: 'auto',
        p: 1.2,
        zIndex: 4,
        backgroundColor: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(6px)',
        border: '1px solid rgba(120,150,190,0.22)',
      }}
    >
      <Stack spacing={0.9}>
        <Typography variant="subtitle2" fontWeight={800}>
          Branch Map
        </Typography>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={branchOnlyMode}
              onChange={(_, checked) => onToggleBranchOnly(checked)}
            />
          }
          label={
            <Typography variant="caption">Show only branch changes</Typography>
          }
          sx={{ m: 0 }}
        />

        <Stack direction="row" spacing={0.6} flexWrap="wrap">
          <Chip
            size="small"
            variant={selectedBranch === 'all' ? 'filled' : 'outlined'}
            color={selectedBranch === 'all' ? 'primary' : 'default'}
            label="All branches"
            onClick={() => onSelectBranch('all')}
          />
        </Stack>

        {tree.map((node) => (
          <Box
            key={node.name}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              pl: node.depth * 1.3,
              py: 0.25,
              borderLeft: node.depth > 0 ? '1px solid rgba(120,150,190,0.24)' : 'none',
            }}
          >
            <Stack direction="row" spacing={0.7} alignItems="center" sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  backgroundColor: stringToColor(node.name),
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  cursor: 'pointer',
                  color: selectedBranch === node.name ? 'primary.main' : 'text.primary',
                  fontWeight: selectedBranch === node.name ? 700 : 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 170,
                }}
                onClick={() => onSelectBranch(node.name)}
              >
                {node.name}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {node.commits}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
