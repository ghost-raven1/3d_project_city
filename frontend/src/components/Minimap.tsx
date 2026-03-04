import { useMemo } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { PositionedFileHistory } from '../types/repository';
import { stringToColor } from '../utils/color';

interface MinimapProps {
  files: PositionedFileHistory[];
  selectedPath: string | null;
  hoveredPath: string | null;
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
const PAD = 12;

export function Minimap({
  files,
  selectedPath,
  hoveredPath,
  onSelect,
}: MinimapProps) {
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
    const innerWidth = WIDTH - PAD * 2;
    const innerHeight = HEIGHT - PAD * 2;

    return files.map((file) => ({
      path: file.path,
      x: PAD + ((file.x - minX) / spanX) * innerWidth,
      y: PAD + ((file.z - minZ) / spanZ) * innerHeight,
      color: stringToColor(file.folder),
    }));
  }, [files]);

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

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'absolute',
        right: { xs: 8, md: 16 },
        bottom: { xs: 8, md: 16 },
        width: WIDTH,
        p: 1,
        backdropFilter: 'blur(8px)',
        backgroundColor: 'rgba(255,255,255,0.86)',
        border: '1px solid rgba(120,150,190,0.28)',
        zIndex: 4,
        display: { xs: 'none', md: 'block' },
      }}
    >
      <Typography variant="caption" fontWeight={700} color="text.secondary">
        Minimap
      </Typography>
      <Box sx={{ mt: 0.7, borderRadius: 1, overflow: 'hidden', border: '1px solid rgba(130,160,200,0.24)' }}>
        <svg
          width={WIDTH - 16}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{ display: 'block', background: 'linear-gradient(180deg, #f6fbff 0%, #eaf3ff 100%)', cursor: 'pointer' }}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const mouseX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
            const mouseY = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
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
                stroke={active ? '#153a73' : 'none'}
                strokeWidth={active ? 0.8 : 0}
                opacity={active ? 0.95 : 0.72}
              />
            );
          })}
        </svg>
      </Box>
    </Paper>
  );
}
