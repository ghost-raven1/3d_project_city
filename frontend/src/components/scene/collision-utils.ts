import { BuildingFootprint, CityBounds } from './types';

export interface MutableXZPoint {
  x: number;
  z: number;
}

function signOr(value: number, fallback: number): number {
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return fallback >= 0 ? 1 : -1;
}

export function clampPointToCityBounds(
  point: MutableXZPoint,
  bounds: CityBounds,
  padding = 0.3,
): void {
  const halfSize = Math.max(1, bounds.size * 0.5 - padding);
  point.x = Math.max(bounds.centerX - halfSize, Math.min(bounds.centerX + halfSize, point.x));
  point.z = Math.max(bounds.centerZ - halfSize, Math.min(bounds.centerZ + halfSize, point.z));
}

export function isInsideFootprint(
  x: number,
  z: number,
  footprint: BuildingFootprint,
  margin = 0,
): boolean {
  return (
    x >= footprint.x - footprint.width * 0.5 - margin &&
    x <= footprint.x + footprint.width * 0.5 + margin &&
    z >= footprint.z - footprint.depth * 0.5 - margin &&
    z <= footprint.z + footprint.depth * 0.5 + margin
  );
}

export function pushPointOutOfFootprints(
  point: MutableXZPoint,
  footprints: BuildingFootprint[],
  margin = 0.28,
): void {
  for (let index = 0; index < footprints.length; index += 1) {
    const footprint = footprints[index];
    if (!footprint || !isInsideFootprint(point.x, point.z, footprint, margin)) {
      continue;
    }

    const halfX = footprint.width * 0.5 + margin;
    const halfZ = footprint.depth * 0.5 + margin;
    const dx = point.x - footprint.x;
    const dz = point.z - footprint.z;
    const penX = halfX - Math.abs(dx);
    const penZ = halfZ - Math.abs(dz);

    if (penX < penZ) {
      point.x += signOr(dx, index % 2 === 0 ? 1 : -1) * (penX + 0.01);
    } else {
      point.z += signOr(dz, index % 2 === 0 ? -1 : 1) * (penZ + 0.01);
    }
  }
}

export function ensureAltitudeOverFootprints(
  x: number,
  z: number,
  currentY: number,
  footprints: BuildingFootprint[],
  margin = 0.18,
  clearance = 1.1,
): number {
  let y = currentY;
  for (let index = 0; index < footprints.length; index += 1) {
    const footprint = footprints[index];
    if (!footprint || !isInsideFootprint(x, z, footprint, margin)) {
      continue;
    }
    y = Math.max(y, footprint.topY + clearance);
  }
  return y;
}

export function resolvePairwiseRepulsion(
  points: MutableXZPoint[],
  minDistance: number,
  strength = 0.55,
): void {
  if (points.length < 2 || minDistance <= 0) {
    return;
  }

  const targetSq = minDistance * minDistance;
  for (let i = 0; i < points.length; i += 1) {
    const pointA = points[i];
    if (!pointA) {
      continue;
    }
    for (let j = i + 1; j < points.length; j += 1) {
      const pointB = points[j];
      if (!pointB) {
        continue;
      }

      const dx = pointB.x - pointA.x;
      const dz = pointB.z - pointA.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= targetSq) {
        continue;
      }

      const dist = Math.sqrt(Math.max(0.000001, distSq));
      const overlap = (minDistance - dist) * 0.5 * strength;
      const nx = dx / dist;
      const nz = dz / dist;
      pointA.x -= nx * overlap;
      pointA.z -= nz * overlap;
      pointB.x += nx * overlap;
      pointB.z += nz * overlap;
    }
  }
}
