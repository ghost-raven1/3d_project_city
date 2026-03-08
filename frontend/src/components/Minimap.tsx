import {
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { PositionedFileHistory } from '../types/repository';
import { stringToColor } from '../utils/color';
import {
  panelEmptyStateSx,
  panelInsetSx,
  panelSurfaceSx,
  panelTitleSx,
} from './panelStyles';

interface MinimapProps {
  files: PositionedFileHistory[];
  selectedPath: string | null;
  hoveredPath: string | null;
  compact?: boolean;
  rightOffset?: number;
  onHeightChange?: (height: number) => void;
  onSelect: (path: string | null) => void;
}

interface MiniPoint {
  path: string;
  x: number;
  y: number;
  color: string;
}

const WIDTH = 236;
const HEIGHT = 184;
const COMPACT_WIDTH = 206;
const COMPACT_HEIGHT = 162;
const PAD = 12;

export function Minimap({
  files,
  selectedPath,
  hoveredPath,
  compact = false,
  rightOffset = 16,
  onHeightChange,
  onSelect,
}: MinimapProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef(0);
  const width = compact ? COMPACT_WIDTH : WIDTH;
  const height = compact ? COMPACT_HEIGHT : HEIGHT;
  const points = useMemo<MiniPoint[]>(() => {
    if (files.length === 0) {
      return [];
    }

    const minX = Math.min(...files.map((file) => file.x));
    const maxX = Math.max(...files.map((file) => file.x));
    const minZ = Math.min(...files.map((file) => file.z));
    const maxZ = Math.max(...files.map((file) => file.z));

    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const innerWidth = width - PAD * 2;
    const innerHeight = height - PAD * 2;

    return files.map((file) => ({
      path: file.path,
      x: PAD + ((file.x - minX) / spanX) * innerWidth,
      y: PAD + ((file.z - minZ) / spanZ) * innerHeight,
      color: stringToColor(file.folder),
    }));
  }, [files, height, width]);

  const nearest = (mouseX: number, mouseY: number): string | null => {
    let bestPath: string | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    points.forEach((point) => {
      const dx = mouseX - point.x;
      const dy = mouseY - point.y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestPath = point.path;
      }
    });

    if (bestDist > 10) {
      return null;
    }

    return bestPath;
  };

  useEffect(() => {
    if (!onHeightChange) {
      return;
    }

    const node = rootRef.current;
    if (!node) {
      return;
    }

    const emitHeight = () => {
      const next = Math.max(0, Math.ceil(node.getBoundingClientRect().height));
      if (Math.abs(next - lastHeightRef.current) < 1) {
        return;
      }
      lastHeightRef.current = next;
      onHeightChange(next);
    };

    emitHeight();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => emitHeight());
    observer?.observe(node);
    window.addEventListener('resize', emitHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', emitHeight);
    };
  }, [onHeightChange]);

  return (
    <Paper
      ref={rootRef}
      elevation={4}
      sx={{
        position: 'absolute',
        right: { xs: 8, md: rightOffset },
        bottom: { xs: 8, md: 16 },
        width,
        p: 1,
        zIndex: 16,
        display: { xs: 'none', md: 'block' },
        ...panelSurfaceSx,
      }}
    >
      <Typography
        variant="caption"
        fontWeight={700}
        sx={{ ...panelTitleSx, display: 'block', mb: 0.7 }}
      >
        Tactical Minimap
      </Typography>
      <Box
        sx={{
          ...panelInsetSx,
          borderRadius: 1,
          overflow: 'hidden',
          p: 0.3,
        }}
      >
        {points.length === 0 ? (
          <Box sx={{ ...panelEmptyStateSx, minHeight: 84 }}>
            <Typography variant="caption" color="text.secondary">
              Minimap unavailable: no mapped nodes in current view.
            </Typography>
          </Box>
        ) : (
          <svg
            width={width - 16}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{
              display: 'block',
              background:
                'radial-gradient(circle at 18% 20%, rgba(72,210,255,0.25), transparent 44%), radial-gradient(circle at 84% 78%, rgba(118,151,255,0.2), transparent 40%), linear-gradient(180deg, #031122 0%, #04182f 100%)',
              cursor: 'pointer',
            }}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const mouseX = ((event.clientX - bounds.left) / bounds.width) * width;
              const mouseY = ((event.clientY - bounds.top) / bounds.height) * height;
              onSelect(nearest(mouseX, mouseY));
            }}
          >
            {points.map((point) => {
              const active = point.path === selectedPath || point.path === hoveredPath;
              return (
                <circle
                  key={point.path}
                  cx={point.x}
                  cy={point.y}
                  r={active ? 2.9 : 1.8}
                  fill={point.color}
                  stroke={active ? '#a8f3ff' : 'none'}
                  strokeWidth={active ? 0.8 : 0}
                  opacity={active ? 0.98 : 0.8}
                />
              );
            })}
          </svg>
        )}
      </Box>
    </Paper>
  );
}
