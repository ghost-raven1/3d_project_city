import { DistrictArchetype } from '../../utils/district-archetype';
import { RoomPointer } from '../../types/collaboration';

export type SceneViewMode = 'overview' | 'architecture' | 'risk' | 'stack';
export type PostFxQuality = 'high' | 'medium' | 'low';
export type RuntimeQualityProfile = 'cinematic' | 'balanced' | 'performance';

export interface TourPoint {
  x: number;
  y: number;
  z: number;
  cameraOffset: [number, number, number];
}

export type TourMode = 'orbit' | 'drone' | 'walk';

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

export interface BuildingFootprint {
  path: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  topY: number;
}

export interface PointerSample {
  x: number;
  y: number;
  z: number;
  path: string | null;
}

export type ScenePointer = RoomPointer;

export interface ConstructionWindow {
  start: number;
  end: number;
}

export type ProjectEventType = 'flash' | 'accident' | 'recovery' | 'release';

export interface ProjectCityEvent {
  id: string;
  type: ProjectEventType;
  path: string;
  x: number;
  y: number;
  z: number;
  intensity: number;
  reason: string;
}

export interface ScenePerformanceTelemetry {
  fps: number;
  runtimeProfile: RuntimeQualityProfile;
  postFxQuality: PostFxQuality;
  adaptiveDpr: number;
  adaptiveLoadScale: number;
}
