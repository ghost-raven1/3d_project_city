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

export type TourMode = 'orbit' | 'drone' | 'walk' | 'coaster';
export type CoasterDriveProfile = 'comfort' | 'sport' | 'extreme';

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

export interface CoasterCameraPose {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  fov: number;
  speed: number;
  acceleration: number;
  gForce: number;
  lap: number;
  emergencyBrake: boolean;
  slope: number;
  clearance: number;
  throttle: number;
  cameraMode: 'front' | 'chase';
  lapTimeSec: number;
  bestLapSec: number | null;
  topSpeed: number;
}

export interface CoasterTelemetry {
  speed: number;
  acceleration: number;
  gForce: number;
  lap: number;
  emergencyBrake: boolean;
  slope: number;
  clearance: number;
  throttle: number;
  cameraMode: 'front' | 'chase';
  lapTimeSec: number;
  bestLapSec: number | null;
  topSpeed: number;
}

export interface MusicSpectrumBands {
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  high: number;
}

export interface MusicSpectrumTelemetry {
  bands: MusicSpectrumBands;
  energy: number;
  beat: number;
  playing: boolean;
  reactive: boolean;
  timestampMs: number;
}

export interface CoasterControlInput {
  manualThrottle: number | null;
  cameraToggleSeq: number;
  resetSeq: number;
  regenerateSeq: number;
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
  fovBuildingCoverage: number;
  fovRoadCoverage: number;
  fovDistrictCoverage: number;
}
