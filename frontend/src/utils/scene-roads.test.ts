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

  it('keeps fallback roads when imports are empty', () => {
    const files = [
      file('src/a.ts', -10, 0),
      file('src/b.ts', 0, 4),
      file('src/c.ts', 12, -3),
      file('src/d.ts', 20, 8),
    ];

    const segments = buildRoadSegments(files, [], null, {
      centerX: 5,
      centerZ: 2,
      size: 90,
    });

    expect(segments.length).toBeGreaterThan(0);
    expect(
      segments.some(
        (segment) => segment.id.startsWith('fallback-') || segment.tier === 'arterial',
      ),
    ).toBe(true);
  });

  it('does not collapse to zero on short import links', () => {
    const files = [
      file('src/a.ts', 0, 0),
      file('src/b.ts', 0.9, 0.2),
      file('src/c.ts', 2.1, 0.7),
    ];
    const imports: ImportRoad[] = [
      { from: 'src/a.ts', to: 'src/b.ts', count: 1 },
      { from: 'src/b.ts', to: 'src/c.ts', count: 1 },
    ];

    const segments = buildRoadSegments(files, imports, null, {
      centerX: 1,
      centerZ: 0.3,
      size: 40,
    });

    expect(segments.length).toBeGreaterThan(0);
  });

  it('keeps scaffold roads even when there are no files', () => {
    const segments = buildRoadSegments([], [], null, {
      centerX: 0,
      centerZ: 0,
      size: 70,
    });

    expect(segments.length).toBeGreaterThan(0);
    expect(segments.some((segment) => segment.id.startsWith('scaffold-'))).toBe(true);
  });

  it('supplements sparse roads with scaffold network', () => {
    const files = [file('src/a.ts', 0, 0), file('src/b.ts', 12, 0)];
    const imports: ImportRoad[] = [{ from: 'src/a.ts', to: 'src/b.ts', count: 1 }];

    const segments = buildRoadSegments(files, imports, null, {
      centerX: 6,
      centerZ: 0,
      size: 60,
    });

    expect(segments.length).toBeGreaterThanOrEqual(3);
    expect(segments.some((segment) => segment.id.startsWith('scaffold-'))).toBe(true);
  });
});
