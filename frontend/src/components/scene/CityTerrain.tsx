import { memo, useEffect, useMemo, useRef } from 'react';
import { Grid, MeshReflectorMaterial } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, MeshStandardMaterial, Object3D, PlaneGeometry } from 'three';
import { CityLayout, CityPalette } from '../../utils/city-dna';
import { PositionedFileHistory } from '../../types/repository';
import { createTerrainTexture } from '../../utils/procedural-textures';
import { CityBounds, ImportRoadSegment, PostFxQuality } from './types';
import { SCENE_HUD_GLOW_WHITE } from './scene-hud-colors';

interface CityTerrainProps {
  cityBounds: CityBounds;
  palette: CityPalette;
  layout: CityLayout;
  seed: number;
  wetness: number;
  showGrid: boolean;
  files: PositionedFileHistory[];
  roadSegments: ImportRoadSegment[];
  enableWetReflections: boolean;
  reflectionQuality: PostFxQuality;
  quality: PostFxQuality;
}

interface Pylon {
  x: number;
  z: number;
  height: number;
}

interface TreeSpot {
  x: number;
  z: number;
  height: number;
  crown: number;
  hueJitter: number;
}

interface LakeSpot {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  levelY: number;
  tintShift: number;
}

interface RockSpot {
  x: number;
  z: number;
  size: number;
  height: number;
  rotX: number;
  rotY: number;
  tone: number;
}

function terrainNoise(x: number, z: number, seed: number): number {
  const base = Math.sin((x + seed * 0.009) * 0.06) * 0.44;
  const secondary = Math.cos((z - seed * 0.007) * 0.08) * 0.36;
  const ripple = Math.sin((x + z) * 0.12 + seed * 0.004) * 0.18;
  return base + secondary + ripple;
}

function seededRandomFactory(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function distancePointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lengthSq = vx * vx + vz * vz;
  if (lengthSq < 0.0001) {
    return Math.hypot(px - ax, pz - az);
  }

  const projection = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lengthSq));
  const closestX = ax + vx * projection;
  const closestZ = az + vz * projection;
  return Math.hypot(px - closestX, pz - closestZ);
}

function distancePointToFootprint(
  px: number,
  pz: number,
  footprint: PositionedFileHistory,
): number {
  const dx = Math.max(Math.abs(px - footprint.x) - footprint.width * 0.5, 0);
  const dz = Math.max(Math.abs(pz - footprint.z) - footprint.depth * 0.5, 0);
  return Math.hypot(dx, dz);
}

export const CityTerrain = memo(function CityTerrain({
  cityBounds,
  palette,
  layout,
  seed,
  wetness,
  showGrid,
  files,
  roadSegments,
  enableWetReflections,
  reflectionQuality,
  quality,
}: CityTerrainProps) {
  const pulseMaterialsRef = useRef<Array<MeshStandardMaterial | null>>([]);
  const treeTrunkMeshRef = useRef<InstancedMesh | null>(null);
  const treeLowerCrownMeshRef = useRef<InstancedMesh | null>(null);
  const treeUpperCrownMeshRef = useRef<InstancedMesh | null>(null);
  const treeDummy = useMemo(() => new Object3D(), []);
  const treeColor = useMemo(() => new Color(), []);
  const qualityScale = useMemo(
    () => (quality === 'high' ? 1 : quality === 'medium' ? 0.72 : 0.46),
    [quality],
  );
  const terrainGeometry = useMemo(() => {
    const width = cityBounds.size * 1.85;
    const depth = cityBounds.size * 1.85;
    const geometry = new PlaneGeometry(width, depth, 72, 72);
    const position = geometry.attributes.position;

    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const elevation = terrainNoise(x, y, seed);
      position.setZ(index, elevation);
    }

    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, [cityBounds.size, seed]);

  useEffect(() => {
    return () => {
      terrainGeometry.dispose();
    };
  }, [terrainGeometry]);

  const terrainTexture = useMemo(() => {
    return createTerrainTexture(seed, palette);
  }, [palette, seed]);

  useEffect(() => {
    return () => {
      terrainTexture.dispose();
    };
  }, [terrainTexture]);

  const pylons = useMemo<Pylon[]>(() => {
    const baseCount = 14 + (seed % 7);
    const count = Math.max(
      quality === 'low' ? 6 : 9,
      Math.round(baseCount * qualityScale),
    );
    const radius = cityBounds.size * 0.52;

    return Array.from({ length: count }, (_, index) => {
      const phase = (index / Math.max(1, count)) * Math.PI * 2 + (seed % 19) * 0.07;
      const jitter = 0.9 + ((seed + index * 13) % 7) * 0.07;

      return {
        x: cityBounds.centerX + Math.cos(phase) * radius * jitter,
        z: cityBounds.centerZ + Math.sin(phase) * radius * jitter,
        height: 2.4 + ((seed + index * 11) % 12) * 0.25,
      };
    });
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, quality, qualityScale, seed]);

  const radialSpokes = useMemo(() => {
    if (layout !== 'radial') {
      return [] as Array<{ x: number; z: number; length: number; angle: number }>;
    }

    const count = 10;
    const length = cityBounds.size * 0.78;

    return Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2 + (seed % 13) * 0.03;
      const reach = length * (0.78 + ((seed + index * 5) % 9) * 0.03);

      return {
        x: cityBounds.centerX + Math.cos(angle) * reach * 0.5,
        z: cityBounds.centerZ + Math.sin(angle) * reach * 0.5,
        length: reach,
        angle,
      };
    });
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, layout, seed]);

  const roadLines = useMemo(() => {
    return roadSegments.flatMap((segment) => {
      const lines: Array<{ x1: number; z1: number; x2: number; z2: number; width: number }> =
        [];
      for (let index = 0; index < segment.points.length - 1; index += 1) {
        const from = segment.points[index];
        const to = segment.points[index + 1];
        if (!from || !to) {
          continue;
        }

        lines.push({
          x1: from.x,
          z1: from.z,
          x2: to.x,
          z2: to.z,
          width: segment.width,
        });
      }
      return lines;
    });
  }, [roadSegments]);

  const lakes = useMemo<LakeSpot[]>(() => {
    const random = seededRandomFactory(seed * 23 + files.length * 41);
    const targetCount = Math.max(
      quality === 'low' ? 1 : quality === 'medium' ? 2 : 3,
      Math.min(5, Math.round(2 + qualityScale * 2.4)),
    );
    const result: LakeSpot[] = [];
    const maxAttempts = targetCount * 34;
    const halfSize = cityBounds.size * 0.5;

    for (let attempt = 0; attempt < maxAttempts && result.length < targetCount; attempt += 1) {
      const x = cityBounds.centerX + (random() - 0.5) * cityBounds.size * 1.25;
      const z = cityBounds.centerZ + (random() - 0.5) * cityBounds.size * 1.25;
      const radiusX = 2.4 + random() * 3.7;
      const radiusZ = 2 + random() * 3.2;
      const maxRadius = Math.max(radiusX, radiusZ);

      if (
        x < cityBounds.centerX - halfSize + maxRadius + 1 ||
        x > cityBounds.centerX + halfSize - maxRadius - 1 ||
        z < cityBounds.centerZ - halfSize + maxRadius + 1 ||
        z > cityBounds.centerZ + halfSize - maxRadius - 1
      ) {
        continue;
      }

      if (Math.hypot(x - cityBounds.centerX, z - cityBounds.centerZ) < cityBounds.size * 0.14) {
        continue;
      }

      const nearBuilding = files.some(
        (file) => distancePointToFootprint(x, z, file) < maxRadius + 2.2,
      );
      if (nearBuilding) {
        continue;
      }

      const nearRoad = roadLines.some((line) => {
        const clearance = maxRadius + Math.max(0.9, line.width * 3.5);
        return distancePointToSegment(x, z, line.x1, line.z1, line.x2, line.z2) < clearance;
      });
      if (nearRoad) {
        continue;
      }

      const nearPylon = pylons.some(
        (pylon) =>
          Math.hypot(x - pylon.x, z - pylon.z) < maxRadius + 0.9,
      );
      if (nearPylon) {
        continue;
      }

      const intersectsLake = result.some((lake) => {
        const dist = Math.hypot(x - lake.x, z - lake.z);
        const existing = Math.max(lake.radiusX, lake.radiusZ);
        return dist < maxRadius + existing + 2.4;
      });
      if (intersectsLake) {
        continue;
      }

      result.push({
        x,
        z,
        radiusX,
        radiusZ,
        levelY: -0.045 - random() * 0.02,
        tintShift: random(),
      });
    }

    return result;
  }, [
    cityBounds.centerX,
    cityBounds.centerZ,
    cityBounds.size,
    files,
    pylons,
    quality,
    qualityScale,
    roadLines,
    seed,
  ]);

  const rocks = useMemo<RockSpot[]>(() => {
    const random = seededRandomFactory(seed * 29 + files.length * 53);
    const targetCount = Math.max(
      quality === 'low' ? 18 : quality === 'medium' ? 34 : 56,
      Math.round((cityBounds.size * 0.54 + files.length * 0.08) * qualityScale),
    );
    const result: RockSpot[] = [];
    const maxAttempts = targetCount * 26;
    const halfSize = cityBounds.size * 0.5;

    for (let attempt = 0; attempt < maxAttempts && result.length < targetCount; attempt += 1) {
      const x = cityBounds.centerX + (random() - 0.5) * cityBounds.size * 1.34;
      const z = cityBounds.centerZ + (random() - 0.5) * cityBounds.size * 1.34;
      const size = 0.22 + random() * 0.92;
      const footprint = size * 0.72;

      if (
        x < cityBounds.centerX - halfSize + footprint + 0.8 ||
        x > cityBounds.centerX + halfSize - footprint - 0.8 ||
        z < cityBounds.centerZ - halfSize + footprint + 0.8 ||
        z > cityBounds.centerZ + halfSize - footprint - 0.8
      ) {
        continue;
      }

      const nearBuilding = files.some(
        (file) => distancePointToFootprint(x, z, file) < footprint + 0.86,
      );
      if (nearBuilding) {
        continue;
      }

      const nearRoad = roadLines.some((line) => {
        const clearance = footprint + Math.max(0.42, line.width * 1.7);
        return distancePointToSegment(x, z, line.x1, line.z1, line.x2, line.z2) < clearance;
      });
      if (nearRoad) {
        continue;
      }

      const nearLake = lakes.some((lake) => {
        const lakeRadius = Math.max(lake.radiusX, lake.radiusZ);
        return Math.hypot(x - lake.x, z - lake.z) < lakeRadius + footprint + 1;
      });
      if (nearLake) {
        continue;
      }

      const nearPylon = pylons.some(
        (pylon) => Math.hypot(x - pylon.x, z - pylon.z) < footprint + 0.66,
      );
      if (nearPylon) {
        continue;
      }

      const intersectsRock = result.some((rock) => {
        const dist = Math.hypot(x - rock.x, z - rock.z);
        return dist < footprint + rock.size * 0.72 + 0.24;
      });
      if (intersectsRock) {
        continue;
      }

      result.push({
        x,
        z,
        size,
        height: 0.38 + random() * 0.92,
        rotX: (random() - 0.5) * 0.4,
        rotY: random() * Math.PI * 2,
        tone: random(),
      });
    }

    return result;
  }, [
    cityBounds.centerX,
    cityBounds.centerZ,
    cityBounds.size,
    files,
    lakes,
    pylons,
    quality,
    qualityScale,
    roadLines,
    seed,
  ]);

  const trees = useMemo<TreeSpot[]>(() => {
    const random = seededRandomFactory(seed * 17 + files.length * 31);
    const targetCount = Math.min(
      Math.round(240 * qualityScale),
      Math.max(
        quality === 'low' ? 26 : quality === 'medium' ? 52 : 90,
        Math.round((cityBounds.size * 0.85 + files.length * 0.1) * qualityScale),
      ),
    );
    const result: TreeSpot[] = [];
    const maxAttempts = targetCount * 24;

    for (let attempt = 0; attempt < maxAttempts && result.length < targetCount; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const radius = cityBounds.size * (0.16 + random() * 0.78);
      const x =
        cityBounds.centerX + Math.cos(angle) * radius + (random() - 0.5) * 4.2;
      const z =
        cityBounds.centerZ + Math.sin(angle) * radius + (random() - 0.5) * 4.2;

      if (
        Math.hypot(x - cityBounds.centerX, z - cityBounds.centerZ) <
        cityBounds.size * 0.16
      ) {
        continue;
      }

      const nearBuilding = files.some(
        (file) =>
          Math.abs(x - file.x) <= file.width * 0.68 + 1 &&
          Math.abs(z - file.z) <= file.depth * 0.68 + 1,
      );
      if (nearBuilding) {
        continue;
      }

      const nearRoad = roadLines.some((line) => {
        const clearance = Math.max(0.45, line.width * 2.4);
        return (
          distancePointToSegment(x, z, line.x1, line.z1, line.x2, line.z2) < clearance
        );
      });
      if (nearRoad) {
        continue;
      }

      const nearLake = lakes.some((lake) => {
        const lakeRadius = Math.max(lake.radiusX, lake.radiusZ);
        return Math.hypot(x - lake.x, z - lake.z) < lakeRadius + 0.85;
      });
      if (nearLake) {
        continue;
      }

      const nearRock = rocks.some(
        (rock) => Math.hypot(x - rock.x, z - rock.z) < rock.size * 0.72 + 0.36,
      );
      if (nearRock) {
        continue;
      }

      result.push({
        x,
        z,
        height: 0.85 + random() * 1.8,
        crown: 0.34 + random() * 0.62,
        hueJitter: -8 + random() * 22,
      });
    }

    return result;
  }, [
    cityBounds.centerX,
    cityBounds.centerZ,
    cityBounds.size,
    files,
    quality,
    qualityScale,
    lakes,
    rocks,
    roadLines,
    seed,
  ]);
  const treeCastsShadow = quality !== 'low';

  useEffect(() => {
    const trunkMesh = treeTrunkMeshRef.current;
    const lowerCrownMesh = treeLowerCrownMeshRef.current;
    const upperCrownMesh = treeUpperCrownMeshRef.current;
    if (!trunkMesh || !lowerCrownMesh || !upperCrownMesh) {
      return;
    }

    trees.forEach((tree, index) => {
      treeDummy.position.set(tree.x, tree.height * 0.5, tree.z);
      treeDummy.scale.set(1, tree.height, 1);
      treeDummy.rotation.set(0, 0, 0);
      treeDummy.updateMatrix();
      trunkMesh.setMatrixAt(index, treeDummy.matrix);

      const hue = ((((116 + tree.hueJitter) % 360) + 360) % 360) / 360;
      treeColor.setHSL(hue, 0.36, 0.36);

      treeDummy.position.set(tree.x, tree.height * 0.56, tree.z);
      treeDummy.scale.set(tree.crown * 0.95, tree.crown * 1.25, tree.crown * 0.95);
      treeDummy.rotation.set(0, 0, 0);
      treeDummy.updateMatrix();
      lowerCrownMesh.setMatrixAt(index, treeDummy.matrix);
      lowerCrownMesh.setColorAt(index, treeColor);

      treeDummy.position.set(tree.x, tree.height * 0.9, tree.z);
      treeDummy.scale.set(tree.crown * 0.74, tree.crown, tree.crown * 0.74);
      treeDummy.rotation.set(0, 0, 0);
      treeDummy.updateMatrix();
      upperCrownMesh.setMatrixAt(index, treeDummy.matrix);
      upperCrownMesh.setColorAt(index, treeColor);
    });

    trunkMesh.count = trees.length;
    lowerCrownMesh.count = trees.length;
    upperCrownMesh.count = trees.length;
    trunkMesh.instanceMatrix.needsUpdate = true;
    lowerCrownMesh.instanceMatrix.needsUpdate = true;
    upperCrownMesh.instanceMatrix.needsUpdate = true;
    if (lowerCrownMesh.instanceColor) {
      lowerCrownMesh.instanceColor.needsUpdate = true;
    }
    if (upperCrownMesh.instanceColor) {
      upperCrownMesh.instanceColor.needsUpdate = true;
    }
  }, [treeColor, treeDummy, trees]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    pulseMaterialsRef.current.forEach((material, index) => {
      if (!material) {
        return;
      }

      const pulse = 0.25 + Math.sin(t * 1.4 + index * 0.85) * 0.06;
      material.opacity = pulse;
      material.emissiveIntensity = 0.55 + Math.sin(t * 1.9 + index * 0.6) * 0.15;
    });
  });

  return (
    <>
      <mesh
        geometry={terrainGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[cityBounds.centerX, -0.2, cityBounds.centerZ]}
        receiveShadow
      >
        <meshStandardMaterial
          color={palette.ground}
          map={terrainTexture}
          roughness={0.84}
          metalness={0.06}
          envMapIntensity={0.28}
        />
      </mesh>

      {enableWetReflections ? (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[cityBounds.centerX, 0.065, cityBounds.centerZ]}
        >
          <planeGeometry args={[cityBounds.size * 1.5, cityBounds.size * 1.5]} />
          <MeshReflectorMaterial
            color="#e8f2ff"
            resolution={
              reflectionQuality === 'high'
                ? 1024
                : reflectionQuality === 'medium'
                  ? 768
                  : 512
            }
            blur={
              reflectionQuality === 'high'
                ? [420, 160]
                : reflectionQuality === 'medium'
                  ? [260, 110]
                  : [160, 80]
            }
            mixBlur={reflectionQuality === 'low' ? 0.48 : 0.62}
            mixStrength={0.2 + wetness * 0.45}
            mirror={0.14 + wetness * 0.28}
            roughness={0.32 + (1 - wetness) * 0.22}
            metalness={0.08 + wetness * 0.14}
            depthScale={0.32}
            minDepthThreshold={0.68}
            maxDepthThreshold={1.35}
            transparent
            opacity={0.18 + wetness * 0.16}
          />
        </mesh>
      ) : (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[cityBounds.centerX, 0.07, cityBounds.centerZ]}
        >
          <planeGeometry args={[cityBounds.size * 1.5, cityBounds.size * 1.5]} />
          <meshStandardMaterial
            color={SCENE_HUD_GLOW_WHITE}
            emissive={SCENE_HUD_GLOW_WHITE}
            emissiveIntensity={0.05 + wetness * 0.04}
            roughness={0.92}
            metalness={0.04}
            transparent
            opacity={0.025 + wetness * 0.025}
          />
        </mesh>
      )}

      {lakes.map((lake, index) => {
        const waterColor = new Color('#4ca9d9')
          .lerp(new Color(palette.accent), 0.25 + lake.tintShift * 0.18)
          .getStyle();
        return (
          <group key={`lake-${index}`} position={[lake.x, 0, lake.z]}>
            <mesh position={[0, lake.levelY - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1, 42]} />
              <meshStandardMaterial
                color="#2f4f6d"
                roughness={0.92}
                metalness={0.04}
                transparent
                opacity={0.45}
              />
            </mesh>
            <mesh
              position={[0, lake.levelY, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[lake.radiusX, lake.radiusZ, 1]}
            >
              <circleGeometry args={[1, 56]} />
              <meshStandardMaterial
                color={waterColor}
                emissive={waterColor}
                emissiveIntensity={0.18 + wetness * 0.22}
                roughness={0.22}
                metalness={0.36}
                transparent
                opacity={0.58 + wetness * 0.12}
              />
            </mesh>
            <mesh
              position={[0, lake.levelY + 0.003, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[lake.radiusX * 1.05, lake.radiusZ * 1.05, 1]}
            >
              <ringGeometry args={[1, 1.12, 48]} />
              <meshStandardMaterial
                color="#8fd6ff"
                emissive={palette.accent}
                emissiveIntensity={0.3}
                transparent
                opacity={0.3}
              />
            </mesh>
          </group>
        );
      })}

      {rocks.map((rock, index) => (
        <mesh
          key={`rock-${index}`}
          position={[rock.x, rock.height * 0.52, rock.z]}
          rotation={[rock.rotX, rock.rotY, 0]}
          scale={[rock.size * 0.88, rock.height, rock.size]}
          castShadow={quality !== 'low'}
          receiveShadow
        >
          <dodecahedronGeometry args={[0.58, 0]} />
          <meshStandardMaterial
            color={
              new Color('#768193')
                .lerp(new Color('#a3b0bf'), rock.tone * 0.42)
                .getStyle()
            }
            roughness={0.92}
            metalness={0.05}
          />
        </mesh>
      ))}

      {showGrid &&
        [0.24, 0.39, 0.58].map((radiusRatio, index) => (
          <mesh
            key={`pulse-ring-${radiusRatio}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[cityBounds.centerX, 0.04 + index * 0.004, cityBounds.centerZ]}
          >
            <ringGeometry
              args={[
                cityBounds.size * radiusRatio,
                cityBounds.size * (radiusRatio + 0.016),
                180,
              ]}
            />
            <meshStandardMaterial
              ref={(node) => {
                pulseMaterialsRef.current[index] = node;
              }}
              color={index === 1 ? palette.gridSection : palette.accent}
              emissive={palette.accent}
              transparent
              opacity={0.08}
            />
          </mesh>
        ))}

      {layout === 'ribbon' && (
        <mesh
          rotation={[-Math.PI / 2, 0.1, 0]}
          position={[cityBounds.centerX, 0.05, cityBounds.centerZ + cityBounds.size * 0.04]}
        >
          <planeGeometry args={[cityBounds.size * 1.58, 13]} />
          <meshStandardMaterial
            color={palette.accent}
            emissive={palette.accent}
            emissiveIntensity={0.28}
            transparent
            opacity={0.24}
          />
        </mesh>
      )}

      {radialSpokes.map((spoke, index) => (
        <mesh
          key={`spoke-${index}`}
          position={[spoke.x, 0.05, spoke.z]}
          rotation={[0, spoke.angle, 0]}
        >
          <boxGeometry args={[spoke.length, 0.035, 0.18]} />
          <meshStandardMaterial
            color={palette.gridSection}
            emissive={palette.accent}
            emissiveIntensity={0.35}
            transparent
            opacity={0.24}
          />
        </mesh>
      ))}

      {showGrid && (
        <Grid
          position={[cityBounds.centerX, 0.02, cityBounds.centerZ]}
          args={[cityBounds.size * 1.8, cityBounds.size * 1.8]}
          cellSize={4}
          cellThickness={0.06}
          cellColor={palette.gridCell}
          sectionSize={20}
          sectionThickness={0.16}
          sectionColor={palette.gridSection}
          infiniteGrid={false}
          fadeDistance={cityBounds.size * 0.7}
          fadeStrength={2.4}
        />
      )}

      {pylons.map((pylon, index) => (
        <group key={`pylon-${index}`} position={[pylon.x, 0, pylon.z]}>
          <mesh castShadow>
            <boxGeometry args={[0.28, pylon.height, 0.28]} />
            <meshStandardMaterial color="#b4c6df" metalness={0.22} roughness={0.72} />
          </mesh>
          <mesh position={[0, pylon.height / 2 + 0.2, 0]}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial
              color={palette.accent}
              emissive={palette.accent}
              emissiveIntensity={1}
            />
          </mesh>
        </group>
      ))}

      {trees.length > 0 && (
        <>
          <instancedMesh ref={treeTrunkMeshRef} args={[undefined, undefined, trees.length]} castShadow={treeCastsShadow}>
            <cylinderGeometry args={[0.06, 0.08, 1, 7]} />
            <meshStandardMaterial color="#69513e" roughness={0.86} metalness={0.02} />
          </instancedMesh>
          <instancedMesh
            ref={treeLowerCrownMeshRef}
            args={[undefined, undefined, trees.length]}
            castShadow={treeCastsShadow}
          >
            <coneGeometry args={[1, 1, 8]} />
            <meshStandardMaterial roughness={0.9} metalness={0.02} vertexColors />
          </instancedMesh>
          <instancedMesh
            ref={treeUpperCrownMeshRef}
            args={[undefined, undefined, trees.length]}
            castShadow={treeCastsShadow}
          >
            <coneGeometry args={[1, 1, 8]} />
            <meshStandardMaterial roughness={0.9} metalness={0.02} vertexColors />
          </instancedMesh>
        </>
      )}
    </>
  );
});
