import { memo, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PointLight,
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
import { CityTerrain } from './scene/CityTerrain';
import { ComparisonOverlay } from './scene/ComparisonOverlay';
import { CyberpunkAtmosphere } from './scene/CyberpunkAtmosphere';
import { DistrictOverlays } from './scene/DistrictOverlays';
import { InsightSignals } from './scene/InsightSignals';
import { RoadNetwork } from './scene/RoadNetwork';
import { StackPassportTowers } from './scene/StackPassportTowers';
import { DistrictInfo, ImportRoadSegment, TourPoint } from './scene/types';

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
  viewMode: 'overview' | 'architecture' | 'risk' | 'stack';
  compareEnabled: boolean;
  compareMode: 'ghost' | 'split';
  compareFiles: PositionedFileHistory[];
  autoTour: boolean;
  showAtmosphere: boolean;
  showWeather: boolean;
  showBuilders: boolean;
  timeOfDay: 'auto' | 'dawn' | 'day' | 'sunset' | 'night';
  weatherMode: 'auto' | 'clear' | 'mist' | 'rain' | 'storm';
  totalCommitsByPath: Map<string, number>;
  constructionMode: boolean;
  constructionProgress: number;
  onHover: (path: string | null) => void;
  onSelect: (path: string | null) => void;
  onCaptureReady?: (capture: (() => Promise<Blob | null>) | null) => void;
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

function SceneLightingRig({
  preset,
  palette,
  cityBounds,
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
}) {
  const { scene } = useThree();
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
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
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
  timeOfDay,
  weatherMode,
  totalCommitsByPath,
  constructionMode,
  constructionProgress,
  onHover,
  onSelect,
  onCaptureReady,
}: Scene3DProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const architectureMode = viewMode === 'architecture';
  const riskMode = viewMode === 'risk';
  const stackMode = viewMode === 'stack';

  const sceneFiles = useMemo(() => buildCityLayout(files, dna), [files, dna]);
  const compareSceneFiles = useMemo(
    () => buildCityLayout(compareFiles, dna),
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
      }
    > = {
      dawn: {
        sky: '#d9e8ff',
        fog: '#c7d9f0',
        ambient: 0.56,
        hemisphere: 0.72,
        directional: 0.8,
        pointAccent: 0.76,
        pointSun: 0.54,
        fogNear: 34,
        fogFar: 220,
      },
      day: {
        sky: palette.sky,
        fog: palette.fog,
        ambient: 0.55,
        hemisphere: 0.74,
        directional: 0.95,
        pointAccent: 0.75,
        pointSun: 0.62,
        fogNear: 42,
        fogFar: 220,
      },
      sunset: {
        sky: '#ffd6bf',
        fog: '#efc2be',
        ambient: 0.5,
        hemisphere: 0.68,
        directional: 0.74,
        pointAccent: 0.9,
        pointSun: 0.82,
        fogNear: 32,
        fogFar: 205,
      },
      night: {
        sky: '#0d1730',
        fog: '#1b2d4f',
        ambient: 0.28,
        hemisphere: 0.46,
        directional: 0.42,
        pointAccent: 1.15,
        pointSun: 0.92,
        fogNear: 20,
        fogFar: 168,
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
        wetnessBoost: number;
      }
    > = {
      clear: {
        fogNearScale: 1,
        fogFarScale: 1,
        ambientScale: 1,
        directionalScale: 1,
        pointBoost: 1,
        wetnessBoost: 0,
      },
      mist: {
        fogNearScale: 0.78,
        fogFarScale: 0.74,
        ambientScale: 0.96,
        directionalScale: 0.86,
        pointBoost: 1.08,
        wetnessBoost: 0.12,
      },
      rain: {
        fogNearScale: 0.68,
        fogFarScale: 0.62,
        ambientScale: 0.92,
        directionalScale: 0.74,
        pointBoost: 1.14,
        wetnessBoost: 0.22,
      },
      storm: {
        fogNearScale: 0.58,
        fogFarScale: 0.5,
        ambientScale: 0.86,
        directionalScale: 0.56,
        pointBoost: 1.28,
        wetnessBoost: 0.34,
      },
    };
    const weather = weatherModifiers[resolvedWeather];

    return {
      sky: base.sky,
      fog: base.fog,
      ambient: base.ambient * weather.ambientScale,
      hemisphere: base.hemisphere * weather.ambientScale,
      directional: base.directional * weather.directionalScale,
      pointAccent: base.pointAccent * weather.pointBoost,
      pointSun: base.pointSun * weather.pointBoost,
      fogNear: Math.max(12, base.fogNear * weather.fogNearScale),
      fogFar: Math.max(85, base.fogFar * weather.fogFarScale),
      wetnessBoost: weather.wetnessBoost,
    };
  }, [palette.fog, palette.sky, resolvedTimeOfDay, resolvedWeather]);

  const districtInfo = useMemo<DistrictInfo[]>(() => {
    const map = new Map<
      string,
      {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
      }
    >();

    sceneFiles.forEach((file) => {
      const existing = map.get(file.folder);
      const minX = file.x - file.width / 2 - 1;
      const maxX = file.x + file.width / 2 + 1;
      const minZ = file.z - file.depth / 2 - 1;
      const maxZ = file.z + file.depth / 2 + 1;

      if (!existing) {
        map.set(file.folder, { minX, maxX, minZ, maxZ });
        return;
      }

      existing.minX = Math.min(existing.minX, minX);
      existing.maxX = Math.max(existing.maxX, maxX);
      existing.minZ = Math.min(existing.minZ, minZ);
      existing.maxZ = Math.max(existing.maxZ, maxZ);
    });

    const hueOffset = dna ? dna.seed % 360 : 0;

    return Array.from(map.entries()).map(([folder, bounds], index) => {
      const x = (bounds.minX + bounds.maxX) / 2;
      const z = (bounds.minZ + bounds.maxZ) / 2;
      const width = bounds.maxX - bounds.minX;
      const depth = bounds.maxZ - bounds.minZ;
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

    const xs = sceneFiles.map((file) => file.x);
    const zs = sceneFiles.map((file) => file.z);

    const minX = Math.min(...xs) - 12;
    const maxX = Math.max(...xs) + 12;
    const minZ = Math.min(...zs) - 12;
    const maxZ = Math.max(...zs) + 12;

    const width = maxX - minX;
    const depth = maxZ - minZ;

    return {
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      size: Math.max(120, width, depth),
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
      const height = floors.reduce((sum, floor) => sum + floorHeight(floor.changes), 0);
      map.set(file.path, Math.max(0.5, height));
    });

    return map;
  }, [sceneFiles]);
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
      cameraOffset: [8, 8, 8],
    };
  }, [sceneFiles, selectedPath, visualHeightMap]);

  const tourPoints = useMemo<TourPoint[]>(() => {
    return sceneFiles
      .filter((file) => hotspotPaths.has(file.path))
      .slice(0, 10)
      .map((file) => ({
        x: file.x,
        y: (visualHeightMap.get(file.path) ?? 2) * 0.38,
        z: file.z,
        cameraOffset: [10, 10, 10],
      }));
  }, [sceneFiles, hotspotPaths, visualHeightMap]);

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

  const trafficSegments = useMemo(
    () => importRoadSegments.slice(0, 320),
    [importRoadSegments],
  );
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

  return (
    <Canvas
      id="repo-city-canvas"
      shadows
      dpr={[1, 1.45]}
      camera={{ position: [18, 24, 20], fov: 48 }}
      onPointerMissed={() => onSelect(null)}
    >
      <CaptureBridge onCaptureReady={onCaptureReady} />

      <SceneLightingRig
        preset={atmospherePreset}
        palette={{ sun: palette.sun, accent: palette.accent }}
        cityBounds={cityBounds}
      />

      <CyberpunkAtmosphere
        enabled={showAtmosphere}
        cityBounds={cityBounds}
        palette={palette}
        seed={citySeed}
        cloudiness={dna?.cloudiness ?? 0.34}
        starDensity={dna?.starDensity ?? 1900}
        timeOfDay={resolvedTimeOfDay}
        weather={resolvedWeather}
      />

      <CityTerrain
        cityBounds={cityBounds}
        palette={palette}
        layout={dna?.layout ?? 'grid'}
        seed={citySeed}
        wetness={cityWetness}
        showGrid={architectureMode || stackMode}
      />

      <DistrictOverlays
        districts={districtInfo}
        cityCenterX={cityBounds.centerX}
        cityCenterZ={cityBounds.centerZ}
        riskByFolder={districtRiskMap}
      />

      <RoadNetwork
        segments={importRoadSegments}
        trafficSegments={trafficSegments}
        accentColor={palette.accent}
        trafficEnabled={showAtmosphere || architectureMode}
        textureSeed={citySeed}
        wetness={cityWetness}
      />

      <InsightSignals
        cityBounds={cityBounds}
        insights={insights}
        accentColor={palette.accent}
      />

      <StackPassportTowers
        stack={stack}
        cityBounds={cityBounds}
        accentColor={palette.accent}
      />

      <BranchOrbits
        branches={branches}
        cityBounds={cityBounds}
        accentColor={palette.accent}
      />

      {compareEnabled && compareSceneFiles.length > 0 && (
        <ComparisonOverlay
          baselineFiles={compareSceneFiles}
          currentFiles={sceneFiles}
          cityBounds={cityBounds}
          mode={compareMode}
          accentColor={palette.accent}
        />
      )}

      {sceneFiles.map((file) => (
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
            districtMap.get(file.folder)?.archetypeAccent ?? palette.accent
          }
          architecture={dna?.architecture ?? 'cyberpunk'}
          skylineBoost={dna?.skylineBoost ?? 1}
          importance={
            architectureMode
              ? Math.min(1, (importanceMap.get(file.path) ?? 0.2) * 1.28)
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
          showHologram={showAtmosphere || architectureMode}
          showWeather={showWeather && (riskMode || viewMode === 'overview')}
          maxRenderedFloors={maxRenderedFloors}
          totalCommitCount={totalCommitsByPath.get(file.path) ?? file.commits.length}
          constructionMode={constructionMode}
          constructionProgress={constructionProgress}
          onHover={onHover}
          onSelect={(path) => onSelect(path)}
        />
      ))}

      <BuilderDrones
        points={tourPoints}
        enabled={showBuilders}
        speed={dna?.droneSpeed ?? 0.9}
        color={palette.accent}
      />

      <AirTraffic
        enabled={showAtmosphere}
        cityBounds={cityBounds}
        color={palette.accent}
        seed={citySeed}
      />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        autoRotate={autoTour && !selectedPath}
        autoRotateSpeed={0.42}
        minDistance={8}
        maxDistance={190}
        maxPolarAngle={Math.PI / 2.03}
      />

      <CameraDirector
        controlsRef={controlsRef}
        selectedPoint={selectedPoint}
        tourPoints={tourPoints}
        autoTour={autoTour}
      />
    </Canvas>
  );
});
