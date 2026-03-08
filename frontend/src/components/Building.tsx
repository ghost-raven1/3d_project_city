import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { PositionedFileHistory } from '../types/repository';
import { compactFloors, floorHeight } from '../utils/building';
import { stringToColor } from '../utils/color';
import { BuildingMood } from '../utils/city';
import { BuildingStyle, CityArchitecture } from '../utils/city-dna';
import { DistrictArchetype } from '../utils/district-archetype';
import { ConstructionWindow, PostFxQuality, SceneViewMode } from './scene/types';

interface BuildingProps {
  file: PositionedFileHistory;
  districtColor: string;
  districtArchetype: DistrictArchetype;
  accentColor: string;
  architecture: CityArchitecture;
  viewMode: SceneViewMode;
  buildingStyle: BuildingStyle;
  skylineBoost: number;
  importance: number;
  mood: BuildingMood;
  isHovered: boolean;
  isSelected: boolean;
  isHotspot: boolean;
  riskScore: number;
  showHologram: boolean;
  showWeather: boolean;
  maxRenderedFloors: number;
  totalCommitCount: number;
  performanceTier: PostFxQuality;
  constructionWindow?: ConstructionWindow;
  constructionMode: boolean;
  constructionProgress: number;
  onHover: (path: string | null) => void;
  onSelect: (path: string) => void;
}

function blendColors(colorA: string, colorB: string, factor: number): string {
  const mixed = new Color(colorA).lerp(new Color(colorB), Math.max(0, Math.min(1, factor)));
  return `#${mixed.getHexString()}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function hashUnit(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) | 0;
  }

  return (Math.abs(hash) % 1000) / 1000;
}

export const Building = memo(function Building({
  file,
  districtColor,
  districtArchetype,
  accentColor,
  architecture,
  viewMode,
  buildingStyle,
  skylineBoost,
  importance,
  mood,
  isHovered,
  isSelected,
  isHotspot,
  riskScore,
  showHologram,
  showWeather,
  maxRenderedFloors,
  totalCommitCount,
  performanceTier,
  constructionWindow,
  constructionMode,
  constructionProgress,
  onHover,
  onSelect,
}: BuildingProps) {
  const rootRef = useRef<Group>(null);
  const weatherGroupRef = useRef<Group>(null);
  const stormMaterialRef = useRef<MeshStandardMaterial>(null);
  const floorMaterialRef = useRef<MeshStandardMaterial>(null);
  const floorMeshRef = useRef<InstancedMesh>(null);
  const hoverRingRef = useRef<Group>(null);
  const hotspotBeamRef = useRef<Group>(null);
  const riskAuraRef = useRef<Group>(null);
  const windowMaterialRefs = useRef<Array<MeshStandardMaterial | null>>([]);
  const facadeEdgeMaterialRefs = useRef<Array<MeshStandardMaterial | null>>([]);
  const modeMarkerMaterialRefs = useRef<Array<MeshStandardMaterial | null>>([]);
  const repairSparksRef = useRef<Group>(null);
  const rooftopBeaconRef = useRef<Group>(null);
  const modeSignatureRef = useRef<Group>(null);
  const revealProgressRef = useRef(1);
  const revealSeedPathRef = useRef<string | null>(null);
  const animationAccumulatorRef = useRef(0);
  const tempFloorObject = useMemo(() => new Object3D(), []);
  const priorityVisual = isHovered || isSelected || isHotspot || riskScore > 0.62;
  const detailScale = useMemo(() => {
    if (performanceTier === 'high') {
      return 1;
    }
    if (performanceTier === 'medium') {
      return priorityVisual ? 0.9 : 0.68;
    }
    return priorityVisual ? 0.72 : 0.4;
  }, [performanceTier, priorityVisual]);
  const animationStep = useMemo(() => {
    if (performanceTier === 'high') {
      return 0;
    }
    if (performanceTier === 'medium') {
      return 1 / 42;
    }
    return 1 / 24;
  }, [performanceTier]);
  const ringSegments = performanceTier === 'high' ? 30 : performanceTier === 'medium' ? 22 : 16;
  const coneSegments = performanceTier === 'high' ? 14 : performanceTier === 'medium' ? 12 : 10;
  const sphereSegments = performanceTier === 'high' ? 12 : performanceTier === 'medium' ? 10 : 8;
  const weatherEffectsEnabled =
    showWeather && (performanceTier === 'high' || priorityVisual || mood === 'storm');
  const windowAnimationEnabled = performanceTier === 'high' || priorityVisual;
  const facadeAnimationEnabled = performanceTier !== 'low' || priorityVisual;
  const modeAnimationEnabled = performanceTier !== 'low' || priorityVisual;
  const riskVisualThreshold =
    performanceTier === 'high' ? 0.08 : performanceTier === 'medium' ? 0.2 : 0.34;
  const showRiskAura = riskScore > riskVisualThreshold;
  const showWindowPanels = performanceTier !== 'low' || priorityVisual || importance > 0.55;
  const showFacadeStrips = performanceTier === 'high' || priorityVisual || importance > 0.66;
  const showFacadeBands = performanceTier !== 'low' || priorityVisual;
  const showRoofModules = performanceTier !== 'low' || priorityVisual || importance > 0.7;

  const materialPreset = useMemo(() => {
    const base =
      architecture === 'cyberpunk'
        ? { roughness: 0.28, metalness: 0.36, env: 0.9 }
        : architecture === 'industrial'
          ? { roughness: 0.72, metalness: 0.08, env: 0.45 }
          : architecture === 'monolith'
            ? { roughness: 0.5, metalness: 0.27, env: 0.7 }
            : { roughness: 0.4, metalness: 0.13, env: 0.56 };

    if (districtArchetype === 'downtown') {
      return {
        roughness: Math.max(0.2, base.roughness - 0.1),
        metalness: Math.min(0.78, base.metalness + 0.2),
        env: base.env + 0.25,
      };
    }

    if (districtArchetype === 'techpark') {
      return {
        roughness: Math.max(0.24, base.roughness - 0.06),
        metalness: Math.min(0.74, base.metalness + 0.12),
        env: base.env + 0.16,
      };
    }

    if (districtArchetype === 'quiet') {
      return {
        roughness: Math.min(0.88, base.roughness + 0.16),
        metalness: Math.max(0.05, base.metalness - 0.08),
        env: base.env - 0.14,
      };
    }

    if (districtArchetype === 'industrial') {
      return {
        roughness: Math.min(0.92, base.roughness + 0.2),
        metalness: Math.max(0.06, base.metalness - 0.04),
        env: base.env - 0.08,
      };
    }

    return base;
  }, [architecture, districtArchetype]);

  const floorWidth = file.width * buildingStyle.widthScale;
  const floorDepth = file.depth * buildingStyle.depthScale;

  const floors = useMemo(
    () => compactFloors(file.commits, maxRenderedFloors),
    [file.commits, maxRenderedFloors],
  );

  const floorGeometry = useMemo(() => {
    let currentY = 0;

    return floors.map((floor, index) => {
      const height = floorHeight(floor.changes);
      const y = currentY + height / 2;
      currentY += height;

      return {
        id: `${file.path}-${floor.sha}-${index}`,
        floor,
        height,
        y,
      };
    });
  }, [file.path, floors]);

  const floorColors = useMemo(() => {
    return floorGeometry.map(({ floor }) =>
      blendColors(stringToColor(floor.author), districtColor, 0.2),
    );
  }, [districtColor, floorGeometry]);

  useLayoutEffect(() => {
    const mesh = floorMeshRef.current;
    if (!mesh) {
      return;
    }

    for (let index = 0; index < floorGeometry.length; index += 1) {
      const floor = floorGeometry[index];
      if (!floor) {
        continue;
      }

      tempFloorObject.position.set(0, floor.y, 0);
      tempFloorObject.scale.set(1, floor.height, 1);
      tempFloorObject.updateMatrix();
      mesh.setMatrixAt(index, tempFloorObject.matrix);

      const color = new Color(floorColors[index] ?? districtColor);
      mesh.setColorAt(index, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [districtColor, floorColors, floorGeometry, tempFloorObject]);

  const topY = useMemo(() => {
    const lastFloor = floorGeometry[floorGeometry.length - 1];
    if (!lastFloor) {
      return 0.2;
    }

    return lastFloor.y + lastFloor.height / 2;
  }, [floorGeometry]);
  const targetReveal = useMemo(() => {
    if (!constructionMode) {
      return 1;
    }

    const globalProgress = clamp01(constructionProgress);
    const minimumWindow = 0.03;
    let start = constructionWindow?.start;
    let end = constructionWindow?.end;

    if (start === undefined || end === undefined) {
      const seed = hashUnit(file.path);
      const commitSpan = Math.min(0.36, Math.log10(Math.max(2, totalCommitCount + 1)) * 0.22);
      start = seed * 0.58;
      end = Math.min(1, start + 0.2 + commitSpan);
    }

    const boundedStart = Math.min(clamp01(start), Math.max(0, 1 - minimumWindow));
    const boundedEnd = Math.max(boundedStart + minimumWindow, clamp01(end));
    const localProgress = (globalProgress - boundedStart) / Math.max(minimumWindow, boundedEnd - boundedStart);
    const eased = smoothstep01(localProgress);
    return Math.max(0.02, eased);
  }, [
    constructionMode,
    constructionProgress,
    constructionWindow?.end,
    constructionWindow?.start,
    file.path,
    totalCommitCount,
  ]);

  useEffect(() => {
    if (!constructionMode) {
      revealProgressRef.current = 1;
      revealSeedPathRef.current = null;
      return;
    }

    if (revealSeedPathRef.current === file.path) {
      return;
    }
    revealSeedPathRef.current = file.path;
    revealProgressRef.current = Math.min(
      revealProgressRef.current,
      Math.max(0.08, targetReveal * 0.22),
    );
  }, [constructionMode, file.path, targetReveal]);

  const rainSegments = useMemo(() => {
    const drops = 26;
    const positions: number[] = [];

    for (let index = 0; index < drops; index += 1) {
      const x = (Math.random() - 0.5) * 2.8;
      const y = Math.random() * 2.2;
      const z = (Math.random() - 0.5) * 2.8;

      positions.push(x, y, z);
      positions.push(x, y - 0.45, z);
    }

    return new Float32Array(positions);
  }, []);

  const facadeBandCount = useMemo(
    () => Math.min(7, Math.max(1, Math.round((Math.floor(topY / 2.8) || 1) * detailScale))),
    [detailScale, topY],
  );
  const facadeBands = useMemo(() => {
    if (facadeBandCount <= 0) {
      return [] as number[];
    }

    return Array.from({ length: facadeBandCount }, (_, index) => {
      return (index + 1) * (topY / (facadeBandCount + 1));
    });
  }, [facadeBandCount, topY]);

  const windowPanels = useMemo(() => {
    const maxPanels = performanceTier === 'high' ? 18 : performanceTier === 'medium' ? 13 : 8;
    const minPanels = performanceTier === 'low' ? 3 : 5;
    const count = Math.min(
      maxPanels,
      Math.max(minPanels, Math.floor(topY * (1.35 * detailScale))),
    );
    let seed = 0;
    for (let index = 0; index < file.path.length; index += 1) {
      seed = (seed * 31 + file.path.charCodeAt(index)) | 0;
    }

    return Array.from({ length: count }, (_, index) => {
      seed = (seed * 1664525 + 1013904223) | 0;
      const unitA = ((seed >>> 0) % 1000) / 1000;
      seed = (seed * 1664525 + 1013904223) | 0;
      const unitB = ((seed >>> 0) % 1000) / 1000;
      seed = (seed * 1664525 + 1013904223) | 0;
      const unitC = ((seed >>> 0) % 1000) / 1000;
      const side = unitA > 0.5 ? 1 : -1;

      return {
        id: `${file.path}-window-${index}`,
        x: side * (floorWidth / 2 + 0.02),
        y: 0.24 + unitB * Math.max(0.4, topY - 0.45),
        z: (unitC - 0.5) * floorDepth * 0.82,
        width: 0.028 + unitB * 0.03,
        height: 0.08 + unitC * 0.11,
      };
    });
  }, [detailScale, file.path, floorDepth, floorWidth, performanceTier, topY]);
  const facadeEdgeStrips = useMemo(() => {
    const offsetX = floorWidth / 2 + 0.045;
    const offsetZ = floorDepth / 2 + 0.045;
    const stripHeight = Math.max(0.4, topY * 0.96);

    return [
      { id: `${file.path}-edge-0`, x: offsetX, z: offsetZ, rotate: false },
      { id: `${file.path}-edge-1`, x: -offsetX, z: offsetZ, rotate: false },
      { id: `${file.path}-edge-2`, x: offsetX, z: -offsetZ, rotate: false },
      { id: `${file.path}-edge-3`, x: -offsetX, z: -offsetZ, rotate: false },
      { id: `${file.path}-edge-4`, x: 0, z: offsetZ, rotate: true },
      { id: `${file.path}-edge-5`, x: 0, z: -offsetZ, rotate: true },
    ].map((item, index) => ({
      ...item,
      index,
      stripHeight,
    }));
  }, [file.path, floorDepth, floorWidth, topY]);
  const rooftopModules = useMemo(() => {
    const maxModules = performanceTier === 'high' ? 4 : performanceTier === 'medium' ? 3 : 2;
    const modules = Math.min(maxModules, Math.max(1, Math.floor(importance * maxModules)));
    const result: Array<{ id: string; x: number; z: number; h: number }> = [];
    for (let index = 0; index < modules; index += 1) {
      const angle = (index / modules) * Math.PI * 2 + (file.path.length % 7) * 0.2;
      const radius = Math.max(0.18, Math.min(floorWidth, floorDepth) * 0.18);
      result.push({
        id: `${file.path}-roofmod-${index}`,
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        h: 0.12 + (index % 3) * 0.05,
      });
    }
    return result;
  }, [file.path, floorDepth, floorWidth, importance, performanceTier]);

  const latestCommit = file.commits[file.commits.length - 1] ?? null;
  const hologramLabel = useMemo(() => {
    if (!latestCommit) {
      return null;
    }

    const churn = Math.round(file.totalChanges / Math.max(1, file.commits.length));
    const author = latestCommit.author.length > 20
      ? `${latestCommit.author.slice(0, 20)}…`
      : latestCommit.author;

    return {
      author,
      churn,
    };
  }, [file.commits.length, file.totalChanges, latestCommit]);

  useFrame(({ clock }, delta) => {
    const previousReveal = revealProgressRef.current;
    const blend = 1 - Math.exp(-delta * 6.2);
    const reveal = previousReveal + (targetReveal - previousReveal) * blend;
    revealProgressRef.current = reveal;
    const easedReveal = 1 - (1 - reveal) * (1 - reveal);
    if (rootRef.current) {
      const scaleY = 0.03 + easedReveal * 0.97;
      rootRef.current.scale.y = scaleY;
    }
    if (floorMaterialRef.current) {
      floorMaterialRef.current.opacity = 0.12 + easedReveal * 0.88;
      floorMaterialRef.current.transparent = floorMaterialRef.current.opacity < 0.99;
      floorMaterialRef.current.depthWrite = floorMaterialRef.current.opacity >= 0.99;
    }
    const revealSettled =
      Math.abs(targetReveal - revealProgressRef.current) < 0.001 && !constructionMode;
    const hasDynamicNeed =
      weatherEffectsEnabled ||
      isHovered ||
      isSelected ||
      isHotspot ||
      showRiskAura ||
      windowAnimationEnabled ||
      facadeAnimationEnabled ||
      modeAnimationEnabled;
    if (revealSettled && !hasDynamicNeed) {
      return;
    }
    if (animationStep > 0) {
      animationAccumulatorRef.current += delta;
      if (animationAccumulatorRef.current < animationStep) {
        return;
      }
      animationAccumulatorRef.current = 0;
    }

    if (weatherGroupRef.current && weatherEffectsEnabled) {
      weatherGroupRef.current.position.y = topY + 1.1 + Math.sin(clock.elapsedTime * 2.5) * 0.12;
      weatherGroupRef.current.rotation.y += 0.0015;
    }

    if (stormMaterialRef.current) {
      const pulse = 0.45 + Math.max(0, Math.sin(clock.elapsedTime * 7.5)) * 1.35;
      stormMaterialRef.current.emissiveIntensity = mood === 'storm' ? pulse : 0.35;
    }

    if (hoverRingRef.current && (isHovered || isSelected)) {
      const scale = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.06;
      hoverRingRef.current.scale.set(scale, 1, scale);
      hoverRingRef.current.position.y = topY + 0.2 + Math.sin(clock.elapsedTime * 2.2) * 0.05;
    }

    if (hotspotBeamRef.current && isHotspot) {
      const beamScale = 0.88 + Math.sin(clock.elapsedTime * 2.8) * 0.18;
      hotspotBeamRef.current.scale.set(beamScale, 1, beamScale);
    }

    if (riskAuraRef.current && showRiskAura) {
      const pulse = 1 + Math.sin(clock.elapsedTime * (2.8 + riskScore * 4.5)) * (0.04 + riskScore * 0.1);
      riskAuraRef.current.scale.set(pulse, 1, pulse);
      riskAuraRef.current.position.y = 0.08 + Math.sin(clock.elapsedTime * 1.7) * 0.015;
    }

    if (windowAnimationEnabled) {
      windowMaterialRefs.current.forEach((material, index) => {
        if (!material) {
          return;
        }
        const blink =
          0.25 +
          Math.max(0, Math.sin(clock.elapsedTime * (2.1 + (index % 5) * 0.28) + index)) * 0.9;
        material.emissiveIntensity = blink * (0.5 + importance * 0.9);
        material.opacity = 0.24 + blink * 0.28;
      });
    }

    if (facadeAnimationEnabled) {
      facadeEdgeMaterialRefs.current.forEach((material, index) => {
        if (!material) {
          return;
        }
        const pulse = 0.38 + Math.max(0, Math.sin(clock.elapsedTime * 2.4 + index * 0.9)) * 0.95;
        material.emissiveIntensity = pulse * (0.35 + importance * 0.8);
        material.opacity = 0.2 + pulse * 0.2;
      });
    }

    if (repairSparksRef.current && mood === 'storm') {
      repairSparksRef.current.rotation.y += 0.035;
      repairSparksRef.current.position.y = topY + 0.86 + Math.sin(clock.elapsedTime * 6) * 0.08;
    }

    if (rooftopBeaconRef.current) {
      const scale = 1 + Math.sin(clock.elapsedTime * 3.6) * 0.1;
      rooftopBeaconRef.current.scale.set(scale, 1, scale);
      rooftopBeaconRef.current.position.y = topY + 0.24 + Math.sin(clock.elapsedTime * 2.1) * 0.03;
    }

    if (modeSignatureRef.current && modeAnimationEnabled) {
      modeSignatureRef.current.rotation.y +=
        viewMode === 'architecture'
          ? 0.012
          : viewMode === 'risk'
            ? 0.006
            : viewMode === 'stack'
              ? 0.009
              : 0.004;
    }

    if (modeAnimationEnabled) {
      modeMarkerMaterialRefs.current.forEach((material, index) => {
        if (!material) {
          return;
        }
        const wave = 0.35 + Math.max(0, Math.sin(clock.elapsedTime * 2.6 + index * 0.8));
        material.emissiveIntensity =
          wave *
          (viewMode === 'risk'
            ? 1.15
            : viewMode === 'architecture'
              ? 0.9
              : viewMode === 'stack'
                ? 0.82
                : 0.7);
        material.opacity = 0.18 + wave * 0.18;
      });
    }
  });

  useEffect(() => {
    if (windowAnimationEnabled) {
      return;
    }
    windowMaterialRefs.current.forEach((material) => {
      if (!material) {
        return;
      }
      material.emissiveIntensity = 0.46 + importance * 0.42;
      material.opacity = 0.26 + importance * 0.16;
    });
  }, [importance, windowAnimationEnabled]);

  useEffect(() => {
    if (facadeAnimationEnabled) {
      return;
    }
    facadeEdgeMaterialRefs.current.forEach((material) => {
      if (!material) {
        return;
      }
      material.emissiveIntensity = 0.3 + importance * 0.4;
      material.opacity = 0.2 + importance * 0.1;
    });
  }, [facadeAnimationEnabled, importance]);

  useEffect(() => {
    if (modeAnimationEnabled) {
      return;
    }
    modeMarkerMaterialRefs.current.forEach((material) => {
      if (!material) {
        return;
      }
      material.emissiveIntensity =
        viewMode === 'risk' ? 0.85 : viewMode === 'architecture' ? 0.64 : viewMode === 'stack' ? 0.58 : 0.5;
      material.opacity = 0.24;
    });
  }, [modeAnimationEnabled, viewMode]);

  const emissiveIntensity =
    (isHovered || isSelected ? 0.24 : 0.08) +
    buildingStyle.glowBias +
    importance * 0.24 * skylineBoost;
  const roofHeight = Math.max(
    0.32,
    Math.min(2.8, (topY * 0.18 + 0.35) * (0.92 + importance * 0.45 * skylineBoost)),
  );
  const riskColor = riskScore >= 0.55 ? '#ff5b73' : riskScore >= 0.3 ? '#ffb25d' : '#ffd86c';
  const modeAccent =
    viewMode === 'risk'
      ? blendColors(accentColor, '#ff6f84', 0.55)
      : viewMode === 'stack'
        ? blendColors(accentColor, '#8fb6ff', 0.6)
        : viewMode === 'architecture'
          ? blendColors(accentColor, '#78f2ff', 0.6)
          : accentColor;

  return (
    <group ref={rootRef} position={[file.x, 0, file.z]}>
      <mesh position={[0, 0.025, 0]} receiveShadow>
        <boxGeometry args={[floorWidth + 0.36, 0.05, floorDepth + 0.36]} />
        <meshStandardMaterial color={districtColor} transparent opacity={0.24} roughness={0.74} />
      </mesh>

      <instancedMesh
        ref={floorMeshRef}
        args={[undefined, undefined, floorGeometry.length]}
        castShadow
        receiveShadow
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(file.path);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          onHover(null);
          document.body.style.cursor = 'default';
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(file.path);
        }}
      >
        <boxGeometry args={[floorWidth, 1, floorDepth]} />
        <meshStandardMaterial
          ref={floorMaterialRef}
          vertexColors
          emissive="#ffffff"
          emissiveIntensity={emissiveIntensity}
          roughness={materialPreset.roughness}
          metalness={materialPreset.metalness}
          envMapIntensity={materialPreset.env}
        />
      </instancedMesh>

      {showFacadeBands &&
        facadeBands.map((y, index) => (
        <group key={`${file.path}-band-${index}`} position={[0, y, 0]}>
          <mesh position={[floorWidth / 2 + 0.03, 0, 0]}>
            <boxGeometry args={[0.05, 0.08, Math.max(0.2, floorDepth * 0.36)]} />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={0.36}
              transparent
              opacity={0.34}
            />
          </mesh>
          <mesh position={[-(floorWidth / 2 + 0.03), 0, 0]}>
            <boxGeometry args={[0.05, 0.08, Math.max(0.2, floorDepth * 0.36)]} />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={0.36}
              transparent
              opacity={0.34}
            />
          </mesh>
        </group>
      ))}

      {showFacadeStrips &&
        facadeEdgeStrips.map((strip) => (
        <mesh
          key={strip.id}
          position={[
            strip.x,
            strip.stripHeight / 2 + 0.05,
            strip.z,
          ]}
          rotation={strip.rotate ? [0, Math.PI / 2, 0] : [0, 0, 0]}
        >
          <boxGeometry
            args={[
              strip.rotate ? Math.max(0.24, floorDepth * 0.64) : 0.035,
              strip.stripHeight,
              strip.rotate ? 0.035 : Math.max(0.24, floorWidth * 0.64),
            ]}
          />
          <meshStandardMaterial
            ref={(node) => {
              facadeEdgeMaterialRefs.current[strip.index] = node;
            }}
            color={accentColor}
            emissive={accentColor}
            transparent
            opacity={0.28}
            metalness={0.2}
            roughness={0.4}
          />
        </mesh>
      ))}

      {showWindowPanels &&
        windowPanels.map((panel, index) => (
        <mesh key={panel.id} position={[panel.x, panel.y, panel.z]}>
          <planeGeometry args={[panel.width, panel.height]} />
          <meshStandardMaterial
            ref={(node) => {
              windowMaterialRefs.current[index] = node;
            }}
            color={accentColor}
            emissive={accentColor}
            emissiveIntensity={0.45 + importance * 0.6}
            transparent
            opacity={0.36}
            side={2}
          />
        </mesh>
      ))}

      {buildingStyle.roofStyle === 'flat' && (
        <mesh position={[0, topY + 0.08, 0]} castShadow>
          <boxGeometry args={[floorWidth * 0.9, 0.16, floorDepth * 0.9]} />
          <meshStandardMaterial color={accentColor} metalness={0.35} roughness={0.42} />
        </mesh>
      )}

      {buildingStyle.roofStyle === 'spire' && (
        <mesh position={[0, topY + roofHeight / 2, 0]} castShadow>
          <coneGeometry args={[Math.max(0.24, floorWidth * 0.24), roofHeight, coneSegments]} />
          <meshStandardMaterial color={accentColor} metalness={0.5} roughness={0.36} />
        </mesh>
      )}

      {buildingStyle.roofStyle === 'dome' && (
        <mesh position={[0, topY + roofHeight * 0.48, 0]} castShadow>
          <sphereGeometry
            args={[
              Math.max(0.3, Math.min(floorWidth, floorDepth) * 0.28),
              sphereSegments + 6,
              sphereSegments + 2,
              0,
              Math.PI * 2,
              0,
              Math.PI / 2,
            ]}
          />
          <meshStandardMaterial color={accentColor} metalness={0.25} roughness={0.3} />
        </mesh>
      )}

      {buildingStyle.roofStyle === 'terrace' && (
        <mesh position={[0, topY + 0.13, 0]} castShadow>
          <cylinderGeometry args={[floorWidth * 0.38, floorWidth * 0.44, 0.22, 16]} />
          <meshStandardMaterial color={accentColor} metalness={0.28} roughness={0.48} />
        </mesh>
      )}

      {showRoofModules &&
        rooftopModules.map((module) => (
        <mesh
          key={module.id}
          position={[module.x, topY + 0.14 + module.h / 2, module.z]}
          castShadow
        >
          <boxGeometry args={[0.12, module.h, 0.12]} />
          <meshStandardMaterial
            color="#dbe8fb"
            emissive={accentColor}
            emissiveIntensity={0.36 + importance * 0.42}
            metalness={0.42}
            roughness={0.34}
          />
        </mesh>
      ))}

      <group ref={rooftopBeaconRef} position={[0, topY + 0.24, 0]}>
        <mesh>
          <sphereGeometry args={[0.07, sphereSegments, sphereSegments]} />
          <meshStandardMaterial
            color={accentColor}
            emissive={accentColor}
            emissiveIntensity={1.2}
            metalness={0.14}
            roughness={0.36}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.07, 0]}>
          <ringGeometry args={[0.12, 0.19, 20]} />
          <meshStandardMaterial
            color="#f5fbff"
            emissive="#f5fbff"
            emissiveIntensity={0.95}
            transparent
            opacity={0.72}
          />
        </mesh>
      </group>

      {viewMode === 'architecture' && (
        <group ref={modeSignatureRef}>
          <mesh position={[0, topY * 0.5 + 0.04, 0]}>
            <boxGeometry args={[floorWidth * 1.12, Math.max(0.9, topY * 1.02), floorDepth * 1.12]} />
            <meshStandardMaterial
              ref={(node) => {
                modeMarkerMaterialRefs.current[0] = node;
              }}
              color={modeAccent}
              emissive={modeAccent}
              transparent
              opacity={0.2}
              wireframe
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, topY + 0.3, 0]}>
            <ringGeometry args={[0.56, 0.79, ringSegments]} />
            <meshStandardMaterial
              ref={(node) => {
                modeMarkerMaterialRefs.current[1] = node;
              }}
              color={modeAccent}
              emissive={modeAccent}
              transparent
              opacity={0.2}
            />
          </mesh>
        </group>
      )}

      {viewMode === 'risk' && showRiskAura && (
        <group ref={modeSignatureRef}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
            <ringGeometry args={[0.8, 1.08 + riskScore * 0.28, ringSegments]} />
            <meshStandardMaterial
              ref={(node) => {
                modeMarkerMaterialRefs.current[2] = node;
              }}
              color={riskColor}
              emissive={riskColor}
              transparent
              opacity={0.26}
            />
          </mesh>
          <mesh position={[0, topY + 0.48, 0]}>
            <coneGeometry args={[0.16, 0.24, 3]} />
            <meshStandardMaterial
              ref={(node) => {
                modeMarkerMaterialRefs.current[3] = node;
              }}
              color={riskColor}
              emissive={riskColor}
              transparent
              opacity={0.36}
            />
          </mesh>
        </group>
      )}

      {viewMode === 'stack' && (
        <group ref={modeSignatureRef}>
          {[0.26, 0.52, 0.78].map((ratio, index) => (
            <mesh
              key={`${file.path}-stack-ring-${index}`}
              rotation={[Math.PI / 2, 0, 0]}
              position={[0, Math.max(0.22, topY * ratio), 0]}
            >
              <ringGeometry args={[0.46 + index * 0.06, 0.58 + index * 0.06, ringSegments - 4]} />
              <meshStandardMaterial
                ref={(node) => {
                  modeMarkerMaterialRefs.current[4 + index] = node;
                }}
                color={modeAccent}
                emissive={modeAccent}
                transparent
                opacity={0.24}
              />
            </mesh>
          ))}
        </group>
      )}

      {isHotspot && (
        <group>
          <group ref={hotspotBeamRef} position={[0, topY + 1.8, 0]}>
            <mesh>
              <cylinderGeometry args={[0.08, 0.2, 3.3, 12, 1, true]} />
              <meshStandardMaterial color={accentColor} transparent opacity={0.24} />
            </mesh>
          </group>

          {showHologram && hologramLabel && (
            <group position={[0, topY + 2.48, 0]}>
              <mesh>
                <planeGeometry args={[2.5, 0.88]} />
                <meshStandardMaterial
                  color="#0e1528"
                  emissive={accentColor}
                  emissiveIntensity={0.34 + importance * 0.55}
                  transparent
                  opacity={0.74}
                />
              </mesh>
              <Text
                position={[0, 0.12, 0.03]}
                fontSize={0.15}
                color="#c7ecff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.018}
                outlineColor="#06111f"
                maxWidth={2.3}
              >
                {hologramLabel.author}
              </Text>
              <Text
                position={[0, -0.17, 0.03]}
                fontSize={0.12}
                color="#8dd8ff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.015}
                outlineColor="#06111f"
                maxWidth={2.3}
              >
                {`churn ${hologramLabel.churn}`}
              </Text>
            </group>
          )}
        </group>
      )}

      {(isHovered || isSelected) && (
        <group ref={hoverRingRef} position={[0, topY + 0.2, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.62, 0.82, ringSegments - 2]} />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={0.85}
              transparent
              opacity={0.62}
            />
          </mesh>
        </group>
      )}

      {showRiskAura && (
        <group ref={riskAuraRef}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.68, 0.95 + riskScore * 0.38, ringSegments]} />
            <meshStandardMaterial
              color={riskColor}
              emissive={riskColor}
              emissiveIntensity={0.5 + riskScore * 1.2}
              transparent
              opacity={0.14 + riskScore * 0.3}
            />
          </mesh>
          <mesh position={[0, Math.max(0.6, topY * 0.4), 0]}>
            <cylinderGeometry
              args={[
                Math.max(floorWidth, floorDepth) * 0.45,
                Math.max(floorWidth, floorDepth) * 0.54,
                Math.max(1.1, topY * 0.78),
                coneSegments + 2,
                1,
                true,
              ]}
            />
            <meshStandardMaterial
              color={riskColor}
              emissive={riskColor}
              emissiveIntensity={0.38 + riskScore * 0.7}
              transparent
              opacity={0.06 + riskScore * 0.12}
              side={2}
            />
          </mesh>
        </group>
      )}

      <mesh position={[0, topY + 0.12, 0]}>
        <circleGeometry args={[0.42, 20]} />
        <meshStandardMaterial
          color={districtColor}
          emissive={accentColor}
          emissiveIntensity={0.4 + buildingStyle.glowBias + importance * 0.5}
        />
      </mesh>

      {weatherEffectsEnabled && (
        <group ref={weatherGroupRef}>
          {mood === 'rain' && (
            <lineSegments>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[rainSegments, 3]} />
              </bufferGeometry>
              <lineBasicMaterial color="#84caff" transparent opacity={0.62} />
            </lineSegments>
          )}

          {mood === 'storm' && (
            <>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.7, 1.16, ringSegments]} />
                <meshStandardMaterial
                  ref={stormMaterialRef}
                  color={accentColor}
                  emissive={accentColor}
                  transparent
                  opacity={0.82}
                />
              </mesh>
              <group ref={repairSparksRef}>
                <mesh>
                  <sphereGeometry args={[0.06, sphereSegments, sphereSegments]} />
                  <meshStandardMaterial
                    color="#f0f7ff"
                    emissive="#f0f7ff"
                    emissiveIntensity={1.4}
                  />
                </mesh>
                <mesh position={[0.14, 0.03, -0.06]}>
                  <sphereGeometry args={[0.035, sphereSegments, sphereSegments]} />
                  <meshStandardMaterial
                    color={accentColor}
                    emissive={accentColor}
                    emissiveIntensity={1.7}
                  />
                </mesh>
              </group>
            </>
          )}

          {mood === 'sun' && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.68, 1.1, ringSegments]} />
              <meshStandardMaterial
                color="#ffd96a"
                emissive="#ffd96a"
                emissiveIntensity={0.84}
                transparent
                opacity={0.65}
              />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
});
