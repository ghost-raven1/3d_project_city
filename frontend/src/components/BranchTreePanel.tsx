import {
  useEffect,
  useRef,
} from 'react';
import {
  Box,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import { BranchSignal } from '../types/repository';
import { stringToColor } from '../utils/color';
import {
  panelChipSx,
  panelInsetSx,
  panelCardHoverSx,
  panelEmptyStateSx,
  panelScrollSx,
  panelSurfaceSx,
  panelTitleSx,
} from './panelStyles';

interface BranchTreePanelProps {
  branches: BranchSignal[];
  selectedBranch: string;
  branchOnlyMode: boolean;
  topOffset?: number;
  desktopMaxHeight?: string;
  desktopBottomOffset?: number;
  compact?: boolean;
  onWidthChange?: (width: number) => void;
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
  topOffset = 116,
  desktopMaxHeight = '56vh',
  desktopBottomOffset = 208,
  compact = false,
  onWidthChange,
  onSelectBranch,
  onToggleBranchOnly,
}: BranchTreePanelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastWidthRef = useRef(0);
  const tree = buildTree(branches).slice(0, 24);
  const desktopComputedMaxHeight = `min(${compact ? '48vh' : desktopMaxHeight}, max(180px, calc(100vh - ${
    topOffset + desktopBottomOffset
  }px)))`;
  const mobileTopOffset = Math.max(96, Math.round(topOffset + 8));

  useEffect(() => {
    if (!onWidthChange) {
      return;
    }

    const node = rootRef.current;
    if (!node) {
      return;
    }

    const emitWidth = () => {
      const next = Math.max(0, Math.ceil(node.getBoundingClientRect().width));
      if (Math.abs(next - lastWidthRef.current) < 1) {
        return;
      }
      lastWidthRef.current = next;
      onWidthChange(next);
    };

    emitWidth();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => emitWidth());
    observer?.observe(node);
    window.addEventListener('resize', emitWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', emitWidth);
    };
  }, [onWidthChange]);

  return (
    <Paper
      ref={rootRef}
      elevation={4}
      sx={{
        position: 'absolute',
        right: { xs: 8, md: 16 },
        top: { xs: mobileTopOffset, md: topOffset },
        width: { xs: compact ? 214 : 230, md: compact ? 252 : 280 },
        maxHeight: {
          xs: compact ? '38%' : '42%',
          md: desktopComputedMaxHeight,
        },
        overflowY: 'auto',
        p: compact ? 1 : 1.2,
        zIndex: 16,
        ...panelSurfaceSx,
        ...panelScrollSx,
      }}
    >
      <Stack spacing={0.9}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={0.6} alignItems="center">
            <AccountTreeRoundedIcon fontSize="small" sx={{ color: '#90efff' }} />
            <Typography variant="subtitle2" fontWeight={800} sx={panelTitleSx}>
              Branch Matrix
            </Typography>
          </Stack>
          <Chip
            size="small"
            variant="outlined"
            label={`${tree.length} tracked`}
            sx={panelChipSx}
          />
        </Stack>
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
            sx={panelChipSx}
          />
        </Stack>

        {tree.length === 0 ? (
          <Box sx={panelEmptyStateSx}>
            <Typography variant="caption" color="text.secondary">
              No branch telemetry for current snapshot.
            </Typography>
          </Box>
        ) : (
          tree.map((node) => (
            <Box
              key={node.name}
              sx={{
                ...panelCardHoverSx,
                ...panelInsetSx,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                pr: 0.5,
                pl: node.depth * 1.3,
                py: 0.35,
                borderLeft: node.depth > 0 ? '1px solid rgba(120,150,190,0.24)' : panelInsetSx.border,
                transition: 'background-color 140ms ease, border-color 140ms ease',
                '&:hover': {
                  backgroundColor: 'rgba(21, 58, 90, 0.45)',
                  borderLeftColor: 'rgba(143, 226, 255, 0.48)',
                },
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
          ))
        )}
      </Stack>
    </Paper>
  );
}
