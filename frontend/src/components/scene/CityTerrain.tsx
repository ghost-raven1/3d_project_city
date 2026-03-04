import { memo, useEffect, useMemo, useRef } from 'react';
import { Grid } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial, PlaneGeometry } from 'three';
import { CityLayout, CityPalette } from '../../utils/city-dna';
import { createTerrainTexture } from '../../utils/procedural-textures';
import { CityBounds } from './types';

interface CityTerrainProps {
  cityBounds: CityBounds;
  palette: CityPalette;
  layout: CityLayout;
  seed: number;
  wetness: number;
  showGrid: boolean;
}

interface Pylon {
  x: number;
  z: number;
  height: number;
}

function terrainNoise(x: number, z: number, seed: number): number {
  const base = Math.sin((x + seed * 0.009) * 0.06) * 0.44;
  const secondary = Math.cos((z - seed * 0.007) * 0.08) * 0.36;
  const ripple = Math.sin((x + z) * 0.12 + seed * 0.004) * 0.18;
  return base + secondary + ripple;
}

export const CityTerrain = memo(function CityTerrain({
  cityBounds,
  palette,
  layout,
  seed,
  wetness,
  showGrid,
}: CityTerrainProps) {
  const pulseMaterialsRef = useRef<Array<MeshStandardMaterial | null>>([]);
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
    const count = 14 + (seed % 7);
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
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, seed]);

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

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[cityBounds.centerX, 0.07, cityBounds.centerZ]}
      >
        <planeGeometry args={[cityBounds.size * 1.5, cityBounds.size * 1.5]} />
        <meshStandardMaterial
          color="#f7fbff"
          emissive="#f7fbff"
          emissiveIntensity={0.05 + wetness * 0.04}
          roughness={0.92}
          metalness={0.04}
          transparent
          opacity={0.025 + wetness * 0.025}
        />
      </mesh>

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
    </>
  );
});
