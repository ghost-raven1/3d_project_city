import { describe, expect, it } from 'vitest';
import { buildRoadSegments } from './scene-roads';
import { ImportRoad, PositionedFileHistory } from '../types/repository';

function file(path: string, x: number, z: number): PositionedFileHistory {
  return {
    path,
    folder: path.split('/').slice(0, -1).join('/') || 'root',
    commits: [],
    totalChanges: 0,
    totalAdditions: 0,
    totalDeletions: 0,
    x,
    z,
    width: 2,
    depth: 2,
  };
}

describe('scene roads', () => {
  it('builds readable road segments from dense imports', () => {
    const files = [
      file('src/a.ts', 0, 0),
      file('src/b.ts', 12, 0),
      file('src/c.ts', 24, 0),
    ];
    const imports: ImportRoad[] = [
      { from: 'src/a.ts', to: 'src/b.ts', count: 2 },
      { from: 'src/a.ts', to: 'src/b.ts', count: 3 },
      { from: 'src/a.ts', to: 'src/c.ts', count: 1 },
      { from: 'src/b.ts', to: 'src/c.ts', count: 4 },
    ];

    const segments = buildRoadSegments(files, imports, null, {
      centerX: 12,
      centerZ: 0,
      size: 80,
    });

    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((segment) => segment.points.length >= 2)).toBe(true);
  });
});

