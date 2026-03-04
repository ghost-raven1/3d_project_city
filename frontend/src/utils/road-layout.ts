import { CityLayout } from './city-dna';

export interface RoadPoint2D {
  x: number;
  z: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function hashRoadSeed(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function sampleCubicRoad(
  start: RoadPoint2D,
  controlA: RoadPoint2D,
  controlB: RoadPoint2D,
  end: RoadPoint2D,
  steps: number,
): RoadPoint2D[] {
  const points: RoadPoint2D[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const mt = 1 - t;
    const x =
      mt * mt * mt * start.x +
      3 * mt * mt * t * controlA.x +
      3 * mt * t * t * controlB.x +
      t * t * t * end.x;
    const z =
      mt * mt * mt * start.z +
      3 * mt * mt * t * controlA.z +
      3 * mt * t * t * controlB.z +
      t * t * t * end.z;

    points.push({ x, z });
  }

  return points;
}

export function buildNaturalRoadPath(
  start: RoadPoint2D,
  end: RoadPoint2D,
  seed: number,
  layout: CityLayout,
  cityCenter: RoadPoint2D,
  curvature = 1,
): RoadPoint2D[] {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length < 1) {
    return [start, end];
  }

  const tangent = { x: dx / length, z: dz / length };
  const normal = { x: -tangent.z, z: tangent.x };
  const seedUnit = ((seed % 2000) / 1000) - 1;
  const phaseUnit = ((Math.floor(seed / 2048) % 2000) / 1000) - 1;

  const layoutCurve =
    layout === 'ribbon' ? 1.35 : layout === 'radial' ? 1.18 : layout === 'islands' ? 1.26 : 0.92;
  const bend = clamp(length * 0.12, 1.1, 8) * layoutCurve * clamp(curvature, 0.6, 2);
  const sway = bend * (0.45 + Math.abs(seedUnit) * 0.75) * (seedUnit >= 0 ? 1 : -1);
  const forwardA = clamp(length * 0.28, 1.4, 16);
  const forwardB = clamp(length * 0.23, 1.2, 14);

  const toCenterX = cityCenter.x - (start.x + end.x) * 0.5;
  const toCenterZ = cityCenter.z - (start.z + end.z) * 0.5;
  const centerPull = clamp(Math.hypot(toCenterX, toCenterZ) * 0.012, -2.5, 2.5);

  const controlA = {
    x: start.x + tangent.x * forwardA + normal.x * (sway + centerPull),
    z: start.z + tangent.z * forwardA + normal.z * (sway + centerPull),
  };

  const controlB = {
    x: end.x - tangent.x * forwardB + normal.x * (sway * 0.55 + phaseUnit * 2.4),
    z: end.z - tangent.z * forwardB + normal.z * (sway * 0.55 + phaseUnit * 2.4),
  };

  const steps = clamp(Math.round(length / 4.8), 4, 11);
  return sampleCubicRoad(start, controlA, controlB, end, steps);
}
