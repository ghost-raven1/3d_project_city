import { DistrictArchetype } from '../../utils/district-archetype';

export interface TourPoint {
  x: number;
  y: number;
  z: number;
  cameraOffset: [number, number, number];
}

export interface RoadPoint {
  x: number;
  z: number;
}

export interface ImportRoadSegment {
  id: string;
  label: string;
  tier: 'highway' | 'arterial' | 'local';
  points: RoadPoint[];
  trafficBias: number;
  x: number;
  z: number;
  length: number;
  angle: number;
  width: number;
  glowWidth: number;
  glowOpacity: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  violationScore: number;
  cycleScore: number;
}

export interface DistrictInfo {
  folder: string;
  label: string;
  archetype: DistrictArchetype;
  archetypeLabel: string;
  archetypeAccent: string;
  gateX: number;
  gateZ: number;
  gateAngle: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
}

export interface CityBounds {
  centerX: number;
  centerZ: number;
  size: number;
}
