import { CatmullRomCurve3, Vector3 } from 'three';
import { BuildingFootprint, CityBounds, CoasterDriveProfile } from './types';

const TRACK_CLEARANCE = 1.7;
const SUPPORT_CLEARANCE = 2.35;
const TRACK_SAMPLE_FLOOR = 220;
const MIN_FOOTPRINT_SIZE = 0.45;
const MAX_FOOTPRINT_SIZE = 420;
const MIN_CITY_SIZE = 80;
const MAX_CITY_SIZE = 1800;

const forwardVector = new Vector3(1, 0, 0);

interface SupportCandidate {
  path: string;
  x: number;
  z: number;
  topY: number;
  score: number;
}

export interface CoasterSupport {
  path: string;
  x: number;
  z: number;
  baseY: number;
  railY: number;
  sampleIndex: number;
}

export interface CoasterTrackPoint {
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentY: number;
  tangentZ: number;
  curvature: number;
  slope: number;
  clearance: number;
  distance: number;
  segmentLength: number;
}

export interface CoasterTrackLayout {
  points: CoasterTrackPoint[];
  supports: CoasterSupport[];
  totalLength: number;
  minClearance: number;
  maxHeight: number;
}

export interface CoasterTrackSample {
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentY: number;
  tangentZ: number;
  curvature: number;
  slope: number;
  clearance: number;
}

export interface CoasterRideState {
  distance: number;
  speed: number;
  acceleration: number;
  gForce: number;
  lap: number;
  emergencyBrake: boolean;
}

export interface CoasterPhysicsConfig {
  cruiseSpeed: number;
  stationSpeed: number;
  minSpeed: number;
  maxSpeed: number;
  gravity: number;
  gravityScale: number;
  driveGain: number;
  dragCoefficient: number;
  rollingFriction: number;
  curveBrakeStrength: number;
  maxLateralAccel: number;
  safetyClearance: number;
  clearanceBrakeStrength: number;
  stationBrakeDistance: number;
  stationBrakeStrength: number;
  slopeDriveSuppression: number;
  slopeLookaheadGain: number;
  downhillRushGain: number;
  uphillResistance: number;
  maxAcceleration: number;
  maxBraking: number;
  manualBoostForce: number;
  manualBrakeForce: number;
  manualTopSpeedBoost: number;
}

export interface CoasterRideInput {
  throttle: number;
}

export interface CoasterDriveProfileTuning {
  speed: number;
  gravity: number;
  slopeSuppression: number;
  lookahead: number;
  downhill: number;
  uphill: number;
  lateral: number;
  boost: number;
  brake: number;
  topBoost: number;
  cameraEnergy: number;
}

const COASTER_DRIVE_PROFILE_TUNING: Record<
  CoasterDriveProfile,
  CoasterDriveProfileTuning
> = {
  comfort: {
    speed: 0.88,
    gravity: 0.86,
    slopeSuppression: 0.78,
    lookahead: 0.76,
    downhill: 0.74,
    uphill: 0.88,
    lateral: 0.84,
    boost: 0.82,
    brake: 1.18,
    topBoost: 0.74,
    cameraEnergy: 0.82,
  },
  sport: {
    speed: 1,
    gravity: 1,
    slopeSuppression: 1,
    lookahead: 1,
    downhill: 1,
    uphill: 1,
    lateral: 1,
    boost: 1,
    brake: 1,
    topBoost: 1,
    cameraEnergy: 1,
  },
  extreme: {
    speed: 1.14,
    gravity: 1.18,
    slopeSuppression: 1.32,
    lookahead: 1.26,
    downhill: 1.34,
    uphill: 1.08,
    lateral: 1.2,
    boost: 1.32,
    brake: 0.92,
    topBoost: 1.3,
    cameraEnergy: 1.28,
  },
};

export const DEFAULT_COASTER_INPUT: CoasterRideInput = {
  throttle: 0,
};

export const DEFAULT_COASTER_PHYSICS: CoasterPhysicsConfig = {
  cruiseSpeed: 14,
  stationSpeed: 6,
  minSpeed: 0.85,
  maxSpeed: 29,
  gravity: 9.81,
  gravityScale: 0.88,
  driveGain: 1.18,
  dragCoefficient: 0.028,
  rollingFriction: 0.42,
  curveBrakeStrength: 0.62,
  maxLateralAccel: 24,
  safetyClearance: TRACK_CLEARANCE,
  clearanceBrakeStrength: 15,
  stationBrakeDistance: 56,
  stationBrakeStrength: 2.5,
  slopeDriveSuppression: 1.7,
  slopeLookaheadGain: 3.9,
  downhillRushGain: 1.05,
  uphillResistance: 0.2,
  maxAcceleration: 12,
  maxBraking: 17,
  manualBoostForce: 3.8,
  manualBrakeForce: 5.4,
  manualTopSpeedBoost: 5.2,
};

export function resolveCoasterDriveProfileTuning(
  profile: CoasterDriveProfile,
): CoasterDriveProfileTuning {
  return COASTER_DRIVE_PROFILE_TUNING[profile];
}

function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function finitePositive(value: number, fallback: number, min: number, max: number): number {
  const normalized = Math.abs(finiteNumber(value, fallback));
  return clamp(normalized, min, max);
}

function isFiniteVector(point: Vector3 | null | undefined): point is Vector3 {
  if (!point) {
    return false;
  }
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return finiteNumber(value, 0);
  }
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (!Number.isFinite(value)) {
    return low;
  }
  return Math.max(low, Math.min(high, value));
}

function positiveModulo(value: number, modulo: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulo) || modulo <= 0) {
    return 0;
  }
  return ((value % modulo) + modulo) % modulo;
}

function seedUnit(seed: number, index: number): number {
  const safeSeed = finiteNumber(seed, 0);
  const safeIndex = finiteNumber(index, 0);
  const raw = Math.sin(safeSeed * 12.9898 + safeIndex * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function sanitizeCityBounds(cityBounds: CityBounds): CityBounds {
  const size = finitePositive(cityBounds.size, 120, MIN_CITY_SIZE, MAX_CITY_SIZE);
  return {
    centerX: finiteNumber(cityBounds.centerX, 0),
    centerZ: finiteNumber(cityBounds.centerZ, 0),
    size,
  };
}

function sanitizeFootprints(footprints: BuildingFootprint[]): BuildingFootprint[] {
  return footprints.reduce<BuildingFootprint[]>((result, footprint, index) => {
    if (!footprint) {
      return result;
    }
    const width = finitePositive(footprint.width, 3.2, MIN_FOOTPRINT_SIZE, MAX_FOOTPRINT_SIZE);
    const depth = finitePositive(footprint.depth, 3.2, MIN_FOOTPRINT_SIZE, MAX_FOOTPRINT_SIZE);
    result.push({
      path: footprint.path || `building-${index}`,
      x: finiteNumber(footprint.x, 0),
      z: finiteNumber(footprint.z, 0),
      width,
      depth,
      topY: clamp(finiteNumber(footprint.topY, 1.2), 0.2, 260),
    });
    return result;
  }, []);
}

function angleAroundCenter(x: number, z: number, centerX: number, centerZ: number): number {
  return Math.atan2(z - centerZ, x - centerX);
}

function squaredDistance(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function requiredTrackHeightAt(
  x: number,
  z: number,
  footprints: BuildingFootprint[],
  clearance: number,
): number {
  let required = 0;

  for (let index = 0; index < footprints.length; index += 1) {
    const footprint = footprints[index];
    if (!footprint) {
      continue;
    }

    const halfWidth = footprint.width * 0.5 + 0.26;
    const halfDepth = footprint.depth * 0.5 + 0.26;
    const inside =
      x >= footprint.x - halfWidth &&
      x <= footprint.x + halfWidth &&
      z >= footprint.z - halfDepth &&
      z <= footprint.z + halfDepth;

    if (!inside) {
      continue;
    }

    required = Math.max(required, footprint.topY + clearance);
  }

  return required;
}

function clearanceAt(
  x: number,
  y: number,
  z: number,
  footprints: BuildingFootprint[],
): number {
  let top = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < footprints.length; index += 1) {
    const footprint = footprints[index];
    if (!footprint) {
      continue;
    }

    const halfWidth = footprint.width * 0.5 + 0.2;
    const halfDepth = footprint.depth * 0.5 + 0.2;
    const inside =
      x >= footprint.x - halfWidth &&
      x <= footprint.x + halfWidth &&
      z >= footprint.z - halfDepth &&
      z <= footprint.z + halfDepth;

    if (!inside) {
      continue;
    }

    top = Math.max(top, footprint.topY);
  }

  if (top === Number.NEGATIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }

  return y - top;
}

function selectSupportCandidates(
  footprints: BuildingFootprint[],
  cityBounds: CityBounds,
): SupportCandidate[] {
  if (footprints.length === 0) {
    return [];
  }

  return footprints
    .map((footprint) => {
      const area = Math.max(1, footprint.width * footprint.depth);
      const distanceToCenter = Math.hypot(
        footprint.x - cityBounds.centerX,
        footprint.z - cityBounds.centerZ,
      );
      const score =
        footprint.topY * 1.24 +
        Math.sqrt(area) * 0.65 +
        Math.min(4.2, Math.max(0.4, area * 0.08)) -
        distanceToCenter * 0.03;

      return {
        path: footprint.path,
        x: footprint.x,
        z: footprint.z,
        topY: footprint.topY,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(18, Math.min(44, Math.ceil(footprints.length * 0.4))));
}

function pickSupportAnchors(
  footprints: BuildingFootprint[],
  cityBounds: CityBounds,
  seed: number,
): SupportCandidate[] {
  const candidates = selectSupportCandidates(footprints, cityBounds);
  if (candidates.length === 0) {
    return [];
  }

  const targetCount = Math.max(6, Math.min(14, Math.round(Math.sqrt(footprints.length) * 1.5)));
  const selected: SupportCandidate[] = [];

  selected.push(candidates[0]);

  while (selected.length < targetCount && selected.length < candidates.length) {
    let bestCandidate: SupportCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (!candidate) {
        continue;
      }
      if (selected.some((item) => item.path === candidate.path)) {
        continue;
      }

      let minDistanceSq = Number.POSITIVE_INFINITY;
      for (let selectedIndex = 0; selectedIndex < selected.length; selectedIndex += 1) {
        const selectedItem = selected[selectedIndex];
        if (!selectedItem) {
          continue;
        }
        minDistanceSq = Math.min(
          minDistanceSq,
          squaredDistance(candidate.x, candidate.z, selectedItem.x, selectedItem.z),
        );
      }

      const spread = Math.sqrt(Math.max(0.0001, minDistanceSq));
      const jitter = (seedUnit(seed, index + selected.length * 7) - 0.5) * 0.6;
      const weightedScore = spread * 0.72 + candidate.score * 1.1 + jitter;

      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) {
      break;
    }

    selected.push(bestCandidate);
  }

  return selected.sort((a, b) => {
    const angleA = angleAroundCenter(a.x, a.z, cityBounds.centerX, cityBounds.centerZ);
    const angleB = angleAroundCenter(b.x, b.z, cityBounds.centerX, cityBounds.centerZ);
    return angleA - angleB;
  });
}

function fallbackSupports(cityBounds: CityBounds, seed: number): SupportCandidate[] {
  const count = 8;
  const radius = Math.max(20, cityBounds.size * 0.32);
  const supports: SupportCandidate[] = [];

  for (let index = 0; index < count; index += 1) {
    const phase = (index / count) * Math.PI * 2;
    const wobble = (seedUnit(seed, index * 3 + 1) - 0.5) * radius * 0.16;
    const localRadius = radius + wobble;
    supports.push({
      path: `fallback-${index}`,
      x: cityBounds.centerX + Math.cos(phase) * localRadius,
      z: cityBounds.centerZ + Math.sin(phase) * localRadius,
      topY: 0.24 + seedUnit(seed, index + 19) * 0.25,
      score: 1,
    });
  }

  return supports;
}

function buildControlPoints(
  supports: SupportCandidate[],
  seed: number,
): Vector3[] {
  return supports.map((support, index) => {
    const harmonicPhase = (index / Math.max(1, supports.length)) * Math.PI * 2 + seed * 0.07;
    const hillWave = Math.sin(harmonicPhase) * 2.2;
    const crossWave = Math.sin(harmonicPhase * 2.35 + 1.4) * 0.85;
    const microWave = (seedUnit(seed, index + 11) - 0.5) * 1.5;
    const structuralLift = Math.min(4.8, Math.max(0.65, support.topY * 0.12));
    const y = Math.max(
      3.2,
      support.topY + SUPPORT_CLEARANCE + structuralLift + hillWave + crossWave + microWave,
    );

    return new Vector3(support.x, y, support.z);
  });
}

function mapSupportsToSamples(
  supports: SupportCandidate[],
  sampled: Vector3[],
): Map<string, number> {
  const map = new Map<string, number>();

  for (let supportIndex = 0; supportIndex < supports.length; supportIndex += 1) {
    const support = supports[supportIndex];
    if (!support) {
      continue;
    }

    let bestIndex = 0;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (let sampleIndex = 0; sampleIndex < sampled.length; sampleIndex += 1) {
      const point = sampled[sampleIndex];
      if (!point) {
        continue;
      }

      const distanceSq = squaredDistance(point.x, point.z, support.x, support.z);
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestIndex = sampleIndex;
      }
    }

    map.set(support.path, bestIndex);
  }

  return map;
}

function smoothAndResolveClearance(
  sampled: Vector3[],
  footprints: BuildingFootprint[],
  supportSampleIndices: Set<number>,
): void {
  for (let index = 0; index < sampled.length; index += 1) {
    const point = sampled[index];
    if (!point) {
      continue;
    }

    const requiredY = requiredTrackHeightAt(point.x, point.z, footprints, TRACK_CLEARANCE);
    if (requiredY > 0) {
      point.y = Math.max(point.y, requiredY);
    }
  }

  const scratch: number[] = new Array(sampled.length).fill(0);

  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 0; index < sampled.length; index += 1) {
      const point = sampled[index];
      if (!point) {
        continue;
      }

      if (supportSampleIndices.has(index)) {
        scratch[index] = point.y;
        continue;
      }

      const prev = sampled[(index - 1 + sampled.length) % sampled.length];
      const next = sampled[(index + 1) % sampled.length];
      if (!prev || !next) {
        scratch[index] = point.y;
        continue;
      }

      const requiredY = requiredTrackHeightAt(point.x, point.z, footprints, TRACK_CLEARANCE);
      const smoothY = (prev.y + point.y * 2 + next.y) * 0.25;
      scratch[index] = Math.max(requiredY, smoothY);
    }

    for (let index = 0; index < sampled.length; index += 1) {
      const point = sampled[index];
      if (!point) {
        continue;
      }
      point.y = scratch[index] ?? point.y;
    }
  }
}

function createTrackLayout(
  sampled: Vector3[],
  supports: SupportCandidate[],
  supportBySample: Map<string, number>,
  footprints: BuildingFootprint[],
): CoasterTrackLayout {
  const points: CoasterTrackPoint[] = [];
  const totalPoints = sampled.length;
  const distances: number[] = new Array(totalPoints).fill(0);
  const segmentLengths: number[] = new Array(totalPoints).fill(0);
  let totalLength = 0;

  for (let index = 0; index < totalPoints; index += 1) {
    const current = sampled[index];
    const next = sampled[(index + 1) % totalPoints];
    if (!isFiniteVector(current) || !isFiniteVector(next)) {
      continue;
    }

    const segmentLength = current.distanceTo(next);
    if (!Number.isFinite(segmentLength) || segmentLength <= 0.0001) {
      continue;
    }
    segmentLengths[index] = segmentLength;
    if (index < totalPoints - 1) {
      distances[index + 1] = distances[index] + segmentLength;
    }
    totalLength += segmentLength;
  }

  let minClearance = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < totalPoints; index += 1) {
    const prev = sampled[(index - 1 + totalPoints) % totalPoints];
    const current = sampled[index];
    const next = sampled[(index + 1) % totalPoints];
    const prevPoint = sampled[(index - 2 + totalPoints) % totalPoints] ?? prev;
    if (!isFiniteVector(prev) || !isFiniteVector(current) || !isFiniteVector(next)) {
      continue;
    }

    const tangent = next.clone().sub(prev).normalize();
    if (tangent.lengthSq() < 0.000001) {
      tangent.copy(forwardVector);
    }

    const toCurrent = current.clone().sub(prev);
    const toNext = next.clone().sub(current);
    const prevDirection = toCurrent.lengthSq() < 0.000001 ? forwardVector : toCurrent.normalize();
    const nextDirection = toNext.lengthSq() < 0.000001 ? forwardVector : toNext.normalize();
    const cornerAngle = prevDirection.angleTo(nextDirection);
    const localLength = Math.max(0.0001, current.distanceTo(next));
    const curvature = finiteNumber(cornerAngle / localLength, 0);
    const slope = finiteNumber(tangent.y, 0);
    const clearance = clearanceAt(current.x, current.y, current.z, footprints);

    points.push({
      x: current.x,
      y: current.y,
      z: current.z,
      tangentX: tangent.x,
      tangentY: tangent.y,
      tangentZ: tangent.z,
      curvature: Math.max(0, curvature),
      slope,
      clearance,
      distance: finiteNumber(distances[index], 0),
      segmentLength: Math.max(
        0.0001,
        finiteNumber(segmentLengths[index], current.distanceTo(prevPoint)),
      ),
    });

    if (Number.isFinite(clearance)) {
      minClearance = Math.min(minClearance, clearance);
    }
    maxHeight = Math.max(maxHeight, current.y);
  }

  const mappedSupports: CoasterSupport[] = supports
    .map((support) => {
      const sampleIndex = supportBySample.get(support.path);
      if (sampleIndex === undefined) {
        return null;
      }
      const point = points[sampleIndex];
      if (!point) {
        return null;
      }
      return {
        path: support.path,
        x: support.x,
        z: support.z,
        baseY: support.topY,
        railY: point.y,
        sampleIndex,
      };
    })
    .filter((support): support is CoasterSupport => Boolean(support));

  return {
    points,
    supports: mappedSupports,
    totalLength,
    minClearance: Number.isFinite(minClearance) ? minClearance : Number.POSITIVE_INFINITY,
    maxHeight: Number.isFinite(maxHeight) ? maxHeight : 0,
  };
}

export function buildCoasterTrack(
  footprints: BuildingFootprint[],
  cityBounds: CityBounds,
  seed: number,
): CoasterTrackLayout {
  const safeFootprints = sanitizeFootprints(footprints);
  const safeCityBounds = sanitizeCityBounds(cityBounds);
  const safeSeed = finiteNumber(seed, 0);
  const supports = pickSupportAnchors(safeFootprints, safeCityBounds, safeSeed);
  const effectiveSupports =
    supports.length >= 4 ? supports : fallbackSupports(safeCityBounds, safeSeed);
  const controlPoints = buildControlPoints(effectiveSupports, safeSeed).filter(isFiniteVector);

  if (controlPoints.length < 4) {
    return {
      points: [],
      supports: [],
      totalLength: 0,
      minClearance: Number.POSITIVE_INFINITY,
      maxHeight: 0,
    };
  }

  const curve = new CatmullRomCurve3(controlPoints, true, 'centripetal', 0.38);
  const sampleCount = Math.max(TRACK_SAMPLE_FLOOR, controlPoints.length * 54);
  const sampled: Vector3[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleCount;
    const point = curve.getPointAt(t);
    if (!isFiniteVector(point)) {
      continue;
    }
    sampled.push(point);
  }

  if (sampled.length < 4) {
    return {
      points: [],
      supports: [],
      totalLength: 0,
      minClearance: Number.POSITIVE_INFINITY,
      maxHeight: 0,
    };
  }

  const supportBySample = mapSupportsToSamples(effectiveSupports, sampled);
  smoothAndResolveClearance(
    sampled,
    safeFootprints,
    new Set<number>(Array.from(supportBySample.values())),
  );

  return createTrackLayout(sampled, effectiveSupports, supportBySample, safeFootprints);
}

export function createInitialCoasterRideState(layout: CoasterTrackLayout): CoasterRideState {
  const totalLength = finiteNumber(layout.totalLength, 0);
  const baseSpeed = clamp(totalLength * 0.021, 8, 13.5);
  return {
    distance: 0,
    speed: baseSpeed,
    acceleration: 0,
    gForce: 1,
    lap: 0,
    emergencyBrake: false,
  };
}

export function wrapCoasterDistance(layout: CoasterTrackLayout, distance: number): number {
  return positiveModulo(finiteNumber(distance, 0), finiteNumber(layout.totalLength, 0));
}

export function sampleCoasterTrack(
  layout: CoasterTrackLayout,
  distance: number,
): CoasterTrackSample | null {
  const { points, totalLength } = layout;
  if (points.length === 0 || !Number.isFinite(totalLength) || totalLength <= 0) {
    return null;
  }

  const wrapped = wrapCoasterDistance(layout, distance);

  let low = 0;
  let high = points.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const current = points[mid];
    const next = points[(mid + 1) % points.length];
    if (!current || !next) {
      break;
    }

    const start = current.distance;
    const end = mid === points.length - 1 ? totalLength : next.distance;

    if (wrapped < start) {
      high = mid - 1;
      continue;
    }
    if (wrapped >= end) {
      low = mid + 1;
      continue;
    }

    const segmentLength = Math.max(0.0001, current.segmentLength);
    const localDistance = wrapped - start;
    const t = clamp(localDistance / segmentLength, 0, 1);

    const tangentX = current.tangentX + (next.tangentX - current.tangentX) * t;
    const tangentY = current.tangentY + (next.tangentY - current.tangentY) * t;
    const tangentZ = current.tangentZ + (next.tangentZ - current.tangentZ) * t;
    const tangentLength = Math.hypot(tangentX, tangentY, tangentZ) || 1;
    const interpolatedClearance = current.clearance + (next.clearance - current.clearance) * t;

    return {
      x: finiteNumber(current.x + (next.x - current.x) * t, current.x),
      y: finiteNumber(current.y + (next.y - current.y) * t, current.y),
      z: finiteNumber(current.z + (next.z - current.z) * t, current.z),
      tangentX: tangentX / tangentLength,
      tangentY: tangentY / tangentLength,
      tangentZ: tangentZ / tangentLength,
      curvature: Math.max(
        0,
        finiteNumber(current.curvature + (next.curvature - current.curvature) * t, current.curvature),
      ),
      slope: finiteNumber(current.slope + (next.slope - current.slope) * t, current.slope),
      clearance: Number.isFinite(interpolatedClearance)
        ? interpolatedClearance
        : Number.POSITIVE_INFINITY,
    };
  }

  return {
    x: points[0]?.x ?? 0,
    y: points[0]?.y ?? 0,
    z: points[0]?.z ?? 0,
    tangentX: points[0]?.tangentX ?? 1,
    tangentY: points[0]?.tangentY ?? 0,
    tangentZ: points[0]?.tangentZ ?? 0,
    curvature: points[0]?.curvature ?? 0,
    slope: points[0]?.slope ?? 0,
    clearance: points[0]?.clearance ?? Number.POSITIVE_INFINITY,
  };
}

export function advanceCoasterRide(
  layout: CoasterTrackLayout,
  previous: CoasterRideState,
  delta: number,
  config: CoasterPhysicsConfig = DEFAULT_COASTER_PHYSICS,
  input: CoasterRideInput = DEFAULT_COASTER_INPUT,
): CoasterRideState {
  if (
    layout.points.length < 2 ||
    !Number.isFinite(layout.totalLength) ||
    layout.totalLength <= 0 ||
    !Number.isFinite(delta) ||
    delta <= 0
  ) {
    return previous;
  }

  const safePreviousDistance = finiteNumber(previous.distance, 0);
  const safePreviousSpeed = clamp(
    finiteNumber(previous.speed, config.cruiseSpeed),
    config.minSpeed,
    config.maxSpeed,
  );
  const safePreviousLap = Math.max(0, Math.floor(finiteNumber(previous.lap, 0)));
  const step = clamp(delta, 0, 0.12);
  const current = sampleCoasterTrack(layout, safePreviousDistance);
  const lookaheadDistance = Math.max(1.5, safePreviousSpeed * 0.42);
  const ahead = sampleCoasterTrack(layout, safePreviousDistance + lookaheadDistance);
  if (!current || !ahead) {
    return previous;
  }

  const downhillFactor = Math.max(0, -current.slope);
  const uphillFactor = Math.max(0, current.slope);
  const slopeAcceleration = -config.gravity * config.gravityScale * current.slope;
  const driveSuppression = clamp(
    (downhillFactor + uphillFactor) * config.slopeDriveSuppression,
    0,
    0.88,
  );
  const driveAcceleration =
    (config.cruiseSpeed - safePreviousSpeed) * config.driveGain * (1 - driveSuppression);
  const lookaheadDropGradient = (current.y - ahead.y) / Math.max(0.5, lookaheadDistance);
  const slopeLookaheadAcceleration = lookaheadDropGradient * config.slopeLookaheadGain;
  const downhillRush =
    downhillFactor * Math.sqrt(Math.max(0, safePreviousSpeed)) * config.downhillRushGain;
  const uphillDrag = -uphillFactor * Math.max(0, safePreviousSpeed) * config.uphillResistance;
  const dragAcceleration =
    -config.dragCoefficient * safePreviousSpeed * Math.abs(safePreviousSpeed) -
    config.rollingFriction * Math.sign(safePreviousSpeed || 1);
  const throttle = clamp(input.throttle, -1, 1);
  const manualBoost = Math.max(0, throttle) * config.manualBoostForce;
  const manualBrake = -Math.max(0, -throttle) * config.manualBrakeForce;

  const lateralAccel = safePreviousSpeed * safePreviousSpeed * Math.max(0, current.curvature);
  const curveOverload = Math.max(0, lateralAccel - config.maxLateralAccel);
  const curveBrake = -curveOverload * config.curveBrakeStrength;

  const clearanceHeadroom = Math.min(current.clearance, ahead.clearance);
  const clearanceDeficit = Math.max(0, config.safetyClearance - clearanceHeadroom);
  const clearanceBrake = -clearanceDeficit * config.clearanceBrakeStrength;

  const wrappedDistance = wrapCoasterDistance(layout, safePreviousDistance);
  const remainingToStation = layout.totalLength - wrappedDistance;
  let stationBrake = 0;
  if (remainingToStation <= config.stationBrakeDistance) {
    const weight = 1 - remainingToStation / Math.max(1, config.stationBrakeDistance);
    stationBrake =
      (config.stationSpeed - safePreviousSpeed) * config.stationBrakeStrength * clamp(weight, 0, 1);
  }

  let acceleration =
    slopeAcceleration +
    slopeLookaheadAcceleration +
    downhillRush +
    uphillDrag +
    driveAcceleration +
    manualBoost +
    manualBrake +
    dragAcceleration +
    curveBrake +
    clearanceBrake +
    stationBrake;
  acceleration = clamp(acceleration, -config.maxBraking, config.maxAcceleration);

  const throttleTopSpeed = config.maxSpeed + Math.max(0, throttle) * config.manualTopSpeedBoost;
  let nextSpeed = safePreviousSpeed + acceleration * step;
  nextSpeed = clamp(nextSpeed, config.minSpeed, throttleTopSpeed);
  if (clearanceHeadroom < config.safetyClearance * 0.62) {
    nextSpeed = Math.min(nextSpeed, config.stationSpeed * 0.75);
  }

  const advancedDistance = safePreviousDistance + nextSpeed * step;
  const lapDelta = Math.floor(Math.max(0, advancedDistance) / layout.totalLength);
  const normalizedDistance = wrapCoasterDistance(layout, advancedDistance);

  const gForce = clamp(
    1 +
      (Math.max(0, lateralAccel) +
        Math.max(0, -slopeAcceleration) * 0.4 +
        Math.abs(acceleration) * 0.16) /
        config.gravity,
    0.4,
    4.8,
  );

  return {
    distance: normalizedDistance,
    speed: nextSpeed,
    acceleration,
    gForce,
    lap: safePreviousLap + lapDelta,
    emergencyBrake: curveOverload > 0.01 || clearanceDeficit > 0.01,
  };
}
