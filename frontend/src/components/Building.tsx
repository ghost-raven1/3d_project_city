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

interface BuildingProps {
  file: PositionedFileHistory;
  districtColor: string;
  districtArchetype: DistrictArchetype;
  accentColor: string;
  architecture: CityArchitecture;
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
  constructionMode: boolean;
  constructionProgress: number;
  onHover: (path: string | null) => void;
  onSelect: (path: string) => void;
}

function blendColors(colorA: string, colorB: string, factor: number): string {
  const mixed = new Color(colorA).lerp(new Color(colorB), Math.max(0, Math.min(1, factor)));
  return `#${mixed.getHexString()}`;
}

export const Building = memo(function Building({
  file,
  districtColor,
  districtArchetype,
  accentColor,
  architecture,
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
  const repairSparksRef = useRef<Group>(null);
  const revealProgressRef = useRef(1);
  const tempFloorObject = useMemo(() => new Object3D(), []);

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

    const total = Math.max(1, totalCommitCount);
    const localProgress = Math.min(1, file.commits.length / total);
    const globalProgress = Math.min(1, Math.max(0, constructionProgress));
    const blended = localProgress * 0.82 + globalProgress * 0.18;
    return Math.min(1, Math.max(0.05, blended));
  }, [constructionMode, constructionProgress, file.commits.length, totalCommitCount]);

  useEffect(() => {
    if (!constructionMode) {
      revealProgressRef.current = 1;
      return;
    }

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

  const facadeBandCount = Math.min(7, Math.max(2, Math.floor(topY / 2.8)));
  const facadeBands = useMemo(() => {
    if (facadeBandCount <= 0) {
      return [] as number[];
    }

    return Array.from({ length: facadeBandCount }, (_, index) => {
      return (index + 1) * (topY / (facadeBandCount + 1));
    });
  }, [facadeBandCount, topY]);

  const windowPanels = useMemo(() => {
    const count = Math.min(18, Math.max(6, Math.floor(topY * 1.35)));
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
  }, [file.path, floorDepth, floorWidth, topY]);

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

  useFrame(({ clock }) => {
    const previousReveal = revealProgressRef.current;
    const reveal = previousReveal + (targetReveal - previousReveal) * 0.09;
    revealProgressRef.current = reveal;
    const easedReveal = 1 - (1 - reveal) * (1 - reveal);
    if (rootRef.current) {
      const scaleY = 0.1 + easedReveal * 0.9;
      rootRef.current.scale.y = scaleY;
    }
    if (floorMaterialRef.current) {
      floorMaterialRef.current.opacity = 0.2 + easedReveal * 0.8;
      floorMaterialRef.current.transparent = floorMaterialRef.current.opacity < 0.99;
      floorMaterialRef.current.depthWrite = floorMaterialRef.current.opacity >= 0.99;
    }

    if (weatherGroupRef.current && showWeather) {
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

    if (riskAuraRef.current && riskScore > 0.08) {
      const pulse = 1 + Math.sin(clock.elapsedTime * (2.8 + riskScore * 4.5)) * (0.04 + riskScore * 0.1);
      riskAuraRef.current.scale.set(pulse, 1, pulse);
      riskAuraRef.current.position.y = 0.08 + Math.sin(clock.elapsedTime * 1.7) * 0.015;
    }

    windowMaterialRefs.current.forEach((material, index) => {
      if (!material) {
        return;
      }

      const blink = 0.25 + Math.max(0, Math.sin(clock.elapsedTime * (2.1 + (index % 5) * 0.28) + index)) * 0.9;
      material.emissiveIntensity = blink * (0.5 + importance * 0.9);
      material.opacity = 0.24 + blink * 0.28;
    });

    if (repairSparksRef.current && mood === 'storm') {
      repairSparksRef.current.rotation.y += 0.035;
      repairSparksRef.current.position.y = topY + 0.86 + Math.sin(clock.elapsedTime * 6) * 0.08;
    }
  });

  const emissiveIntensity =
    (isHovered || isSelected ? 0.24 : 0.08) +
    buildingStyle.glowBias +
    importance * 0.24 * skylineBoost;
  const roofHeight = Math.max(
    0.32,
    Math.min(2.8, (topY * 0.18 + 0.35) * (0.92 + importance * 0.45 * skylineBoost)),
  );
  const riskColor = riskScore >= 0.55 ? '#ff5b73' : riskScore >= 0.3 ? '#ffb25d' : '#ffd86c';

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

      {facadeBands.map((y, index) => (
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

      {windowPanels.map((panel, index) => (
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
          <coneGeometry args={[Math.max(0.24, floorWidth * 0.24), roofHeight, 14]} />
          <meshStandardMaterial color={accentColor} metalness={0.5} roughness={0.36} />
        </mesh>
      )}

      {buildingStyle.roofStyle === 'dome' && (
        <mesh position={[0, topY + roofHeight * 0.48, 0]} castShadow>
          <sphereGeometry
            args={[
              Math.max(0.3, Math.min(floorWidth, floorDepth) * 0.28),
              18,
              14,
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
            <ringGeometry args={[0.62, 0.82, 26]} />
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

      {riskScore > 0.08 && (
        <group ref={riskAuraRef}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.68, 0.95 + riskScore * 0.38, 32]} />
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
                16,
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

      {showWeather && (
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
                <ringGeometry args={[0.7, 1.16, 28]} />
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
                  <sphereGeometry args={[0.06, 8, 8]} />
                  <meshStandardMaterial
                    color="#f0f7ff"
                    emissive="#f0f7ff"
                    emissiveIntensity={1.4}
                  />
                </mesh>
                <mesh position={[0.14, 0.03, -0.06]}>
                  <sphereGeometry args={[0.035, 8, 8]} />
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
              <ringGeometry args={[0.68, 1.1, 28]} />
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
