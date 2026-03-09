import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Frustum,
  Group,
  HemisphereLight,
  Matrix4,
  MeshStandardMaterial,
  PointLight,
  Sphere,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import {
  BranchSignal,
  ImportRoad,
  PositionedFileHistory,
  StackPassport,
} from '../types/repository';
import { compactFloors, floorHeight } from '../utils/building';
import { classifyBuildingMood, folderToDistrictColor } from '../utils/city';
import { buildCityLayout, CityDNA, getBuildingStyle } from '../utils/city-dna';
import {
  detectDistrictArchetype,
  getArchetypeVisual,
} from '../utils/district-archetype';
import { RepositoryInsights } from '../utils/insights';
import { FileRiskProfile } from '../utils/risk';
import { buildRoadSegments } from '../utils/scene-roads';
import { inferStackLayer, stackLayerColor } from '../utils/stack-layers';
import { Building } from './Building';
import { AirTraffic } from './scene/AirTraffic';
import { BranchOrbits } from './scene/BranchOrbits';
import { BuilderDrones } from './scene/BuilderDrones';
import { CameraDirector } from './scene/CameraDirector';
import { CityActivities } from './scene/CityActivities';
import { CityTerrain } from './scene/CityTerrain';
import { ComparisonOverlay } from './scene/ComparisonOverlay';
import { CyberpunkAtmosphere } from './scene/CyberpunkAtmosphere';
import { DistrictOverlays } from './scene/DistrictOverlays';
import { EventFireworks } from './scene/EventFireworks';
import { GroundEventAgents } from './scene/GroundEventAgents';
import { HotspotBillboards } from './scene/HotspotBillboards';
import { InsightSignals } from './scene/InsightSignals';
import { LivePointers } from './scene/LivePointers';
import { ModeSignatureLayer } from './scene/ModeSignatureLayer';
import { ProjectEventSignals } from './scene/ProjectEventSignals';
import { ProjectEventRoutes } from './scene/ProjectEventRoutes';
import { RoadNetwork } from './scene/RoadNetwork';
import { RollerCoaster } from './scene/RollerCoaster';
import { StackPassportTowers } from './scene/StackPassportTowers';
import {
  BuildingFootprint,
  CoasterCameraPose,
  CoasterControlInput,
  CoasterDriveProfile,
  CoasterTelemetry,
  ConstructionWindow,
  DistrictInfo,
  ImportRoadSegment,
  MusicSpectrumTelemetry,
  PostFxQuality,
  PointerSample,
  ProjectCityEvent,
  RuntimeQualityProfile,
  ScenePerformanceTelemetry,
  SceneViewMode,
  ScenePointer,
  TourMode,
  TourPoint,
} from './scene/types';
import { getSceneModePreset } from './scene/view-mode-presets';

interface Scene3DProps {
  files: PositionedFileHistory[];
  imports: ImportRoad[];
  branches: BranchSignal[];
  stack: StackPassport | null;
  dna: CityDNA | null;
  insights: RepositoryInsights | null;
  riskByPath: Map<string, FileRiskProfile>;
  hoveredPath: string | null;
  selectedPath: string | null;
  viewMode: SceneViewMode;
  compareEnabled: boolean;
  compareMode: 'ghost' | 'split';
  compareFiles: PositionedFileHistory[];
  autoTour: boolean;
  showAtmosphere: boolean;
  showWeather: boolean;
  showBuilders: boolean;
  showPostProcessing: boolean;
  adaptivePostFx: boolean;
  modePresetIntensity: number;
  coasterIntensity: number;
  visualPreset: 'immersive' | 'balanced' | 'performance';
  targetFps: 30 | 45 | 60;
  renderProfileLock: 'auto' | 'cinematic' | 'balanced' | 'performance';
  showFps: boolean;
  tourMode: TourMode;
  followDroneIndex: number;
  livePointers: ScenePointer[];
  timeOfDay: 'auto' | 'dawn' | 'day' | 'sunset' | 'night';
  weatherMode: 'auto' | 'clear' | 'mist' | 'rain' | 'storm';
  totalCommitsByPath: Map<string, number>;
  constructionWindowByPath: Map<string, ConstructionWindow>;
  constructionMode: boolean;
  constructionProgress: number;
  coasterProfile: CoasterDriveProfile;
  coasterControlInput?: CoasterControlInput | null;
  musicSpectrum?: MusicSpectrumTelemetry | null;
  onHover: (path: string | null) => void;
  onSelect: (path: string | null) => void;
  onCaptureReady?: (capture: (() => Promise<Blob | null>) | null) => void;
  onFpsUpdate?: (fps: number) => void;
  onPerformanceTelemetry?: (telemetry: ScenePerformanceTelemetry) => void;
  onFollowDroneChange?: (index: number) => void;
  onWalkBuildingChange?: (path: string | null) => void;
  onCoasterTelemetry?: (telemetry: CoasterTelemetry | null) => void;
  onPointerSample?: (sample: PointerSample) => void;
}

type ResolvedTimeOfDay = 'dawn' | 'day' | 'sunset' | 'night';
type ResolvedWeather = 'clear' | 'mist' | 'rain' | 'storm';

interface AtmospherePreset {
  sky: string;
  fog: string;
  ambient: number;
  hemisphere: number;
  directional: number;
  pointAccent: number;
  pointSun: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
  wetnessBoost: number;
}

function folderLabel(folder: string): string {
  if (folder === 'root') {
    return 'ROOT';
  }

  const parts = folder.split('/');
  const tail = parts.slice(-2).join('/');

  if (tail.length <= 22) {
    return tail;
  }

  return `…${tail.slice(-21)}`;
}

function resolveTimeOfDay(
  mode: 'auto' | 'dawn' | 'day' | 'sunset' | 'night',
  seed: number,
): ResolvedTimeOfDay {
  if (mode !== 'auto') {
    return mode;
  }

  const variants: ResolvedTimeOfDay[] = ['dawn', 'day', 'sunset', 'night'];
  return variants[Math.abs(seed) % variants.length] ?? 'day';
}

function resolveWeatherMode(
  mode: 'auto' | 'clear' | 'mist' | 'rain' | 'storm',
  dna: CityDNA | null,
): ResolvedWeather {
  if (mode !== 'auto') {
    return mode;
  }

  const churn = dna?.metrics.churn ?? 0.35;
  const density = dna?.metrics.importDensity ?? 0.3;
  const signal = churn * 0.67 + density * 0.33;

  if (signal > 0.72) {
    return 'storm';
  }
  if (signal > 0.56) {
    return 'rain';
  }
  if (signal > 0.41) {
    return 'mist';
  }
  return 'clear';
}

const releaseMessagePattern =
  /(\brelease\b|\bdeploy\b|\bpublish\b|\bversion\b|\bmilestone\b|\btag\b|\bv\d+\.\d+|\brc\b)/i;
const incidentMessagePattern =
  /(\bincident\b|\boutage\b|\bregression\b|\brollback\b|\bpanic\b|\bfailure\b|\bhotfix\b|\bbug\b)/i;
const recoveryMessagePattern =
  /(\bfix\b|\bstabil\w*\b|\brecover\w*\b|\bharden\w*\b|\bcleanup\b|\brefactor\b)/i;
const flashMessagePattern =
  /(\bperf\b|\boptimi\w*\b|\brewrite\b|\bmajor\b|\bmigration\b|\bchore\b)/i;

const PostProcessingLayerLazy = lazy(async () => {
  const module = await import('./scene/PostProcessingLayer');
  return { default: module.PostProcessingLayer };
});

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

interface LayoutAnchorPoint {
  x: number;
  z: number;
}

function resolveRenamedAnchorPath(
  file: PositionedFileHistory,
  anchors: Map<string, LayoutAnchorPoint>,
): string | null {
  for (let index = file.commits.length - 1; index >= 0; index -= 1) {
    const commit = file.commits[index];
    if (!commit?.previousPath) {
      continue;
    }
    const status = (commit.status ?? '').toLowerCase();
    const renamed =
      status === 'renamed' ||
      status === 'renamed_to' ||
      status === 'renamed_from' ||
      status === 'renamed-to' ||
      status === 'renamed-from';
    if (!renamed) {
      continue;
    }
    if (anchors.has(commit.previousPath)) {
      return commit.previousPath;
    }
  }
  return null;
}

function stabilizeLayoutFiles(
  files: PositionedFileHistory[],
  anchors: Map<string, LayoutAnchorPoint>,
  updateAnchors: boolean,
): PositionedFileHistory[] {
  if (files.length === 0) {
    if (updateAnchors) {
      anchors.clear();
    }
    return files;
  }

  if (updateAnchors && anchors.size > 0) {
    let overlap = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) {
        continue;
      }
      if (anchors.has(file.path)) {
        overlap += 1;
        continue;
      }
      const renamedPath = resolveRenamedAnchorPath(file, anchors);
      if (renamedPath) {
        overlap += 1;
      }
    }

    // No overlap usually means a brand-new repository/session, so anchors must reset.
    if (overlap === 0) {
      anchors.clear();
    }
  }

  return files.map((file) => {
    const directAnchor = anchors.get(file.path);
    const renamedPath = !directAnchor ? resolveRenamedAnchorPath(file, anchors) : null;
    const renamedAnchor = renamedPath ? anchors.get(renamedPath) : undefined;
    const anchor = directAnchor ?? renamedAnchor;
    const stabilizedFile = anchor
      ? {
          ...file,
          x: anchor.x,
          z: anchor.z,
        }
      : file;

    if (updateAnchors) {
      anchors.set(stabilizedFile.path, {
        x: stabilizedFile.x,
        z: stabilizedFile.z,
      });
    }

    return stabilizedFile;
  });
}

function sanitizeCoasterPose(pose: CoasterCameraPose | null): CoasterCameraPose | null {
  if (!pose) {
    return null;
  }

  const x = finiteNumber(pose.x, 0);
  const y = finiteNumber(pose.y, 1.4);
  const z = finiteNumber(pose.z, 0);
  const targetX = finiteNumber(pose.targetX, x + 1);
  const targetY = finiteNumber(pose.targetY, y);
  const targetZ = finiteNumber(pose.targetZ, z);
  const fov = Math.max(48, Math.min(110, finiteNumber(pose.fov, 66)));
  const speed = Math.max(0, finiteNumber(pose.speed, 0));
  const acceleration = finiteNumber(pose.acceleration, 0);
  const gForce = Math.max(0.2, Math.min(6, finiteNumber(pose.gForce, 1)));
  const lap = Math.max(0, Math.floor(finiteNumber(pose.lap, 0)));
  const slope = finiteNumber(pose.slope, 0);
  const clearance = Number.isFinite(pose.clearance)
    ? pose.clearance
    : Number.POSITIVE_INFINITY;
  const throttle = Math.max(-1, Math.min(1, finiteNumber(pose.throttle, 0)));
  const lapTimeSec = Math.max(0, finiteNumber(pose.lapTimeSec, 0));
  const bestLapSec =
    pose.bestLapSec === null
      ? null
      : Number.isFinite(pose.bestLapSec)
        ? Math.max(0, pose.bestLapSec)
        : null;
  const topSpeed = Math.max(speed, finiteNumber(pose.topSpeed, speed));

  const hasFiniteCameraVectors =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(z) &&
    Number.isFinite(targetX) &&
    Number.isFinite(targetY) &&
    Number.isFinite(targetZ);
  if (!hasFiniteCameraVectors) {
    return null;
  }

  return {
    x,
    y,
    z,
    targetX,
    targetY,
    targetZ,
    fov,
    speed,
    acceleration,
    gForce,
    lap,
    emergencyBrake: Boolean(pose.emergencyBrake),
    slope,
    clearance,
    throttle,
    cameraMode: pose.cameraMode === 'chase' ? 'chase' : 'front',
    lapTimeSec,
    bestLapSec,
    topSpeed,
  };
}

function blendHex(colorA: string, colorB: string, factor: number): string {
  const mixed = new Color(colorA).lerp(
    new Color(colorB),
    Math.max(0, Math.min(1, factor)),
  );
  return `#${mixed.getHexString()}`;
}

function blendFromBase(base: number, target: number, intensity: number): number {
  return base + (target - base) * intensity;
}

const qualityOrder: Record<PostFxQuality, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function minQuality(a: PostFxQuality, b: PostFxQuality): PostFxQuality {
  return qualityOrder[a] <= qualityOrder[b] ? a : b;
}

const loadScaleLevels = [0.48, 0.56, 0.66, 0.76, 0.88, 0.94, 1] as const;

function loadScaleLevelIndex(scale: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  loadScaleLevels.forEach((level, index) => {
    const distance = Math.abs(level - scale);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function SceneLightingRig({
  preset,
  palette,
  cityBounds,
  shadowsEnabled,
  shadowMapSize,
}: {
  preset: AtmospherePreset;
  palette: {
    sun: string;
    accent: string;
  };
  cityBounds: {
    centerX: number;
    centerZ: number;
    size: number;
  };
  shadowsEnabled: boolean;
  shadowMapSize: number;
}) {
  const { scene, gl } = useThree();
  const ambientRef = useRef<AmbientLight | null>(null);
  const hemisphereRef = useRef<HemisphereLight | null>(null);
  const directionalRef = useRef<DirectionalLight | null>(null);
  const accentPointRef = useRef<PointLight | null>(null);
  const sunPointRef = useRef<PointLight | null>(null);
  const targetSky = useMemo(() => new Color(preset.sky), [preset.sky]);
  const targetFog = useMemo(() => new Color(preset.fog), [preset.fog]);

  useFrame((_, delta) => {
    const blend = 1 - Math.exp(-delta * 3.4);

    if (!(scene.background instanceof Color)) {
      scene.background = new Color(preset.sky);
    }
    if (!(scene.fog instanceof Fog)) {
      scene.fog = new Fog(preset.fog, preset.fogNear, preset.fogFar);
    }

    if (scene.background instanceof Color) {
      scene.background.lerp(targetSky, blend);
    }
    if (scene.fog instanceof Fog) {
      scene.fog.color.lerp(targetFog, blend);
      scene.fog.near += (preset.fogNear - scene.fog.near) * blend;
      scene.fog.far += (preset.fogFar - scene.fog.far) * blend;
    }
    gl.toneMappingExposure += (preset.exposure - gl.toneMappingExposure) * blend;

    if (ambientRef.current) {
      ambientRef.current.intensity += (preset.ambient - ambientRef.current.intensity) * blend;
    }
    if (hemisphereRef.current) {
      hemisphereRef.current.intensity +=
        (preset.hemisphere - hemisphereRef.current.intensity) * blend;
    }
    if (directionalRef.current) {
      directionalRef.current.intensity +=
        (preset.directional - directionalRef.current.intensity) * blend;
    }
    if (accentPointRef.current) {
      accentPointRef.current.intensity +=
        (preset.pointAccent - accentPointRef.current.intensity) * blend;
    }
    if (sunPointRef.current) {
      sunPointRef.current.intensity +=
        (preset.pointSun - sunPointRef.current.intensity) * blend;
    }
  });

  return (
    <>
      <hemisphereLight
        ref={hemisphereRef}
        intensity={preset.hemisphere}
        color="#ffffff"
        groundColor="#b7cee6"
      />
      <ambientLight ref={ambientRef} intensity={preset.ambient} color="#f1f8ff" />
      <directionalLight
        ref={directionalRef}
        intensity={preset.directional}
        color={palette.sun}
        position={[52, 60, 38]}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
      />
      <pointLight
        ref={accentPointRef}
        color={palette.accent}
        intensity={preset.pointAccent}
        distance={cityBounds.size * 0.9}
        position={[
          cityBounds.centerX - cityBounds.size * 0.26,
          7,
          cityBounds.centerZ - cityBounds.size * 0.2,
        ]}
      />
      <pointLight
        ref={sunPointRef}
        color={palette.sun}
        intensity={preset.pointSun}
        distance={cityBounds.size * 0.78}
        position={[
          cityBounds.centerX + cityBounds.size * 0.24,
          6,
          cityBounds.centerZ + cityBounds.size * 0.23,
        ]}
      />
    </>
  );
}

function CityCinematicAccentLayer({
  cityBounds,
  accentColor,
  mode,
  quality,
  weather,
}: {
  cityBounds: {
    centerX: number;
    centerZ: number;
    size: number;
  };
  accentColor: string;
  mode: SceneViewMode;
  quality: PostFxQuality;
  weather: 'clear' | 'mist' | 'rain' | 'storm';
}) {
  const shellRef = useRef<Group | null>(null);
  const ringMaterialRefs = useRef<Array<MeshStandardMaterial | null>>([]);
  const wallMaterialRef = useRef<MeshStandardMaterial | null>(null);
  const haloMaterialRef = useRef<MeshStandardMaterial | null>(null);
  const qualityScale = quality === 'high' ? 1 : quality === 'medium' ? 0.74 : 0.5;
  const modeBoost =
    mode === 'risk' ? 1.28 : mode === 'architecture' ? 1.14 : mode === 'stack' ? 0.92 : 1;
  const weatherBoost = weather === 'storm' ? 1.24 : weather === 'rain' ? 1.12 : weather === 'mist' ? 1.06 : 1;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (shellRef.current) {
      shellRef.current.rotation.y += 0.00042 + modeBoost * 0.00016;
    }

    ringMaterialRefs.current.forEach((material, index) => {
      if (!material) {
        return;
      }
      const wave = 0.34 + Math.max(0, Math.sin(t * (1.3 + index * 0.27) + index * 0.85)) * 0.88;
      material.emissiveIntensity = (0.3 + wave * 0.58) * qualityScale * modeBoost * weatherBoost;
      material.opacity = Math.max(
        0.045,
        (0.08 + wave * 0.08) * qualityScale * (mode === 'stack' ? 0.84 : 1),
      );
    });

    if (wallMaterialRef.current) {
      const wave = 0.3 + Math.max(0, Math.sin(t * 1.05 + 0.6)) * 0.7;
      wallMaterialRef.current.emissiveIntensity = (0.22 + wave * 0.34) * qualityScale * weatherBoost;
      wallMaterialRef.current.opacity = (0.03 + wave * 0.04) * qualityScale;
    }

    if (haloMaterialRef.current) {
      const haloPulse = 0.35 + Math.max(0, Math.sin(t * 2.3 + 0.2)) * 0.86;
      haloMaterialRef.current.emissiveIntensity = (0.6 + haloPulse * 0.92) * qualityScale * modeBoost;
      haloMaterialRef.current.opacity = (0.09 + haloPulse * 0.11) * qualityScale;
    }
  });

  return (
    <group ref={shellRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cityBounds.centerX, 0.05, cityBounds.centerZ]}>
        <ringGeometry args={[cityBounds.size * 0.58, cityBounds.size * 0.64, 180]} />
        <meshStandardMaterial
          ref={(node) => {
            ringMaterialRefs.current[0] = node;
          }}
          color={accentColor}
          emissive={accentColor}
          transparent
          opacity={0.12 * qualityScale}
          metalness={0.08}
          roughness={0.42}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cityBounds.centerX, 0.07, cityBounds.centerZ]}>
        <ringGeometry args={[cityBounds.size * 0.72, cityBounds.size * 0.79, 180]} />
        <meshStandardMaterial
          ref={(node) => {
            ringMaterialRefs.current[1] = node;
          }}
          color={accentColor}
          emissive={accentColor}
          transparent
          opacity={0.08 * qualityScale}
          metalness={0.12}
          roughness={0.5}
        />
      </mesh>

      {quality !== 'low' && (
        <mesh position={[cityBounds.centerX, 3.12, cityBounds.centerZ]}>
          <cylinderGeometry args={[cityBounds.size * 0.58, cityBounds.size * 0.64, 6.24, 110, 1, true]} />
          <meshStandardMaterial
            ref={wallMaterialRef}
            color={accentColor}
            emissive={accentColor}
            transparent
            opacity={0.06}
            side={DoubleSide}
            metalness={0.12}
            roughness={0.54}
          />
        </mesh>
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cityBounds.centerX, 7.18, cityBounds.centerZ]}>
        <ringGeometry args={[cityBounds.size * 0.16, cityBounds.size * 0.21, 100]} />
        <meshStandardMaterial
          ref={haloMaterialRef}
          color="#e7f7ff"
          emissive={accentColor}
          transparent
          opacity={0.18 * qualityScale}
          metalness={0.18}
          roughness={0.34}
        />
      </mesh>
    </group>
  );
}

function CaptureBridge({
  onCaptureReady,
}: {
  onCaptureReady?: (capture: (() => Promise<Blob | null>) | null) => void;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (!onCaptureReady) {
      return;
    }

    const capture = async (): Promise<Blob | null> => {
      const width = gl.domElement.width;
      const height = gl.domElement.height;
      if (width <= 0 || height <= 0) {
        return null;
      }

      const renderTarget = new WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: false,
      });
      const previousTarget = gl.getRenderTarget();
      const previousXrEnabled = gl.xr.enabled;

      try {
        gl.xr.enabled = false;
        gl.setRenderTarget(renderTarget);
        gl.render(scene, camera);

        const pixels = new Uint8Array(width * height * 4);
        gl.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

        const flipped = new Uint8ClampedArray(pixels.length);
        const stride = width * 4;
        for (let y = 0; y < height; y += 1) {
          const src = (height - 1 - y) * stride;
          const dst = y * stride;
          flipped.set(pixels.subarray(src, src + stride), dst);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          return null;
        }

        context.putImageData(new ImageData(flipped, width, height), 0, 0);
        return await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });
      } finally {
        gl.setRenderTarget(previousTarget);
        gl.xr.enabled = previousXrEnabled;
        renderTarget.dispose();
      }
    };

    onCaptureReady(capture);
    return () => onCaptureReady(null);
  }, [camera, gl, onCaptureReady, scene]);

  return null;
}

function FpsProbe({
  enabled,
  onFpsUpdate,
}: {
  enabled: boolean;
  onFpsUpdate?: (fps: number) => void;
}) {
  const elapsedRef = useRef(0);
  const framesRef = useRef(0);

  useEffect(() => {
    if (!enabled && onFpsUpdate) {
      onFpsUpdate(0);
    }
  }, [enabled, onFpsUpdate]);

  useFrame((_, delta) => {
    if (!enabled || !onFpsUpdate) {
      return;
    }

    elapsedRef.current += delta;
    framesRef.current += 1;
    if (elapsedRef.current >= 0.5) {
      onFpsUpdate(framesRef.current / Math.max(0.0001, elapsedRef.current));
      elapsedRef.current = 0;
      framesRef.current = 0;
    }
  });

  return null;
}

interface FovBound {
  key: string;
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;
}

const FOV_BUILDING_HOLD_SEC = 0.34;
const FOV_ROAD_HOLD_SEC = 0.24;
const FOV_DISTRICT_HOLD_SEC = 0.44;

function buildFovBounds(footprints: BuildingFootprint[]): FovBound[] {
  return footprints.map((footprint) => {
    const centerY = Math.max(0.45, footprint.topY * 0.42);
    const radius = Math.max(
      1.2,
      Math.hypot(footprint.width * 0.5, footprint.depth * 0.5, footprint.topY * 0.46) +
        2.4,
    );
    return {
      key: footprint.path,
      centerX: footprint.x,
      centerY,
      centerZ: footprint.z,
      radius,
    };
  });
}

function buildRoadFovBounds(segments: ImportRoadSegment[]): FovBound[] {
  return segments.map((segment) => {
    const radius = Math.max(
      1.8,
      segment.length * 0.52 + Math.max(segment.width, segment.glowWidth) * 6 + 1.2,
    );
    return {
      key: segment.id,
      centerX: segment.x,
      centerY: 0.22,
      centerZ: segment.z,
      radius,
    };
  });
}

function buildDistrictFovBounds(districts: DistrictInfo[]): FovBound[] {
  return districts.map((district) => ({
    key: district.folder,
    centerX: district.x,
    centerY: 0.35,
    centerZ: district.z,
    radius: Math.max(2.4, Math.hypot(district.width * 0.5, district.depth * 0.5) + 2.8),
  }));
}

function isFovSetEqual(
  prev: Set<string>,
  next: Set<string>,
): boolean {
  if (prev.size !== next.size) {
    return false;
  }

  for (const value of next) {
    if (!prev.has(value)) {
      return false;
    }
  }
  return true;
}

function applyFovVisibilityGrace(
  rawVisible: Set<string>,
  bounds: FovBound[],
  graceMap: Map<string, number>,
  sampleStepSec: number,
  holdSec: number,
): Set<string> {
  const nextVisible = new Set<string>();
  const validKeys = new Set<string>();

  for (let index = 0; index < bounds.length; index += 1) {
    const bound = bounds[index];
    if (!bound) {
      continue;
    }

    const key = bound.key;
    validKeys.add(key);

    if (rawVisible.has(key)) {
      graceMap.set(key, holdSec);
      nextVisible.add(key);
      continue;
    }

    const remaining = (graceMap.get(key) ?? 0) - sampleStepSec;
    if (remaining > 0) {
      graceMap.set(key, remaining);
      nextVisible.add(key);
    } else {
      graceMap.delete(key);
    }
  }

  for (const key of graceMap.keys()) {
    if (!validKeys.has(key)) {
      graceMap.delete(key);
    }
  }

  return nextVisible;
}

function FovVisibilityProbe({
  enabled,
  buildingBounds,
  roadBounds,
  districtBounds,
  selectedPath,
  hoveredPath,
  onBuildingsChange,
  onRoadsChange,
  onDistrictsChange,
}: {
  enabled: boolean;
  buildingBounds: FovBound[];
  roadBounds: FovBound[];
  districtBounds: FovBound[];
  selectedPath: string | null;
  hoveredPath: string | null;
  onBuildingsChange: (visiblePaths: Set<string> | null) => void;
  onRoadsChange: (visibleRoads: Set<string> | null) => void;
  onDistrictsChange: (visibleDistricts: Set<string> | null) => void;
}) {
  const { camera } = useThree();
  const frustumRef = useRef(new Frustum());
  const projectionRef = useRef(new Matrix4());
  const sphereRef = useRef(new Sphere(new Vector3(), 1));
  const elapsedRef = useRef(0);
  const previousBuildingSetRef = useRef<Set<string>>(new Set());
  const previousRoadSetRef = useRef<Set<string>>(new Set());
  const previousDistrictSetRef = useRef<Set<string>>(new Set());
  const buildingGraceRef = useRef<Map<string, number>>(new Map());
  const roadGraceRef = useRef<Map<string, number>>(new Map());
  const districtGraceRef = useRef<Map<string, number>>(new Map());
  const previousEnabledRef = useRef(enabled);

  useEffect(() => {
    if (!enabled) {
      previousBuildingSetRef.current = new Set();
      previousRoadSetRef.current = new Set();
      previousDistrictSetRef.current = new Set();
      buildingGraceRef.current.clear();
      roadGraceRef.current.clear();
      districtGraceRef.current.clear();
      onBuildingsChange(null);
      onRoadsChange(null);
      onDistrictsChange(null);
    }
  }, [enabled, onBuildingsChange, onDistrictsChange, onRoadsChange]);

  const collectVisibleKeys = useCallback(
    (bounds: FovBound[], nearPadding: number): Set<string> => {
      const visible = new Set<string>();
      for (let index = 0; index < bounds.length; index += 1) {
        const bound = bounds[index];
        if (!bound) {
          continue;
        }

        sphereRef.current.center.set(bound.centerX, bound.centerY, bound.centerZ);
        sphereRef.current.radius = bound.radius;

        if (frustumRef.current.intersectsSphere(sphereRef.current)) {
          visible.add(bound.key);
          continue;
        }

        const distanceToCamera = camera.position.distanceTo(sphereRef.current.center);
        if (distanceToCamera < bound.radius + nearPadding) {
          visible.add(bound.key);
        }
      }
      return visible;
    },
    [camera],
  );

  useFrame((_, delta) => {
    if (!enabled) {
      return;
    }

    elapsedRef.current += delta;
    if (elapsedRef.current < 0.12) {
      return;
    }
    const sampleStepSec = elapsedRef.current;
    elapsedRef.current = 0;

    camera.updateMatrixWorld();
    projectionRef.current.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustumRef.current.setFromProjectionMatrix(projectionRef.current);

    const rawVisibleBuildings = collectVisibleKeys(buildingBounds, 12);
    const rawVisibleRoads = collectVisibleKeys(roadBounds, 16);
    const rawVisibleDistricts = collectVisibleKeys(districtBounds, 18);
    const nextVisibleBuildings = applyFovVisibilityGrace(
      rawVisibleBuildings,
      buildingBounds,
      buildingGraceRef.current,
      sampleStepSec,
      FOV_BUILDING_HOLD_SEC,
    );
    const nextVisibleRoads = applyFovVisibilityGrace(
      rawVisibleRoads,
      roadBounds,
      roadGraceRef.current,
      sampleStepSec,
      FOV_ROAD_HOLD_SEC,
    );
    const nextVisibleDistricts = applyFovVisibilityGrace(
      rawVisibleDistricts,
      districtBounds,
      districtGraceRef.current,
      sampleStepSec,
      FOV_DISTRICT_HOLD_SEC,
    );

    if (selectedPath) {
      nextVisibleBuildings.add(selectedPath);
    }
    if (hoveredPath) {
      nextVisibleBuildings.add(hoveredPath);
    }

    const modeChanged = previousEnabledRef.current !== enabled;
    previousEnabledRef.current = enabled;
    if (
      modeChanged ||
      !isFovSetEqual(previousBuildingSetRef.current, nextVisibleBuildings)
    ) {
      previousBuildingSetRef.current = nextVisibleBuildings;
      onBuildingsChange(nextVisibleBuildings);
    }
    if (modeChanged || !isFovSetEqual(previousRoadSetRef.current, nextVisibleRoads)) {
      previousRoadSetRef.current = nextVisibleRoads;
      onRoadsChange(nextVisibleRoads);
    }
    if (
      modeChanged ||
      !isFovSetEqual(previousDistrictSetRef.current, nextVisibleDistricts)
    ) {
      previousDistrictSetRef.current = nextVisibleDistricts;
      onDistrictsChange(nextVisibleDistricts);
    }
  });

  return null;
}

function AdaptivePerformanceProbe({
  enabled,
  adaptive,
  targetFps,
  renderProfileLock,
  onQualityChange,
  onRuntimeProfileChange,
  onDprChange,
  onLoadScaleChange,
  onTelemetry,
}: {
  enabled: boolean;
  adaptive: boolean;
  targetFps: 30 | 45 | 60;
  renderProfileLock: 'auto' | 'cinematic' | 'balanced' | 'performance';
  onQualityChange: (quality: PostFxQuality) => void;
  onRuntimeProfileChange: (profile: RuntimeQualityProfile) => void;
  onDprChange: (dpr: number) => void;
  onLoadScaleChange: (scale: number) => void;
  onTelemetry: (telemetry: ScenePerformanceTelemetry) => void;
}) {
  const elapsedRef = useRef(0);
  const framesRef = useRef(0);
  const qualityRef = useRef<PostFxQuality>('high');
  const profileRef = useRef<RuntimeQualityProfile>('cinematic');
  const dprRef = useRef(1.45);
  const loadScaleRef = useRef(1);
  const emaFpsRef = useRef<number | null>(null);
  const cooldownRef = useRef(0);
  const desiredFps = Math.max(30, Math.min(60, targetFps));
  const lockedProfile = renderProfileLock === 'auto' ? null : renderProfileLock;
  const thresholds = useMemo(() => {
    const forcePerformance = Math.max(18, desiredFps - 15);
    const profileCinematicDown = Math.max(24, desiredFps - 10);
    const profileBalancedDown = Math.max(20, desiredFps - 14);
    const profilePerformanceUp = desiredFps - 4;
    const profileBalancedUp = desiredFps + 6;

    const qualityHighDown = desiredFps - 4;
    const qualityMediumDown = Math.max(20, desiredFps - 12);
    const qualityLowUp = desiredFps - 2;
    const qualityMediumUp = desiredFps + 10;

    const dprLower = desiredFps - 10;
    const dprUpper = desiredFps + 11;

    const dropOffsets = [-23, -19, -15, -11, -5, 3];
    const riseOffsets = [-21, -16, -12, -7, 0, 8];
    const dropFloors = [18, 22, 26, 30, 34, 42];
    const riseFloors = [20, 24, 28, 32, 38, 46];
    const loadDrop = dropOffsets.map((offset, index) =>
      Math.max(dropFloors[index] ?? 18, desiredFps + offset),
    );
    const loadRise = riseOffsets.map((offset, index) =>
      Math.max(riseFloors[index] ?? 20, desiredFps + offset),
    );

    return {
      forcePerformance,
      profileCinematicDown,
      profileBalancedDown,
      profilePerformanceUp,
      profileBalancedUp,
      qualityHighDown,
      qualityMediumDown,
      qualityLowUp,
      qualityMediumUp,
      dprLower,
      dprUpper,
      loadDrop,
      loadRise,
    };
  }, [desiredFps]);

  useEffect(() => {
    const initialProfile: RuntimeQualityProfile = lockedProfile ?? 'cinematic';
    const initialQuality: PostFxQuality =
      initialProfile === 'cinematic'
        ? 'high'
        : initialProfile === 'balanced'
          ? 'medium'
          : 'low';
    const initialDpr = initialProfile === 'cinematic' ? 1.45 : initialProfile === 'balanced' ? 1.1 : 0.92;
    const initialLoadScale = 1;
    elapsedRef.current = 0;
    framesRef.current = 0;
    qualityRef.current = initialQuality;
    profileRef.current = initialProfile;
    dprRef.current = initialDpr;
    loadScaleRef.current = initialLoadScale;
    emaFpsRef.current = null;
    cooldownRef.current = 0;
    onQualityChange(initialQuality);
    onRuntimeProfileChange(initialProfile);
    onDprChange(initialDpr);
    onLoadScaleChange(initialLoadScale);
    onTelemetry({
      fps: 0,
      runtimeProfile: initialProfile,
      postFxQuality: initialQuality,
      adaptiveDpr: initialDpr,
      adaptiveLoadScale: initialLoadScale,
      fovBuildingCoverage: 1,
      fovRoadCoverage: 1,
      fovDistrictCoverage: 1,
    });
  }, [
    adaptive,
    enabled,
    desiredFps,
    lockedProfile,
    onDprChange,
    onLoadScaleChange,
    onQualityChange,
    onRuntimeProfileChange,
    onTelemetry,
  ]);

  useFrame((_, delta) => {
    if (!enabled) {
      return;
    }

    elapsedRef.current += delta;
    framesRef.current += 1;

    if (elapsedRef.current < 0.75) {
      return;
    }

    const sampleFps = framesRef.current / Math.max(0.001, elapsedRef.current);
    framesRef.current = 0;
    elapsedRef.current = 0;

    emaFpsRef.current =
      emaFpsRef.current === null
        ? sampleFps
        : emaFpsRef.current * 0.72 + sampleFps * 0.28;
    const smoothFps = emaFpsRef.current;

    const coolingDown =
      cooldownRef.current > 0 && smoothFps > thresholds.forcePerformance;
    if (coolingDown) {
      cooldownRef.current = Math.max(0, cooldownRef.current - 0.75);
      onTelemetry({
        fps: smoothFps,
        runtimeProfile: profileRef.current,
        postFxQuality: qualityRef.current,
        adaptiveDpr: dprRef.current,
        adaptiveLoadScale: loadScaleRef.current,
        fovBuildingCoverage: 1,
        fovRoadCoverage: 1,
        fovDistrictCoverage: 1,
      });
      return;
    }
    cooldownRef.current = Math.max(0, cooldownRef.current - 0.75);

    const allowUpgrades = adaptive && !lockedProfile;
    const currentQuality = qualityRef.current;
    const currentProfile = profileRef.current;
    const currentDpr = dprRef.current;

    let nextQuality = currentQuality;
    let nextProfile = currentProfile;
    let nextLoadScale = loadScaleRef.current;

    if (smoothFps < thresholds.forcePerformance) {
      nextProfile = 'performance';
      nextQuality = 'low';
    } else {
      if (currentProfile === 'cinematic') {
        if (smoothFps < thresholds.profileCinematicDown) {
          nextProfile = 'balanced';
        }
      } else if (currentProfile === 'balanced') {
        if (smoothFps < thresholds.profileBalancedDown) {
          nextProfile = 'performance';
        } else if (allowUpgrades && smoothFps > thresholds.profileBalancedUp) {
          nextProfile = 'cinematic';
        }
      } else if (allowUpgrades && smoothFps > thresholds.profilePerformanceUp) {
        nextProfile = 'balanced';
      }

      if (currentQuality === 'high') {
        if (smoothFps < thresholds.qualityHighDown) {
          nextQuality = 'medium';
        }
      } else if (currentQuality === 'medium') {
        if (smoothFps < thresholds.qualityMediumDown) {
          nextQuality = 'low';
        } else if (allowUpgrades && smoothFps > thresholds.qualityMediumUp) {
          nextQuality = 'high';
        }
      } else if (allowUpgrades && smoothFps > thresholds.qualityLowUp) {
        nextQuality = 'medium';
      }
    }
    if (lockedProfile) {
      nextProfile = lockedProfile;
    }

    const profileQuality: PostFxQuality =
      nextProfile === 'cinematic'
        ? 'high'
        : nextProfile === 'balanced'
          ? 'medium'
          : 'low';
    nextQuality = minQuality(nextQuality, profileQuality);

    let nextDpr = nextProfile === 'cinematic' ? 1.4 : nextProfile === 'balanced' ? 1.1 : 0.92;
    if (smoothFps < thresholds.dprLower) {
      nextDpr = Math.min(nextDpr, 1);
    } else if (
      allowUpgrades &&
      smoothFps > thresholds.dprUpper &&
      nextProfile === 'cinematic'
    ) {
      nextDpr = 1.45;
    }

    if (!adaptive) {
      nextLoadScale = 1;
    } else {
      let levelIndex = loadScaleLevelIndex(loadScaleRef.current);

      while (
        levelIndex > 0 &&
        smoothFps < (thresholds.loadDrop[levelIndex - 1] ?? 0)
      ) {
        levelIndex -= 1;
      }

      if (allowUpgrades) {
        while (
          levelIndex < loadScaleLevels.length - 1 &&
          smoothFps > (thresholds.loadRise[levelIndex] ?? Number.POSITIVE_INFINITY)
        ) {
          levelIndex += 1;
        }
      }

      nextLoadScale = loadScaleLevels[levelIndex] ?? 1;
    }

    if (nextProfile === 'performance') {
      nextLoadScale = Math.min(nextLoadScale, 0.68);
    } else if (nextProfile === 'balanced') {
      nextLoadScale = Math.min(nextLoadScale, 0.86);
    }

    const qualityChanged = nextQuality !== currentQuality;
    const profileChanged = nextProfile !== currentProfile;
    const dprChanged = Math.abs(nextDpr - currentDpr) > 0.03;
    const loadScaleChanged = Math.abs(nextLoadScale - loadScaleRef.current) > 0.02;

    if (qualityChanged) {
      qualityRef.current = nextQuality;
      onQualityChange(nextQuality);
    }
    if (profileChanged) {
      profileRef.current = nextProfile;
      onRuntimeProfileChange(nextProfile);
    }
    if (dprChanged) {
      dprRef.current = nextDpr;
      onDprChange(nextDpr);
    }
    if (loadScaleChanged) {
      loadScaleRef.current = nextLoadScale;
      onLoadScaleChange(nextLoadScale);
    }

    const effectiveProfile = profileChanged ? nextProfile : currentProfile;
    const effectiveQuality = qualityChanged ? nextQuality : currentQuality;
    const effectiveDpr = dprChanged ? nextDpr : currentDpr;
    const effectiveLoadScale = loadScaleChanged ? nextLoadScale : loadScaleRef.current;

    onTelemetry({
      fps: smoothFps,
      runtimeProfile: effectiveProfile,
      postFxQuality: effectiveQuality,
      adaptiveDpr: effectiveDpr,
      adaptiveLoadScale: effectiveLoadScale,
      fovBuildingCoverage: 1,
      fovRoadCoverage: 1,
      fovDistrictCoverage: 1,
    });

    if (
      smoothFps < Math.max(30, desiredFps - 9) ||
      qualityChanged ||
      profileChanged ||
      loadScaleChanged
    ) {
      cooldownRef.current = 2.2;
    }
  });

  return null;
}

export const Scene3D = memo(function Scene3D({
  files,
  imports,
  branches,
  stack,
  dna,
  insights,
  riskByPath,
  hoveredPath,
  selectedPath,
  viewMode,
  compareEnabled,
  compareMode,
  compareFiles,
  autoTour,
  showAtmosphere,
  showWeather,
  showBuilders,
  showPostProcessing,
  adaptivePostFx,
  modePresetIntensity,
  coasterIntensity,
  visualPreset,
  targetFps,
  renderProfileLock,
  showFps,
  tourMode,
  followDroneIndex,
  livePointers,
  timeOfDay,
  weatherMode,
  totalCommitsByPath,
  constructionWindowByPath,
  constructionMode,
  constructionProgress,
  coasterProfile,
  coasterControlInput,
  musicSpectrum,
  onHover,
  onSelect,
  onCaptureReady,
  onFpsUpdate,
  onPerformanceTelemetry,
  onFollowDroneChange,
  onWalkBuildingChange,
  onCoasterTelemetry,
  onPointerSample,
}: Scene3DProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const layoutAnchorsRef = useRef<Map<string, LayoutAnchorPoint>>(new Map());
  const coasterCameraPoseRef = useRef<CoasterCameraPose | null>(null);
  const coasterTelemetryRef = useRef<{
    timestamp: number;
    telemetry: CoasterTelemetry | null;
  }>({
    timestamp: 0,
    telemetry: null,
  });
  const architectureMode = viewMode === 'architecture';
  const riskMode = viewMode === 'risk';
  const stackMode = viewMode === 'stack';
  const overviewMode = viewMode === 'overview';
  const [adaptiveQuality, setAdaptiveQuality] = useState<PostFxQuality>('high');
  const [runtimeProfile, setRuntimeProfile] =
    useState<RuntimeQualityProfile>('cinematic');
  const [adaptiveDpr, setAdaptiveDpr] = useState(1.45);
  const [adaptiveLoadScale, setAdaptiveLoadScale] = useState(1);
  const [runtimeFps, setRuntimeFps] = useState(0);
  const [visibleBuildingPaths, setVisibleBuildingPaths] = useState<Set<string> | null>(null);
  const [visibleRoadIds, setVisibleRoadIds] = useState<Set<string> | null>(null);
  const [visibleDistrictFolders, setVisibleDistrictFolders] = useState<Set<string> | null>(null);
  const modePreset = useMemo(() => getSceneModePreset(viewMode), [viewMode]);
  const cinematicIntensity = Math.max(0.55, Math.min(1.8, modePresetIntensity));
  const cinematicPopulationScale = 1 + (cinematicIntensity - 1) * 0.6;
  const visualPresetPopulationScale =
    visualPreset === 'immersive'
      ? 1.12
      : visualPreset === 'performance'
        ? 0.74
        : 1;
  const visualPresetQualityCap: PostFxQuality =
    visualPreset === 'immersive'
      ? 'high'
      : visualPreset === 'performance'
        ? 'low'
        : 'medium';
  const visualPresetDprCap =
    visualPreset === 'immersive'
      ? 1.45
      : visualPreset === 'performance'
        ? 1.02
        : 1.2;
  const visualPresetLoadCap =
    visualPreset === 'immersive'
      ? 1
      : visualPreset === 'performance'
        ? 0.82
        : 0.94;
  const tunedCameraFov = blendFromBase(48, modePreset.cameraFov, cinematicIntensity);
  const tunedOrbitAutoRotateSpeed = blendFromBase(
    0.42,
    modePreset.orbitAutoRotateSpeed,
    cinematicIntensity,
  );
  const tunedOrbitMinDistance = blendFromBase(
    8,
    modePreset.orbitMinDistance,
    cinematicIntensity,
  );
  const tunedOrbitMaxDistance = blendFromBase(
    190,
    modePreset.orbitMaxDistance,
    cinematicIntensity,
  );
  const tunedOrbitDamping = blendFromBase(
    0.06,
    modePreset.orbitDamping,
    cinematicIntensity,
  );
  const tunedOrbitMaxPolarAngle = blendFromBase(
    Math.PI / 2.03,
    modePreset.orbitMaxPolarAngle,
    cinematicIntensity,
  );
  const tunedOrbitFocusLerp = blendFromBase(
    0.06,
    modePreset.orbitFocusLerp,
    cinematicIntensity,
  );
  const tunedOrbitCameraLerp = blendFromBase(
    0.035,
    modePreset.orbitCameraLerp,
    cinematicIntensity,
  );
  const tunedAutoTourCadenceSec = blendFromBase(
    6,
    modePreset.autoTourCadenceSec,
    cinematicIntensity,
  );
  const tunedSelectedCameraOffset = useMemo<[number, number, number]>(
    () => [
      blendFromBase(8, modePreset.selectedCameraOffset[0], cinematicIntensity),
      blendFromBase(8, modePreset.selectedCameraOffset[1], cinematicIntensity),
      blendFromBase(8, modePreset.selectedCameraOffset[2], cinematicIntensity),
    ],
    [cinematicIntensity, modePreset.selectedCameraOffset],
  );
  const tunedTourCameraOffset = useMemo<[number, number, number]>(
    () => [
      blendFromBase(10, modePreset.tourCameraOffset[0], cinematicIntensity),
      blendFromBase(10, modePreset.tourCameraOffset[1], cinematicIntensity),
      blendFromBase(10, modePreset.tourCameraOffset[2], cinematicIntensity),
    ],
    [cinematicIntensity, modePreset.tourCameraOffset],
  );
  const tunedEventIntensityBoost = blendFromBase(
    1,
    modePreset.eventIntensityBoost,
    cinematicIntensity,
  );

  const sceneFiles = useMemo(() => {
    const layoutFiles = buildCityLayout(files, dna);
    return stabilizeLayoutFiles(layoutFiles, layoutAnchorsRef.current, true);
  }, [files, dna]);
  const compareSceneFiles = useMemo(
    () => {
      const layoutFiles = buildCityLayout(compareFiles, dna);
      return stabilizeLayoutFiles(layoutFiles, layoutAnchorsRef.current, false);
    },
    [compareFiles, dna],
  );

  const palette = dna?.palette ?? {
    sky: '#d6ecff',
    fog: '#c8e3ff',
    ground: '#deebff',
    gridCell: '#9cbce8',
    gridSection: '#78a5e2',
    sun: '#ff8ecb',
    accent: '#2ec8ff',
    districtSaturation: 56,
    districtLightness: 62,
  };
  const resolvedTimeOfDay = useMemo<ResolvedTimeOfDay>(
    () => resolveTimeOfDay(timeOfDay, dna?.seed ?? 42),
    [dna?.seed, timeOfDay],
  );
  const resolvedWeather = useMemo<ResolvedWeather>(
    () => resolveWeatherMode(weatherMode, dna),
    [dna, weatherMode],
  );
  const sceneAccentColor = useMemo(
    () =>
      blendHex(
        palette.accent,
        modePreset.accent,
        Math.max(0.35, Math.min(0.9, 0.36 + cinematicIntensity * 0.26)),
      ),
    [cinematicIntensity, modePreset.accent, palette.accent],
  );
  const atmospherePreset = useMemo<AtmospherePreset>(() => {
    const byTime: Record<
      ResolvedTimeOfDay,
      {
        sky: string;
        fog: string;
        ambient: number;
        hemisphere: number;
        directional: number;
        pointAccent: number;
        pointSun: number;
        fogNear: number;
        fogFar: number;
        exposure: number;
      }
    > = {
      dawn: {
        sky: '#0c2041',
        fog: '#184167',
        ambient: 0.34,
        hemisphere: 0.5,
        directional: 0.48,
        pointAccent: 0.5,
        pointSun: 0.34,
        fogNear: 34,
        fogFar: 220,
        exposure: 0.81,
      },
      day: {
        sky: palette.sky,
        fog: palette.fog,
        ambient: 0.31,
        hemisphere: 0.42,
        directional: 0.54,
        pointAccent: 0.4,
        pointSun: 0.36,
        fogNear: 42,
        fogFar: 220,
        exposure: 0.76,
      },
      sunset: {
        sky: '#0b2044',
        fog: '#163b66',
        ambient: 0.29,
        hemisphere: 0.43,
        directional: 0.45,
        pointAccent: 0.58,
        pointSun: 0.54,
        fogNear: 32,
        fogFar: 205,
        exposure: 0.83,
      },
      night: {
        sky: '#0d1730',
        fog: '#1b2d4f',
        ambient: 0.14,
        hemisphere: 0.24,
        directional: 0.22,
        pointAccent: 0.88,
        pointSun: 0.62,
        fogNear: 20,
        fogFar: 168,
        exposure: 0.96,
      },
    };

    const base = byTime[resolvedTimeOfDay];
    const weatherModifiers: Record<
      ResolvedWeather,
      {
        fogNearScale: number;
        fogFarScale: number;
        ambientScale: number;
        directionalScale: number;
        pointBoost: number;
        exposureScale: number;
        wetnessBoost: number;
      }
    > = {
      clear: {
        fogNearScale: 1,
        fogFarScale: 1,
        ambientScale: 0.96,
        directionalScale: 0.95,
        pointBoost: 0.96,
        exposureScale: 0.93,
        wetnessBoost: 0,
      },
      mist: {
        fogNearScale: 0.78,
        fogFarScale: 0.74,
        ambientScale: 0.96,
        directionalScale: 0.86,
        pointBoost: 1.08,
        exposureScale: 0.94,
        wetnessBoost: 0.12,
      },
      rain: {
        fogNearScale: 0.68,
        fogFarScale: 0.62,
        ambientScale: 0.92,
        directionalScale: 0.74,
        pointBoost: 1.14,
        exposureScale: 0.9,
        wetnessBoost: 0.22,
      },
      storm: {
        fogNearScale: 0.58,
        fogFarScale: 0.5,
        ambientScale: 0.86,
        directionalScale: 0.56,
        pointBoost: 1.28,
        exposureScale: 0.86,
        wetnessBoost: 0.34,
      },
    };
    const weather = weatherModifiers[resolvedWeather];

    return {
      sky: base.sky,
      fog: base.fog,
      ambient:
        base.ambient *
        weather.ambientScale *
        blendFromBase(1, modePreset.lightingAmbientScale, cinematicIntensity),
      hemisphere:
        base.hemisphere *
        weather.ambientScale *
        blendFromBase(1, modePreset.lightingAmbientScale, cinematicIntensity),
      directional:
        base.directional *
        weather.directionalScale *
        blendFromBase(1, modePreset.lightingDirectionalScale, cinematicIntensity),
      pointAccent:
        base.pointAccent *
        weather.pointBoost *
        blendFromBase(1, modePreset.lightingPointScale, cinematicIntensity),
      pointSun:
        base.pointSun *
        weather.pointBoost *
        blendFromBase(1, modePreset.lightingPointScale, cinematicIntensity),
      fogNear: Math.max(
        12,
        base.fogNear *
          weather.fogNearScale *
          blendFromBase(1, modePreset.lightingFogNearScale, cinematicIntensity),
      ),
      fogFar: Math.max(
        85,
        base.fogFar *
          weather.fogFarScale *
          blendFromBase(1, modePreset.lightingFogFarScale, cinematicIntensity),
      ),
      exposure: Math.max(0.68, Math.min(0.98, base.exposure * weather.exposureScale)),
      wetnessBoost: weather.wetnessBoost,
    };
  }, [
    cinematicIntensity,
    modePreset.lightingAmbientScale,
    modePreset.lightingDirectionalScale,
    modePreset.lightingFogFarScale,
    modePreset.lightingFogNearScale,
    modePreset.lightingPointScale,
    palette.fog,
    palette.sky,
    resolvedTimeOfDay,
    resolvedWeather,
  ]);

  const districtInfo = useMemo<DistrictInfo[]>(() => {
    const map = new Map<
      string,
      {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
        sumX: number;
        sumZ: number;
        count: number;
      }
    >();

    sceneFiles.forEach((file) => {
      const existing = map.get(file.folder);
      const minX = file.x - file.width / 2 - 1;
      const maxX = file.x + file.width / 2 + 1;
      const minZ = file.z - file.depth / 2 - 1;
      const maxZ = file.z + file.depth / 2 + 1;

      if (!existing) {
        map.set(file.folder, {
          minX,
          maxX,
          minZ,
          maxZ,
          sumX: file.x,
          sumZ: file.z,
          count: 1,
        });
        return;
      }

      existing.minX = Math.min(existing.minX, minX);
      existing.maxX = Math.max(existing.maxX, maxX);
      existing.minZ = Math.min(existing.minZ, minZ);
      existing.maxZ = Math.max(existing.maxZ, maxZ);
      existing.sumX += file.x;
      existing.sumZ += file.z;
      existing.count += 1;
    });

    const hueOffset = dna ? dna.seed % 360 : 0;
    const baseDistricts = Array.from(map.entries())
      .sort(([leftFolder], [rightFolder]) => leftFolder.localeCompare(rightFolder))
      .map(([folder, bounds]) => {
        const fallbackX = (bounds.minX + bounds.maxX) / 2;
        const fallbackZ = (bounds.minZ + bounds.maxZ) / 2;
        const centroidX =
          bounds.count > 0 ? bounds.sumX / bounds.count : fallbackX;
        const centroidZ =
          bounds.count > 0 ? bounds.sumZ / bounds.count : fallbackZ;
        return {
          folder,
          x: Number.isFinite(centroidX) ? centroidX : fallbackX,
          z: Number.isFinite(centroidZ) ? centroidZ : fallbackZ,
          targetX: Number.isFinite(centroidX) ? centroidX : fallbackX,
          targetZ: Number.isFinite(centroidZ) ? centroidZ : fallbackZ,
          width: Math.max(6.5, bounds.maxX - bounds.minX),
          depth: Math.max(6.5, bounds.maxZ - bounds.minZ),
        };
      });

    const resolvedDistricts = baseDistricts.map((district) => ({ ...district }));
    const overlapPadding = 1.35;
    const maxIterations = 26;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let touched = false;

      for (let leftIndex = 0; leftIndex < resolvedDistricts.length; leftIndex += 1) {
        const left = resolvedDistricts[leftIndex];
        if (!left) {
          continue;
        }

        for (let rightIndex = leftIndex + 1; rightIndex < resolvedDistricts.length; rightIndex += 1) {
          const right = resolvedDistricts[rightIndex];
          if (!right) {
            continue;
          }

          const dx = right.x - left.x;
          const dz = right.z - left.z;
          const minDx = (left.width + right.width) * 0.5 + overlapPadding;
          const minDz = (left.depth + right.depth) * 0.5 + overlapPadding;
          const overlapX = minDx - Math.abs(dx);
          const overlapZ = minDz - Math.abs(dz);

          if (overlapX <= 0 || overlapZ <= 0) {
            continue;
          }

          touched = true;
          if (overlapX < overlapZ) {
            const direction = dx === 0 ? (leftIndex % 2 === 0 ? 1 : -1) : Math.sign(dx);
            const shift = overlapX * 0.52;
            left.x -= direction * shift * 0.5;
            right.x += direction * shift * 0.5;
          } else {
            const direction = dz === 0 ? (rightIndex % 2 === 0 ? 1 : -1) : Math.sign(dz);
            const shift = overlapZ * 0.52;
            left.z -= direction * shift * 0.5;
            right.z += direction * shift * 0.5;
          }
        }
      }

      resolvedDistricts.forEach((district) => {
        district.x += (district.targetX - district.x) * 0.08;
        district.z += (district.targetZ - district.z) * 0.08;
      });

      if (!touched) {
        break;
      }
    }

    return resolvedDistricts.map((district, index) => {
      const { folder, x, z, width, depth } = district;
      const archetype = detectDistrictArchetype(folder);
      const archetypeVisual = getArchetypeVisual(archetype);
      const angle = ((dna?.seed ?? 42) % 360) * (Math.PI / 180) + index * 0.37;

      return {
        folder,
        label: folderLabel(folder),
        archetype,
        archetypeLabel: archetypeVisual.label,
        archetypeAccent: archetypeVisual.accent,
        gateX: x + Math.cos(angle) * (width * 0.5 + 1.5),
        gateZ: z + Math.sin(angle) * (depth * 0.5 + 1.5),
        gateAngle: angle,
        x,
        z,
        width,
        depth,
        color: folderToDistrictColor(
          folder,
          hueOffset,
          palette.districtSaturation,
          palette.districtLightness,
        ),
      };
    });
  }, [dna, palette.districtLightness, palette.districtSaturation, sceneFiles]);

  const districtColorMap = useMemo(() => {
    return new Map(districtInfo.map((item) => [item.folder, item.color]));
  }, [districtInfo]);

  const districtMap = useMemo(() => {
    return new Map(districtInfo.map((item) => [item.folder, item]));
  }, [districtInfo]);

  const districtRiskMap = useMemo(() => {
    const aggregate = new Map<string, { total: number; count: number }>();

    sceneFiles.forEach((file) => {
      const risk = riskByPath.get(file.path)?.risk ?? 0;
      const entry = aggregate.get(file.folder) ?? { total: 0, count: 0 };
      entry.total += risk;
      entry.count += 1;
      aggregate.set(file.folder, entry);
    });

    const result = new Map<string, number>();
    aggregate.forEach((entry, folder) => {
      result.set(folder, entry.count === 0 ? 0 : entry.total / entry.count);
    });

    return result;
  }, [riskByPath, sceneFiles]);

  const cityBounds = useMemo(() => {
    if (sceneFiles.length === 0) {
      return {
        centerX: 20,
        centerZ: 20,
        size: 120,
      };
    }

    const xs = sceneFiles
      .map((file) => finiteNumber(file.x, Number.NaN))
      .filter((value) => Number.isFinite(value));
    const zs = sceneFiles
      .map((file) => finiteNumber(file.z, Number.NaN))
      .filter((value) => Number.isFinite(value));
    if (xs.length === 0 || zs.length === 0) {
      return {
        centerX: 20,
        centerZ: 20,
        size: 120,
      };
    }

    const minX = Math.min(...xs) - 12;
    const maxX = Math.max(...xs) + 12;
    const minZ = Math.min(...zs) - 12;
    const maxZ = Math.max(...zs) + 12;

    const width = maxX - minX;
    const depth = maxZ - minZ;

    return {
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      size: Math.max(120, finiteNumber(width, 120), finiteNumber(depth, 120)),
    };
  }, [sceneFiles]);

  const hotspotPaths = useMemo(() => {
    const ranked = [...sceneFiles].sort((a, b) => {
      const scoreA = a.commits.length * 2 + a.totalChanges * 0.01;
      const scoreB = b.commits.length * 2 + b.totalChanges * 0.01;
      return scoreB - scoreA;
    });

    return new Set(ranked.slice(0, 14).map((item) => item.path));
  }, [sceneFiles]);

  const buildingMoodMap = useMemo(() => {
    return new Map(sceneFiles.map((file) => [file.path, classifyBuildingMood(file)]));
  }, [sceneFiles]);

  const importanceMap = useMemo(() => {
    const weights = new Map<string, number>();

    imports.forEach((road) => {
      weights.set(road.from, (weights.get(road.from) ?? 0) + road.count);
      weights.set(road.to, (weights.get(road.to) ?? 0) + road.count * 1.05);
    });

    const maxWeight = Math.max(1, ...weights.values(), ...sceneFiles.map((file) => file.commits.length));
    const map = new Map<string, number>();

    sceneFiles.forEach((file) => {
      const weight = weights.get(file.path) ?? file.commits.length * 0.7;
      map.set(file.path, Math.min(1, weight / maxWeight));
    });

    return map;
  }, [imports, sceneFiles]);

  const buildingStyleMap = useMemo(() => {
    return new Map(sceneFiles.map((file) => [file.path, getBuildingStyle(file.path, dna)]));
  }, [dna, sceneFiles]);
  const stackLayerColorMap = useMemo(() => {
    return new Map(
      sceneFiles.map((file) => [file.path, stackLayerColor(inferStackLayer(file.path))]),
    );
  }, [sceneFiles]);

  const visualHeightMap = useMemo(() => {
    const map = new Map<string, number>();

    sceneFiles.forEach((file) => {
      const floors = compactFloors(file.commits);
      const height = floors.reduce((sum, floor) => {
        const floorY = floorHeight(floor.changes);
        return sum + (Number.isFinite(floorY) ? floorY : 0.35);
      }, 0);
      map.set(file.path, Math.max(0.5, finiteNumber(height, 0.5)));
    });

    return map;
  }, [sceneFiles]);
  const buildingFootprints = useMemo<BuildingFootprint[]>(() => {
    return sceneFiles.map((file) => ({
      path: file.path,
      x: finiteNumber(file.x, 0),
      z: finiteNumber(file.z, 0),
      width: Math.max(0.6, Math.abs(finiteNumber(file.width, 3.2))),
      depth: Math.max(0.6, Math.abs(finiteNumber(file.depth, 3.2))),
      topY: Math.max(0.2, finiteNumber(visualHeightMap.get(file.path) ?? Number.NaN, 1.2)),
    }));
  }, [sceneFiles, visualHeightMap]);
  const buildingFovBounds = useMemo(
    () => buildFovBounds(buildingFootprints),
    [buildingFootprints],
  );
  const districtFovBounds = useMemo(
    () => buildDistrictFovBounds(districtInfo),
    [districtInfo],
  );
  const renderableFiles = useMemo(() => {
    if (!visibleBuildingPaths) {
      return sceneFiles;
    }
    return sceneFiles.filter((file) => visibleBuildingPaths.has(file.path));
  }, [sceneFiles, visibleBuildingPaths]);
  const renderableBuildingFootprints = useMemo(() => {
    if (!visibleBuildingPaths) {
      return buildingFootprints;
    }
    return buildingFootprints.filter((footprint) => visibleBuildingPaths.has(footprint.path));
  }, [buildingFootprints, visibleBuildingPaths]);
  const renderableDistrictInfo = useMemo(() => {
    if (!visibleDistrictFolders) {
      return districtInfo;
    }
    return districtInfo.filter((district) => visibleDistrictFolders.has(district.folder));
  }, [districtInfo, visibleDistrictFolders]);
  const visibleBuildingCoverage = useMemo(() => {
    if (sceneFiles.length === 0) {
      return 1;
    }
    return Math.max(0, Math.min(1, renderableFiles.length / sceneFiles.length));
  }, [renderableFiles.length, sceneFiles.length]);
  const visibleDistrictCoverage = useMemo(() => {
    if (districtInfo.length === 0) {
      return 1;
    }
    return Math.max(0, Math.min(1, renderableDistrictInfo.length / districtInfo.length));
  }, [districtInfo.length, renderableDistrictInfo.length]);
  const handleVisiblePathsChange = useCallback((paths: Set<string> | null) => {
    setVisibleBuildingPaths(paths ? new Set(paths) : null);
  }, []);
  const handleVisibleRoadsChange = useCallback((ids: Set<string> | null) => {
    setVisibleRoadIds(ids ? new Set(ids) : null);
  }, []);
  const handleVisibleDistrictsChange = useCallback((folders: Set<string> | null) => {
    setVisibleDistrictFolders(folders ? new Set(folders) : null);
  }, []);
  useEffect(() => {
    setVisibleBuildingPaths(null);
  }, [sceneFiles]);
  useEffect(() => {
    setVisibleDistrictFolders(null);
  }, [districtInfo]);
  const totalFloorCount = useMemo(
    () => sceneFiles.reduce((sum, file) => sum + file.commits.length, 0),
    [sceneFiles],
  );
  const maxRenderedFloors = useMemo(() => {
    if (totalFloorCount > 32000) {
      return 26;
    }
    if (totalFloorCount > 22000) {
      return 34;
    }
    if (totalFloorCount > 14000) {
      return 44;
    }
    if (totalFloorCount > 9000) {
      return 56;
    }

    return 68;
  }, [totalFloorCount]);
  const heavySceneComplexity =
    sceneFiles.length > 320 || totalFloorCount > 5200;
  const runtimeQuality: PostFxQuality =
    runtimeProfile === 'performance'
      ? 'low'
      : runtimeProfile === 'balanced'
        ? 'medium'
        : 'high';
  const sceneQualityCap: PostFxQuality =
    heavySceneComplexity && runtimeQuality === 'high' ? 'medium' : runtimeQuality;
  const postFxBaseQuality: PostFxQuality =
    showPostProcessing && adaptivePostFx ? adaptiveQuality : 'high';
  const postFxCappedQuality: PostFxQuality = minQuality(
    postFxBaseQuality,
    visualPresetQualityCap,
  );
  const postFxQuality: PostFxQuality = showPostProcessing
    ? minQuality(postFxCappedQuality, sceneQualityCap)
    : minQuality(sceneQualityCap, visualPresetQualityCap);
  const runtimeDensityScale =
    runtimeProfile === 'cinematic'
      ? 1
      : runtimeProfile === 'balanced'
        ? 0.72
        : 0.46;
  const runtimeAdaptiveScale = adaptivePostFx
    ? Math.max(0.44, Math.min(1, adaptiveLoadScale))
    : 1;
  const runtimePresetScale = Math.min(runtimeAdaptiveScale, visualPresetLoadCap);
  const runtimePopulationScale =
    cinematicPopulationScale *
    visualPresetPopulationScale *
    runtimeDensityScale *
    runtimePresetScale *
    (heavySceneComplexity ? 0.72 : 1);
  const maxVisibleBuildings = useMemo(() => {
    if (runtimeProfile === 'performance') {
      return heavySceneComplexity ? 180 : 240;
    }
    if (runtimeProfile === 'balanced') {
      return heavySceneComplexity ? 260 : 340;
    }
    return heavySceneComplexity ? 320 : 520;
  }, [heavySceneComplexity, runtimeProfile]);
  const displayedFiles = useMemo<PositionedFileHistory[]>(() => {
    if (renderableFiles.length <= maxVisibleBuildings) {
      return renderableFiles;
    }

    const pinnedPaths = new Set<string>();
    if (selectedPath) {
      pinnedPaths.add(selectedPath);
    }
    if (hoveredPath) {
      pinnedPaths.add(hoveredPath);
    }

    const pinned: PositionedFileHistory[] = [];
    const scored: Array<{ file: PositionedFileHistory; score: number }> = [];

    renderableFiles.forEach((file) => {
      if (pinnedPaths.has(file.path)) {
        pinned.push(file);
        return;
      }

      const baseImportance = importanceMap.get(file.path) ?? 0;
      const hotspotBoost = hotspotPaths.has(file.path) ? 0.55 : 0;
      const commitBoost = Math.min(
        0.35,
        Math.log10(Math.max(1, file.commits.length + 1)) * 0.18,
      );
      scored.push({
        file,
        score: baseImportance + hotspotBoost + commitBoost,
      });
    });

    scored.sort((left, right) => right.score - left.score);

    const budget = Math.max(pinned.length, maxVisibleBuildings);
    const tailBudget = Math.max(0, budget - pinned.length);
    return [...pinned, ...scored.slice(0, tailBudget).map((entry) => entry.file)];
  }, [
    hoveredPath,
    hotspotPaths,
    importanceMap,
    maxVisibleBuildings,
    renderableFiles,
    selectedPath,
  ]);
  const adaptiveCanvasDpr = Math.max(
    0.86,
    Math.min(
      visualPresetDprCap,
      heavySceneComplexity
        ? Math.min(adaptiveDpr, Math.min(1.1, visualPresetDprCap))
        : adaptiveDpr,
    ),
  );
  const performanceFpsFloor = Math.max(24, targetFps - 14);
  const musicReactiveEnabled = useMemo(() => {
    if (!musicSpectrum || !musicSpectrum.playing || !musicSpectrum.reactive) {
      return false;
    }
    if (runtimeProfile === 'performance') {
      return false;
    }
    if (runtimePresetScale < 0.68) {
      return false;
    }
    if (postFxQuality === 'low' && runtimePresetScale < 0.78) {
      return false;
    }
    if (runtimeFps > 0 && runtimeFps < performanceFpsFloor) {
      return false;
    }
    return true;
  }, [
    musicSpectrum,
    performanceFpsFloor,
    postFxQuality,
    runtimeFps,
    runtimePresetScale,
    runtimeProfile,
  ]);
  const musicPulse = useMemo(() => {
    if (!musicReactiveEnabled || !musicSpectrum) {
      return 0;
    }

    const bass = clamp01((musicSpectrum.bands.subBass + musicSpectrum.bands.bass) * 0.5);
    const mids = clamp01((musicSpectrum.bands.lowMid + musicSpectrum.bands.mid) * 0.5);
    const highs = clamp01((musicSpectrum.bands.highMid + musicSpectrum.bands.high) * 0.5);
    const energy = clamp01(musicSpectrum.energy);
    const beat = clamp01(musicSpectrum.beat);
    return clamp01(
      energy * 0.52 +
        beat * 0.36 +
        bass * 0.16 +
        mids * 0.1 +
        highs * 0.06,
    );
  }, [musicReactiveEnabled, musicSpectrum]);
  const musicEventBoost = 1 + musicPulse * 0.34;

  const selectedPoint = useMemo<TourPoint | null>(() => {
    if (!selectedPath) {
      return null;
    }

    const file = sceneFiles.find((item) => item.path === selectedPath);
    if (!file) {
      return null;
    }

    return {
      x: file.x,
      y: (visualHeightMap.get(file.path) ?? 2) * 0.4,
      z: file.z,
      cameraOffset: tunedSelectedCameraOffset,
    };
  }, [sceneFiles, selectedPath, tunedSelectedCameraOffset, visualHeightMap]);

  const tourPoints = useMemo<TourPoint[]>(() => {
    return sceneFiles
      .filter((file) => hotspotPaths.has(file.path))
      .slice(0, 10)
      .map((file) => ({
        x: file.x,
        y: (visualHeightMap.get(file.path) ?? 2) * 0.38,
        z: file.z,
        cameraOffset: tunedTourCameraOffset,
      }));
  }, [sceneFiles, hotspotPaths, tunedTourCameraOffset, visualHeightMap]);

  const importRoadSegments = useMemo<ImportRoadSegment[]>(() => {
    const edgeSignals = new Map<string, { violation: number; cycle: number }>();
    if (insights?.graph.forbiddenEdges) {
      insights.graph.forbiddenEdges.forEach((edge) => {
        edgeSignals.set(`${edge.from}=>${edge.to}`, {
          violation: edge.count,
          cycle: edgeSignals.get(`${edge.from}=>${edge.to}`)?.cycle ?? 0,
        });
      });
    }
    if (insights?.graph.cycleEdges) {
      insights.graph.cycleEdges.forEach((edge) => {
        const existing = edgeSignals.get(`${edge.from}=>${edge.to}`);
        edgeSignals.set(`${edge.from}=>${edge.to}`, {
          violation: existing?.violation ?? 0,
          cycle: edge.count,
        });
      });
    }

    return buildRoadSegments(sceneFiles, imports, dna, cityBounds, edgeSignals);
  }, [cityBounds, dna, imports, insights?.graph.cycleEdges, insights?.graph.forbiddenEdges, sceneFiles]);
  const roadFovBounds = useMemo(
    () => buildRoadFovBounds(importRoadSegments),
    [importRoadSegments],
  );
  const renderableRoadSegments = useMemo(() => {
    if (!visibleRoadIds) {
      return importRoadSegments;
    }
    return importRoadSegments.filter((segment) => visibleRoadIds.has(segment.id));
  }, [importRoadSegments, visibleRoadIds]);
  const visibleRoadCoverage = useMemo(() => {
    if (importRoadSegments.length === 0) {
      return 1;
    }
    return Math.max(0, Math.min(1, renderableRoadSegments.length / importRoadSegments.length));
  }, [importRoadSegments.length, renderableRoadSegments.length]);
  const activeRoadSegments = useMemo(() => {
    if (!visibleRoadIds) {
      return importRoadSegments;
    }
    if (renderableRoadSegments.length === 0) {
      return importRoadSegments;
    }
    return renderableRoadSegments;
  }, [importRoadSegments, renderableRoadSegments, visibleRoadIds]);
  useEffect(() => {
    setVisibleRoadIds(null);
  }, [importRoadSegments]);

  const trafficSegments = useMemo(() => {
    const baseBudget = architectureMode
      ? 420
      : riskMode
        ? 210
        : stackMode
          ? 120
          : 320;
    const budget = Math.max(
      40,
      Math.round(
        baseBudget *
          modePreset.trafficDensity *
          runtimePopulationScale,
      ),
    );
    return importRoadSegments.slice(0, budget);
  }, [
    architectureMode,
    importRoadSegments,
    modePreset.trafficDensity,
    riskMode,
    runtimePopulationScale,
    stackMode,
  ]);
  const cityWetness = useMemo(() => {
    if (sceneFiles.length === 0) {
      return dna?.wetness ?? 0.35;
    }

    let unstable = 0;
    sceneFiles.forEach((file) => {
      const mood = buildingMoodMap.get(file.path) ?? 'sun';
      if (mood === 'storm') {
        unstable += 1.4;
      } else if (mood === 'rain') {
        unstable += 0.8;
      }
    });

    const local = unstable / Math.max(1, sceneFiles.length);
    return Math.min(
      1,
      Math.max(
        0.12,
        (dna?.wetness ?? 0.32) * 0.65 +
          local * 0.8 +
          atmospherePreset.wetnessBoost,
      ),
    );
  }, [atmospherePreset.wetnessBoost, buildingMoodMap, dna?.wetness, sceneFiles]);
  const citySeed = dna?.seed ?? 42;
  const projectEvents = useMemo<ProjectCityEvent[]>(() => {
    const hotspotFiles = sceneFiles
      .filter((file) => hotspotPaths.has(file.path))
      .slice(0, 20);
    if (hotspotFiles.length === 0) {
      return [];
    }

    const latestChanges = hotspotFiles.map((file) => file.commits[file.commits.length - 1]?.changes ?? 0);
    const sortedChanges = [...latestChanges].sort((a, b) => a - b);
    const medianChanges =
      sortedChanges[Math.floor(sortedChanges.length / 2)] ?? 1;

    const events: ProjectCityEvent[] = [];
    hotspotFiles.forEach((file) => {
      const latest = file.commits[file.commits.length - 1];
      if (!latest) {
        return;
      }

      const message = latest.message || '';
      const risk = riskByPath.get(file.path);
      const topY = visualHeightMap.get(file.path) ?? 2;
      const baseImportance = importanceMap.get(file.path) ?? 0.2;

      const flashSignal =
        latest.changes >= Math.max(24, medianChanges * 1.35) ||
        flashMessagePattern.test(message);
      if (flashSignal) {
        events.push({
          id: `${file.path}-flash`,
          type: 'flash',
          path: file.path,
          x: file.x,
          y: topY + 0.48,
          z: file.z,
          intensity: clamp01(baseImportance * 0.65 + latest.changes / Math.max(80, medianChanges * 3)),
          reason: `churn:${latest.changes}`,
        });
      }

      const accidentSignal =
        (risk?.risk ?? 0) > 0.5 ||
        incidentMessagePattern.test(message);
      if (accidentSignal) {
        events.push({
          id: `${file.path}-accident`,
          type: 'accident',
          path: file.path,
          x: file.x,
          y: topY + 0.4,
          z: file.z,
          intensity: clamp01((risk?.risk ?? 0) * 1.15 + (risk?.churn ?? 0) * 0.35),
          reason: `risk:${Math.round((risk?.risk ?? 0) * 100)}`,
        });
      }

      const recoverySignal =
        ((risk?.bugfixRatio ?? 0) > 0.34 && recoveryMessagePattern.test(message)) ||
        ((risk?.bugfixRatio ?? 0) > 0.52 && (risk?.recentCommits ?? 0) >= 2);
      if (recoverySignal) {
        events.push({
          id: `${file.path}-recovery`,
          type: 'recovery',
          path: file.path,
          x: file.x,
          y: topY + 0.34,
          z: file.z,
          intensity: clamp01((risk?.bugfixRatio ?? 0) * 0.9 + (risk?.churn ?? 0) * 0.35),
          reason: `bugfix:${Math.round((risk?.bugfixRatio ?? 0) * 100)}`,
        });
      }

      const releaseSignal =
        releaseMessagePattern.test(message) ||
        (/(package\.json|pnpm-lock\.yaml|yarn\.lock|go\.mod|cargo\.toml|pom\.xml|dockerfile)$/i.test(file.path) &&
          latest.changes > Math.max(8, medianChanges * 0.7));
      if (releaseSignal) {
        events.push({
          id: `${file.path}-release`,
          type: 'release',
          path: file.path,
          x: file.x,
          y: topY + 0.56,
          z: file.z,
          intensity: clamp01(baseImportance * 0.6 + latest.changes / Math.max(90, medianChanges * 3.4)),
          reason: 'release/deploy',
        });
      }
    });

    if (!events.some((event) => event.type === 'flash')) {
      const fallback = hotspotFiles
        .map((file) => ({
          file,
          score: file.commits[file.commits.length - 1]?.changes ?? 0,
        }))
        .sort((a, b) => b.score - a.score)[0];
      if (fallback) {
        events.push({
          id: `${fallback.file.path}-flash-fallback`,
          type: 'flash',
          path: fallback.file.path,
          x: fallback.file.x,
          y: (visualHeightMap.get(fallback.file.path) ?? 2) + 0.45,
          z: fallback.file.z,
          intensity: 0.58,
          reason: 'fallback-churn',
        });
      }
    }

    if (!events.some((event) => event.type === 'accident')) {
      const fallback = hotspotFiles
        .map((file) => ({
          file,
          score: riskByPath.get(file.path)?.risk ?? 0,
        }))
        .sort((a, b) => b.score - a.score)[0];
      if (fallback) {
        events.push({
          id: `${fallback.file.path}-accident-fallback`,
          type: 'accident',
          path: fallback.file.path,
          x: fallback.file.x,
          y: (visualHeightMap.get(fallback.file.path) ?? 2) + 0.36,
          z: fallback.file.z,
          intensity: clamp01(0.45 + fallback.score * 0.5),
          reason: 'fallback-risk',
        });
      }
    }

    if (!events.some((event) => event.type === 'recovery')) {
      const fallback = hotspotFiles
        .map((file) => ({
          file,
          score: riskByPath.get(file.path)?.bugfixRatio ?? 0,
        }))
        .sort((a, b) => b.score - a.score)[0];
      if (fallback) {
        events.push({
          id: `${fallback.file.path}-recovery-fallback`,
          type: 'recovery',
          path: fallback.file.path,
          x: fallback.file.x,
          y: (visualHeightMap.get(fallback.file.path) ?? 2) + 0.33,
          z: fallback.file.z,
          intensity: clamp01(0.42 + fallback.score * 0.6),
          reason: 'fallback-bugfix',
        });
      }
    }

    if (!events.some((event) => event.type === 'release')) {
      const fallback = hotspotFiles
        .map((file) => ({
          file,
          score: file.commits.length,
        }))
        .sort((a, b) => b.score - a.score)[0];
      if (fallback) {
        events.push({
          id: `${fallback.file.path}-release-fallback`,
          type: 'release',
          path: fallback.file.path,
          x: fallback.file.x,
          y: (visualHeightMap.get(fallback.file.path) ?? 2) + 0.5,
          z: fallback.file.z,
          intensity: 0.5,
          reason: 'fallback-activity',
        });
      }
    }

    return events
      .map((event) => ({
        ...event,
        intensity: clamp01(event.intensity * tunedEventIntensityBoost),
      }))
      .sort((a, b) => b.intensity - a.intensity)
      .slice(
        0,
        Math.max(
          10,
          Math.round(modePreset.eventBudget * runtimePopulationScale),
        ),
      );
  }, [
    hotspotPaths,
    importanceMap,
    modePreset.eventBudget,
    riskByPath,
    runtimePopulationScale,
    sceneFiles,
    tunedEventIntensityBoost,
    visualHeightMap,
  ]);
  const musicReactiveProjectEvents = useMemo(() => {
    if (musicPulse < 0.02) {
      return projectEvents;
    }
    return projectEvents.map((event) => {
      const perTypeBoost =
        event.type === 'release'
          ? 1 + musicPulse * 0.42
          : event.type === 'flash'
            ? 1 + musicPulse * 0.36
            : event.type === 'accident'
              ? 1 + musicPulse * 0.26
              : 1 + musicPulse * 0.3;
      return {
        ...event,
        intensity: clamp01(event.intensity * perTypeBoost),
      };
    });
  }, [musicPulse, projectEvents]);
  const modeFlags = useMemo(
    () => ({
      showStackTowers: stackMode,
      showBranchOrbits: overviewMode || architectureMode,
      showInsightSignals: overviewMode || architectureMode || riskMode,
      showTraffic: architectureMode || (overviewMode && showAtmosphere),
      showBuilders: showBuilders && !riskMode,
      showAirTraffic: showAtmosphere && (overviewMode || architectureMode),
      showAtmosphereLayer: showAtmosphere && !stackMode,
      showDistrictGrid: architectureMode || stackMode,
      showProjectEvents: overviewMode || architectureMode || riskMode,
      forceWeather: riskMode,
      roadWetness:
        architectureMode
          ? Math.max(0.22, cityWetness * 0.9)
          : riskMode
            ? Math.min(1, cityWetness * 1.2 + 0.08)
            : stackMode
              ? Math.max(0.1, cityWetness * 0.55)
              : cityWetness,
    }),
    [
      architectureMode,
      cityWetness,
      overviewMode,
      riskMode,
      showAtmosphere,
      showBuilders,
      stackMode,
    ],
  );
  const visibleBuilderPoints = useMemo(() => {
    const budget = Math.max(
      2,
      Math.round(
        10 *
          modePreset.builderDensity *
          runtimePopulationScale,
      ),
    );
    return sceneFiles
      .filter((file) => hotspotPaths.has(file.path))
      .slice(0, budget)
      .map((file) => ({
        x: file.x,
        y: (visualHeightMap.get(file.path) ?? 2) * 0.38,
        z: file.z,
        cameraOffset: tunedTourCameraOffset,
      }));
  }, [
    hotspotPaths,
    modePreset.builderDensity,
    runtimePopulationScale,
    sceneFiles,
    tunedTourCameraOffset,
    visualHeightMap,
  ]);
  const renderableCompareBaselineFiles = useMemo(() => {
    if (!visibleBuildingPaths) {
      return compareSceneFiles;
    }
    return compareSceneFiles.filter((file) => visibleBuildingPaths.has(file.path));
  }, [compareSceneFiles, visibleBuildingPaths]);
  const renderableCompareCurrentFiles = useMemo(() => {
    if (!visibleBuildingPaths) {
      return sceneFiles;
    }
    return renderableFiles;
  }, [renderableFiles, sceneFiles, visibleBuildingPaths]);
  const activeProjectEvents = musicReactiveProjectEvents;
  const activeBuildingFootprints = useMemo(() => {
    if (!visibleBuildingPaths) {
      return buildingFootprints;
    }
    if (renderableBuildingFootprints.length === 0) {
      return buildingFootprints;
    }
    return renderableBuildingFootprints;
  }, [buildingFootprints, renderableBuildingFootprints, visibleBuildingPaths]);
  const coasterFootprints = useMemo(
    () => (tourMode === 'coaster' ? buildingFootprints : activeBuildingFootprints),
    [activeBuildingFootprints, buildingFootprints, tourMode],
  );
  const coasterEnabled =
    sceneFiles.length > 0 &&
    (tourMode === 'coaster' || activeBuildingFootprints.length > 0);
  const hotspotBillboards = useMemo(() => {
    const strongestByPath = new Map<string, ProjectCityEvent>();
    activeProjectEvents.forEach((event) => {
      const existing = strongestByPath.get(event.path);
      if (!existing || existing.intensity < event.intensity) {
        strongestByPath.set(event.path, event);
      }
    });

    const budget = Math.max(
      5,
      Math.round(
        13 *
          modePreset.builderDensity *
          runtimePopulationScale,
      ),
    );
    return Array.from(strongestByPath.values())
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, budget)
      .map((event) => ({
        id: `billboard-${event.id}`,
        x: event.x,
        y: event.y + 0.9,
        z: event.z,
        label: event.path.split('/').slice(-2).join('/'),
        intensity: event.intensity,
        type: event.type,
      }));
  }, [activeProjectEvents, modePreset.builderDensity, runtimePopulationScale]);
  const buildingPerformanceTier: PostFxQuality =
    postFxQuality === 'low' ||
    sceneQualityCap === 'low' ||
    runtimePresetScale < 0.64
      ? 'low'
      : postFxQuality === 'medium' ||
          sceneQualityCap === 'medium' ||
          sceneFiles.length > 220 ||
          totalFloorCount > 3600
        ? 'medium'
        : 'high';
  const terrainQuality: PostFxQuality =
    runtimeProfile === 'performance'
      ? 'low'
      : runtimeProfile === 'balanced' || heavySceneComplexity
        ? 'medium'
        : 'high';
  const shadowQuality: PostFxQuality =
    postFxQuality === 'low' || runtimePresetScale < 0.6
      ? 'low'
      : heavySceneComplexity || runtimePresetScale < 0.82
        ? 'medium'
        : postFxQuality;
  const shadowsEnabled = shadowQuality !== 'low';
  const shadowMapSize =
    shadowQuality === 'high'
      ? runtimePresetScale < 0.9
        ? 1280
        : 1536
      : runtimePresetScale < 0.72
        ? 768
        : 1024;
  const enableWetReflections =
    showPostProcessing &&
    runtimePresetScale > 0.7 &&
    (resolvedWeather === 'rain' ||
      resolvedWeather === 'storm' ||
      modeFlags.roadWetness > 0.46);
  const handleCoasterCameraPose = useCallback((pose: CoasterCameraPose | null) => {
    const safePose = sanitizeCoasterPose(pose);
    coasterCameraPoseRef.current = safePose;

    if (!onCoasterTelemetry) {
      return;
    }

    if (!safePose) {
      if (coasterTelemetryRef.current.telemetry !== null) {
        coasterTelemetryRef.current = {
          timestamp: 0,
          telemetry: null,
        };
        onCoasterTelemetry(null);
      }
      return;
    }

    const nextTelemetry: CoasterTelemetry = {
      speed: safePose.speed,
      acceleration: safePose.acceleration,
      gForce: safePose.gForce,
      lap: safePose.lap,
      emergencyBrake: safePose.emergencyBrake,
      slope: safePose.slope,
      clearance: safePose.clearance,
      throttle: safePose.throttle,
      cameraMode: safePose.cameraMode,
      lapTimeSec: safePose.lapTimeSec,
      bestLapSec: safePose.bestLapSec,
      topSpeed: safePose.topSpeed,
    };
    const now = Date.now();
    const previous = coasterTelemetryRef.current.telemetry;
    const importantChange =
      !previous ||
      Math.abs(previous.speed - nextTelemetry.speed) > 0.38 ||
      Math.abs(previous.gForce - nextTelemetry.gForce) > 0.05 ||
      Math.abs(previous.acceleration - nextTelemetry.acceleration) > 0.26 ||
      Math.abs(previous.slope - nextTelemetry.slope) > 0.03 ||
      Math.abs(previous.throttle - nextTelemetry.throttle) > 0.09 ||
      Math.abs(previous.lapTimeSec - nextTelemetry.lapTimeSec) > 0.2 ||
      Math.abs(previous.topSpeed - nextTelemetry.topSpeed) > 0.2 ||
      previous.lap !== nextTelemetry.lap ||
      previous.bestLapSec !== nextTelemetry.bestLapSec ||
      previous.emergencyBrake !== nextTelemetry.emergencyBrake ||
      previous.cameraMode !== nextTelemetry.cameraMode;
    const timedUpdate = now - coasterTelemetryRef.current.timestamp > 180;

    if (importantChange || timedUpdate) {
      coasterTelemetryRef.current = {
        timestamp: now,
        telemetry: nextTelemetry,
      };
      onCoasterTelemetry(nextTelemetry);
    }
  }, [onCoasterTelemetry]);

  useEffect(() => {
    return () => {
      onCoasterTelemetry?.(null);
    };
  }, [onCoasterTelemetry]);

  useEffect(() => {
    if (!onPerformanceTelemetry) {
      return;
    }

    onPerformanceTelemetry({
      fps: runtimeFps,
      runtimeProfile,
      postFxQuality,
      adaptiveDpr: adaptiveCanvasDpr,
      adaptiveLoadScale: runtimePresetScale,
      fovBuildingCoverage: visibleBuildingCoverage,
      fovRoadCoverage: visibleRoadCoverage,
      fovDistrictCoverage: visibleDistrictCoverage,
    });
  }, [
    adaptiveCanvasDpr,
    onPerformanceTelemetry,
    postFxQuality,
    runtimePresetScale,
    runtimeFps,
    runtimeProfile,
    visibleBuildingCoverage,
    visibleDistrictCoverage,
    visibleRoadCoverage,
  ]);

  return (
    <Canvas
      id="repo-city-canvas"
      shadows={shadowsEnabled}
      dpr={adaptiveCanvasDpr}
      camera={{ position: [18, 24, 20], fov: tunedCameraFov }}
      onPointerMissed={() => onSelect(null)}
    >
      <CaptureBridge onCaptureReady={onCaptureReady} />
      <FpsProbe enabled={showFps} onFpsUpdate={onFpsUpdate} />
      <AdaptivePerformanceProbe
        enabled={sceneFiles.length > 0}
        adaptive={adaptivePostFx}
        targetFps={targetFps}
        renderProfileLock={renderProfileLock}
        onQualityChange={setAdaptiveQuality}
        onRuntimeProfileChange={setRuntimeProfile}
        onDprChange={setAdaptiveDpr}
        onLoadScaleChange={setAdaptiveLoadScale}
        onTelemetry={(telemetry) => {
          setRuntimeFps((current) => {
            if (Math.abs(current - telemetry.fps) < 0.35) {
              return current;
            }
            return telemetry.fps;
          });
        }}
      />
      <FovVisibilityProbe
        enabled={sceneFiles.length > 0}
        buildingBounds={buildingFovBounds}
        roadBounds={roadFovBounds}
        districtBounds={districtFovBounds}
        selectedPath={selectedPath}
        hoveredPath={hoveredPath}
        onBuildingsChange={handleVisiblePathsChange}
        onRoadsChange={handleVisibleRoadsChange}
        onDistrictsChange={handleVisibleDistrictsChange}
      />

      <SceneLightingRig
        preset={atmospherePreset}
        palette={{ sun: palette.sun, accent: sceneAccentColor }}
        cityBounds={cityBounds}
        shadowsEnabled={shadowsEnabled}
        shadowMapSize={shadowMapSize}
      />

      <CyberpunkAtmosphere
        enabled={modeFlags.showAtmosphereLayer}
        cityBounds={cityBounds}
        palette={palette}
        seed={citySeed}
        cloudiness={dna?.cloudiness ?? 0.34}
        starDensity={dna?.starDensity ?? 1900}
        timeOfDay={resolvedTimeOfDay}
        weather={resolvedWeather}
        quality={postFxQuality}
      />

      <CityTerrain
        cityBounds={cityBounds}
        palette={palette}
        layout={dna?.layout ?? 'grid'}
        seed={citySeed}
        wetness={modeFlags.roadWetness}
        showGrid={modeFlags.showDistrictGrid}
        files={sceneFiles}
        roadSegments={importRoadSegments}
        enableWetReflections={enableWetReflections}
        reflectionQuality={postFxQuality}
        quality={terrainQuality}
      />

      <ModeSignatureLayer
        mode={viewMode}
        cityBounds={cityBounds}
        accentColor={sceneAccentColor}
        seed={citySeed}
      />
      <CityCinematicAccentLayer
        cityBounds={cityBounds}
        accentColor={sceneAccentColor}
        mode={viewMode}
        quality={postFxQuality}
        weather={resolvedWeather}
      />

      {onPointerSample && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[cityBounds.centerX, 0.06, cityBounds.centerZ]}
          onPointerMove={(event) => {
            event.stopPropagation();
            onPointerSample({
              x: event.point.x,
              y: event.point.y,
              z: event.point.z,
              path: hoveredPath,
            });
          }}
        >
          <planeGeometry args={[cityBounds.size * 1.95, cityBounds.size * 1.95]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      <DistrictOverlays
        districts={renderableDistrictInfo}
        cityCenterX={cityBounds.centerX}
        cityCenterZ={cityBounds.centerZ}
        riskByFolder={districtRiskMap}
      />

      <RoadNetwork
        segments={activeRoadSegments}
        trafficSegments={trafficSegments}
        accentColor={sceneAccentColor}
        trafficEnabled={modeFlags.showTraffic}
        textureSeed={citySeed}
        wetness={modeFlags.roadWetness}
      />

      <RollerCoaster
        enabled={coasterEnabled}
        rideActive={tourMode === 'coaster'}
        cityBounds={cityBounds}
        buildingFootprints={coasterFootprints}
        seed={citySeed}
        mode={viewMode}
        quality={postFxQuality}
        intensity={coasterIntensity}
        driveProfile={coasterProfile}
        accentColor={sceneAccentColor}
        controlInput={coasterControlInput}
        onCameraPoseChange={handleCoasterCameraPose}
      />

      {modeFlags.showInsightSignals && (
        <InsightSignals
          cityBounds={cityBounds}
          insights={insights}
          accentColor={sceneAccentColor}
        />
      )}

      {modeFlags.showStackTowers && (
        <StackPassportTowers
          stack={stack}
          cityBounds={cityBounds}
          accentColor={sceneAccentColor}
        />
      )}

      {modeFlags.showBranchOrbits && (
        <BranchOrbits
          branches={branches}
          cityBounds={cityBounds}
          accentColor={sceneAccentColor}
        />
      )}

      {compareEnabled && compareSceneFiles.length > 0 && (
        <ComparisonOverlay
          baselineFiles={renderableCompareBaselineFiles}
          currentFiles={renderableCompareCurrentFiles}
          cityBounds={cityBounds}
          mode={compareMode}
          accentColor={sceneAccentColor}
        />
      )}

      {displayedFiles.map((file) => (
        <Building
          key={file.path}
          file={file}
          districtColor={
            stackMode
              ? (stackLayerColorMap.get(file.path) ?? '#90a8cb')
              : (districtColorMap.get(file.folder) ?? '#90a8cb')
          }
          districtArchetype={districtMap.get(file.folder)?.archetype ?? 'commons'}
          accentColor={
            blendHex(
              districtMap.get(file.folder)?.archetypeAccent ?? palette.accent,
              sceneAccentColor,
              0.42,
            )
          }
          architecture={dna?.architecture ?? 'cyberpunk'}
          viewMode={viewMode}
          skylineBoost={dna?.skylineBoost ?? 1}
          importance={
            architectureMode
              ? Math.min(1, (importanceMap.get(file.path) ?? 0.2) * 1.12)
              : riskMode
                ? Math.min(1, (importanceMap.get(file.path) ?? 0.2) * 0.92)
                : stackMode
                  ? Math.min(1, (importanceMap.get(file.path) ?? 0.2) * 1.02)
              : (importanceMap.get(file.path) ?? 0.2)
          }
          buildingStyle={
            buildingStyleMap.get(file.path) ?? {
              roofStyle: 'flat',
              widthScale: 1,
              depthScale: 1,
              glowBias: 0.12,
            }
          }
          mood={buildingMoodMap.get(file.path) ?? 'sun'}
          isHovered={hoveredPath === file.path}
          isSelected={selectedPath === file.path}
          isHotspot={hotspotPaths.has(file.path)}
          riskScore={
            riskMode
              ? (riskByPath.get(file.path)?.risk ?? 0)
              : (riskByPath.get(file.path)?.risk ?? 0) * 0.55
          }
          showHologram={overviewMode || architectureMode}
          showWeather={modeFlags.forceWeather || showWeather}
          maxRenderedFloors={maxRenderedFloors}
          totalCommitCount={totalCommitsByPath.get(file.path) ?? file.commits.length}
          performanceTier={buildingPerformanceTier}
          constructionWindow={constructionWindowByPath.get(file.path)}
          constructionMode={constructionMode}
          constructionProgress={constructionProgress}
          onHover={onHover}
          onSelect={(path) => onSelect(path)}
        />
      ))}

      <HotspotBillboards
        nodes={hotspotBillboards}
        mode={viewMode}
        accentColor={sceneAccentColor}
        presetIntensity={cinematicIntensity}
      />

      <BuilderDrones
        points={visibleBuilderPoints}
        enabled={modeFlags.showBuilders}
        speed={(dna?.droneSpeed ?? 0.9) * modePreset.droneCruiseSpeed}
        color={sceneAccentColor}
        mode={viewMode}
        cityBounds={cityBounds}
        buildingFootprints={buildingFootprints}
        selectedDroneIndex={followDroneIndex}
        onSelectDrone={onFollowDroneChange}
      />

      <LivePointers pointers={livePointers} mode={viewMode} />

      {modeFlags.showProjectEvents && (
        <>
          <ProjectEventSignals
            events={activeProjectEvents}
            mode={viewMode}
            intensityBoost={tunedEventIntensityBoost * musicEventBoost}
          />
          <ProjectEventRoutes
            events={activeProjectEvents}
            mode={viewMode}
            accentColor={sceneAccentColor}
          />
          <CityActivities
            events={activeProjectEvents}
            mode={viewMode}
            accentColor={sceneAccentColor}
            presetIntensity={cinematicIntensity * (1 + musicPulse * 0.16)}
          />
          <EventFireworks
            events={activeProjectEvents}
            mode={viewMode}
            accentColor={sceneAccentColor}
            quality={postFxQuality}
            presetIntensity={cinematicIntensity}
            musicPulse={musicPulse}
          />
          <GroundEventAgents
            events={activeProjectEvents}
            cityBounds={cityBounds}
            buildingFootprints={buildingFootprints}
            mode={viewMode}
            color={sceneAccentColor}
            seed={citySeed}
            serviceMultiplier={modePreset.serviceMultiplier}
            pedestrianMultiplier={modePreset.pedestrianMultiplier}
            density={modePreset.agentDensity * runtimePopulationScale}
            maxAgents={Math.round(
              modePreset.agentBudget *
                runtimePopulationScale,
            )}
          />
        </>
      )}

      <AirTraffic
        enabled={modeFlags.showAirTraffic}
        cityBounds={cityBounds}
        buildingFootprints={buildingFootprints}
        color={sceneAccentColor}
        seed={citySeed}
        density={modePreset.airTrafficDensity * runtimePopulationScale}
      />

      <OrbitControls
        ref={controlsRef}
        enabled={tourMode === 'orbit'}
        enableDamping
        dampingFactor={tunedOrbitDamping}
        autoRotate={false}
        autoRotateSpeed={tunedOrbitAutoRotateSpeed}
        enablePan={tourMode === 'orbit'}
        enableRotate={tourMode === 'orbit'}
        enableZoom={tourMode === 'orbit'}
        minDistance={tunedOrbitMinDistance}
        maxDistance={tunedOrbitMaxDistance}
        maxPolarAngle={tunedOrbitMaxPolarAngle}
      />

      <CameraDirector
        controlsRef={controlsRef}
        selectedPoint={selectedPoint}
        tourPoints={tourPoints}
        roadSegments={importRoadSegments}
        buildingFootprints={buildingFootprints}
        mode={viewMode}
        tourMode={tourMode}
        followDroneIndex={followDroneIndex}
        droneSpeed={dna?.droneSpeed ?? 0.9}
        autoTour={autoTour}
        baseFov={tunedCameraFov}
        orbitFocusLerp={tunedOrbitFocusLerp}
        orbitCameraLerp={tunedOrbitCameraLerp}
        autoTourCadenceSec={tunedAutoTourCadenceSec}
        coasterCameraPoseRef={coasterCameraPoseRef}
        onWalkBuildingChange={onWalkBuildingChange}
      />

      {showPostProcessing && (
        <Suspense fallback={null}>
          <PostProcessingLayerLazy
            enabled={showPostProcessing}
            quality={postFxQuality}
            preset={modePreset}
            presetIntensity={cinematicIntensity}
            mode={viewMode}
            weather={resolvedWeather}
            timeOfDay={resolvedTimeOfDay}
            tourMode={tourMode}
            selectedPath={selectedPath}
            accentColor={sceneAccentColor}
            cityBounds={cityBounds}
          />
        </Suspense>
      )}
    </Canvas>
  );
});
