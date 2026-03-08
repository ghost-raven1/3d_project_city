import { describe, expect, it } from 'vitest';
import { BuildingFootprint, CityBounds } from './types';
import {
  advanceCoasterRide,
  buildCoasterTrack,
  CoasterTrackLayout,
  DEFAULT_COASTER_PHYSICS,
  resolveCoasterDriveProfileTuning,
  sampleCoasterTrack,
  wrapCoasterDistance,
} from './roller-coaster';

const cityBounds: CityBounds = {
  centerX: 0,
  centerZ: 0,
  size: 120,
};

function footprint(
  path: string,
  x: number,
  z: number,
  topY: number,
  width = 4,
  depth = 4,
): BuildingFootprint {
  return {
    path,
    x,
    z,
    topY,
    width,
    depth,
  };
}

describe('roller coaster track', () => {
  it('builds a closed track with supports mapped to buildings', () => {
    const footprints: BuildingFootprint[] = [
      footprint('src/a.ts', -30, -24, 9.5),
      footprint('src/b.ts', -8, -34, 12.2),
      footprint('src/c.ts', 28, -22, 10.6),
      footprint('src/d.ts', 36, 4, 13.1),
      footprint('src/e.ts', 18, 28, 11.8),
      footprint('src/f.ts', -6, 34, 9.1),
      footprint('src/g.ts', -34, 18, 12.7),
      footprint('src/h.ts', -20, -2, 8.8),
    ];

    const track = buildCoasterTrack(footprints, cityBounds, 42);

    expect(track.points.length).toBeGreaterThan(200);
    expect(track.supports.length).toBeGreaterThanOrEqual(6);
    expect(track.totalLength).toBeGreaterThan(180);
    expect(track.supports.some((support) => support.path === 'src/d.ts')).toBe(true);
    expect(track.supports.every((support) => support.railY > support.baseY)).toBe(true);
  });

  it('stays finite with partially invalid building footprints', () => {
    const invalidFootprints: BuildingFootprint[] = [
      footprint('src/a.ts', -24, -20, 9.5),
      footprint('src/b.ts', 18, -18, 11.1),
      {
        path: 'src/invalid.ts',
        x: Number.NaN,
        z: 12,
        topY: Number.NaN,
        width: Number.NaN,
        depth: -8,
      },
      {
        path: 'src/invalid-2.ts',
        x: 14,
        z: Number.NaN,
        topY: Number.POSITIVE_INFINITY,
        width: 0,
        depth: Number.NaN,
      },
      footprint('src/c.ts', 22, 20, 8.7),
      footprint('src/d.ts', -18, 22, 9.3),
    ];

    const track = buildCoasterTrack(
      invalidFootprints,
      { centerX: Number.NaN, centerZ: Number.NaN, size: Number.NaN },
      Number.NaN,
    );

    expect(track.points.length).toBeGreaterThan(150);
    expect(Number.isFinite(track.totalLength)).toBe(true);
    expect(track.totalLength).toBeGreaterThan(150);
    expect(
      track.points.every(
        (point) =>
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          Number.isFinite(point.z) &&
          Number.isFinite(point.tangentX) &&
          Number.isFinite(point.tangentY) &&
          Number.isFinite(point.tangentZ),
      ),
    ).toBe(true);
  });

  it('samples track points with wrapped distance', () => {
    const footprints: BuildingFootprint[] = [
      footprint('src/a.ts', -20, -20, 7.5),
      footprint('src/b.ts', 22, -18, 8.1),
      footprint('src/c.ts', 24, 22, 8.9),
      footprint('src/d.ts', -18, 24, 7.9),
      footprint('src/e.ts', 0, 0, 9.2),
      footprint('src/f.ts', -2, -28, 8.4),
    ];
    const track = buildCoasterTrack(footprints, cityBounds, 9);

    const first = sampleCoasterTrack(track, 0);
    const wrapped = sampleCoasterTrack(track, track.totalLength * 2 + 0.00001);

    expect(first).not.toBeNull();
    expect(wrapped).not.toBeNull();
    expect(Math.hypot((first?.x ?? 0) - (wrapped?.x ?? 0), (first?.z ?? 0) - (wrapped?.z ?? 0))).toBeLessThan(0.4);
    expect(wrapCoasterDistance(track, track.totalLength + 3.5)).toBeCloseTo(3.5, 4);
  });

  it('applies emergency braking when clearance drops below safety threshold', () => {
    const track: CoasterTrackLayout = {
      points: [
        {
          x: 0,
          y: 6,
          z: 0,
          tangentX: 1,
          tangentY: 0,
          tangentZ: 0,
          curvature: 1.35,
          slope: 0,
          clearance: DEFAULT_COASTER_PHYSICS.safetyClearance * 0.22,
          distance: 0,
          segmentLength: 10,
        },
        {
          x: 10,
          y: 6,
          z: 0,
          tangentX: 1,
          tangentY: 0,
          tangentZ: 0,
          curvature: 1.15,
          slope: 0,
          clearance: DEFAULT_COASTER_PHYSICS.safetyClearance * 0.25,
          distance: 10,
          segmentLength: 10,
        },
      ],
      supports: [],
      totalLength: 20,
      minClearance: DEFAULT_COASTER_PHYSICS.safetyClearance * 0.22,
      maxHeight: 6,
    };
    const forced = {
      distance: 0.1,
      speed: 18,
      acceleration: 0,
      gForce: 1,
      lap: 0,
      emergencyBrake: false,
    };

    const next = advanceCoasterRide(track, forced, 0.08, DEFAULT_COASTER_PHYSICS);

    expect(next.emergencyBrake).toBe(true);
    expect(next.speed).toBeLessThan(forced.speed);
    expect(next.distance).not.toBe(forced.distance);
  });

  it('changes speed strongly on downhill vs uphill slopes', () => {
    const basePoint = {
      x: 0,
      y: 8,
      z: 0,
      tangentX: 1,
      tangentZ: 0,
      curvature: 0.03,
      clearance: 99,
      distance: 0,
      segmentLength: 12,
    };

    const downhillTrack: CoasterTrackLayout = {
      points: [
        {
          ...basePoint,
          tangentY: -0.34,
          slope: -0.34,
        },
        {
          ...basePoint,
          x: 12,
          y: 4.8,
          tangentY: -0.3,
          slope: -0.3,
          distance: 12,
        },
      ],
      supports: [],
      totalLength: 24,
      minClearance: 8,
      maxHeight: 8,
    };

    const uphillTrack: CoasterTrackLayout = {
      points: [
        {
          ...basePoint,
          tangentY: 0.34,
          slope: 0.34,
        },
        {
          ...basePoint,
          x: 12,
          y: 11.2,
          tangentY: 0.3,
          slope: 0.3,
          distance: 12,
        },
      ],
      supports: [],
      totalLength: 24,
      minClearance: 8,
      maxHeight: 11.2,
    };

    const initial = {
      distance: 0.1,
      speed: 11,
      acceleration: 0,
      gForce: 1,
      lap: 0,
      emergencyBrake: false,
    };

    const downhillNext = advanceCoasterRide(downhillTrack, initial, 0.1);
    const uphillNext = advanceCoasterRide(uphillTrack, initial, 0.1);

    expect(downhillNext.speed).toBeGreaterThan(uphillNext.speed);
    expect(downhillNext.acceleration).toBeGreaterThan(uphillNext.acceleration);
    expect(downhillNext.speed - uphillNext.speed).toBeGreaterThan(0.6);
  });

  it('applies manual throttle for boost and brake control', () => {
    const flatTrack: CoasterTrackLayout = {
      points: [
        {
          x: 0,
          y: 8,
          z: 0,
          tangentX: 1,
          tangentY: 0,
          tangentZ: 0,
          curvature: 0.04,
          slope: 0,
          clearance: 8,
          distance: 0,
          segmentLength: 12,
        },
        {
          x: 12,
          y: 8,
          z: 0,
          tangentX: 1,
          tangentY: 0,
          tangentZ: 0,
          curvature: 0.04,
          slope: 0,
          clearance: 8,
          distance: 12,
          segmentLength: 12,
        },
      ],
      supports: [],
      totalLength: 24,
      minClearance: 8,
      maxHeight: 8,
    };

    const initial = {
      distance: 0.1,
      speed: 10,
      acceleration: 0,
      gForce: 1,
      lap: 0,
      emergencyBrake: false,
    };

    const neutral = advanceCoasterRide(flatTrack, initial, 0.1, DEFAULT_COASTER_PHYSICS, {
      throttle: 0,
    });
    const boosted = advanceCoasterRide(flatTrack, initial, 0.1, DEFAULT_COASTER_PHYSICS, {
      throttle: 1,
    });
    const braked = advanceCoasterRide(flatTrack, initial, 0.1, DEFAULT_COASTER_PHYSICS, {
      throttle: -1,
    });

    expect(boosted.speed).toBeGreaterThan(neutral.speed);
    expect(boosted.acceleration).toBeGreaterThan(neutral.acceleration);
    expect(braked.speed).toBeLessThan(neutral.speed);
    expect(braked.acceleration).toBeLessThan(neutral.acceleration);
  });

  it('provides coherent drive profile tuning progression', () => {
    const comfort = resolveCoasterDriveProfileTuning('comfort');
    const sport = resolveCoasterDriveProfileTuning('sport');
    const extreme = resolveCoasterDriveProfileTuning('extreme');

    expect(comfort.speed).toBeLessThan(sport.speed);
    expect(extreme.speed).toBeGreaterThan(sport.speed);
    expect(comfort.downhill).toBeLessThan(sport.downhill);
    expect(extreme.downhill).toBeGreaterThan(sport.downhill);
    expect(comfort.boost).toBeLessThan(sport.boost);
    expect(extreme.boost).toBeGreaterThan(sport.boost);
    expect(comfort.brake).toBeGreaterThan(sport.brake);
    expect(extreme.brake).toBeLessThan(sport.brake);
  });
});
