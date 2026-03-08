import { memo, useEffect, useMemo, useRef } from 'react';
import {
  Cloud,
  Environment,
  Sky,
  Sparkles,
  Stars,
} from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  LinearFilter,
  Mesh,
  Object3D,
  PointLight,
  SRGBColorSpace,
} from 'three';
import { CityPalette } from '../../utils/city-dna';
import { CityBounds, PostFxQuality } from './types';

interface CyberpunkAtmosphereProps {
  enabled: boolean;
  cityBounds: CityBounds;
  palette: CityPalette;
  seed: number;
  cloudiness: number;
  starDensity: number;
  timeOfDay: 'dawn' | 'day' | 'sunset' | 'night';
  weather: 'clear' | 'mist' | 'rain' | 'storm';
  quality: PostFxQuality;
}

interface NeonOrb {
  x: number;
  y: number;
  z: number;
  radius: number;
  speed: number;
  phase: number;
}

function createSkyboxTexture(seed: number, palette: CityPalette): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) {
    return new CanvasTexture(canvas);
  }

  const top = new Color(palette.sky);
  const horizon = new Color(palette.fog);
  const accent = new Color(palette.accent);
  const sun = new Color(palette.sun);

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, `rgb(${Math.round(top.r * 255)}, ${Math.round(top.g * 255)}, ${Math.round(top.b * 255)})`);
  gradient.addColorStop(
    0.52,
    `rgb(${Math.round(horizon.r * 255)}, ${Math.round(horizon.g * 255)}, ${Math.round(horizon.b * 255)})`,
  );
  gradient.addColorStop(
    1,
    `rgb(${Math.round(top.r * 255 * 0.48)}, ${Math.round(top.g * 255 * 0.48)}, ${Math.round(top.b * 255 * 0.56)})`,
  );
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const seedRand = (() => {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const horizonY = canvas.height * 0.58;
  const glow = context.createRadialGradient(
    canvas.width * 0.52,
    horizonY,
    16,
    canvas.width * 0.52,
    horizonY,
    canvas.width * 0.5,
  );
  glow.addColorStop(
    0,
    `rgba(${Math.round(sun.r * 255)}, ${Math.round(sun.g * 255)}, ${Math.round(sun.b * 255)}, 0.3)`,
  );
  glow.addColorStop(
    0.7,
    `rgba(${Math.round(accent.r * 255)}, ${Math.round(accent.g * 255)}, ${Math.round(accent.b * 255)}, 0.08)`,
  );
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const starCount = 740 + (seed % 220);
  for (let index = 0; index < starCount; index += 1) {
    const x = seedRand() * canvas.width;
    const y = (seedRand() ** 1.75) * (canvas.height * 0.78);
    const size = seedRand() < 0.9 ? 1 : 1.8 + seedRand() * 1.6;
    const alpha = 0.1 + seedRand() * 0.6;
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }

  const stripeCount = 14;
  for (let index = 0; index < stripeCount; index += 1) {
    const y = horizonY + index * 6 + seedRand() * 3;
    const width = canvas.width * (0.5 + seedRand() * 0.44);
    const x = (canvas.width - width) * seedRand();
    const alpha = 0.016 + seedRand() * 0.028;
    context.fillStyle = `rgba(${Math.round(accent.r * 255)}, ${Math.round(accent.g * 255)}, ${Math.round(accent.b * 255)}, ${alpha})`;
    context.fillRect(x, y, width, 1 + seedRand() * 2.2);
  }

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export const CyberpunkAtmosphere = memo(function CyberpunkAtmosphere({
  enabled,
  cityBounds,
  palette,
  seed,
  cloudiness,
  starDensity,
  timeOfDay,
  weather,
  quality,
}: CyberpunkAtmosphereProps) {
  const orbRefs = useRef<Array<Group | null>>([]);
  const skyboxRef = useRef<Mesh | null>(null);
  const edgeRefs = useRef<Array<Group | null>>([]);
  const edgeRingRefs = useRef<Array<Mesh | null>>([]);
  const rainRef = useRef<InstancedMesh | null>(null);
  const lightningRef = useRef<PointLight | null>(null);
  const rainDummy = useMemo(() => new Object3D(), []);
  const qualityScale = useMemo(
    () => (quality === 'high' ? 1 : quality === 'medium' ? 0.72 : 0.48),
    [quality],
  );

  const skyboxTexture = useMemo(
    () => createSkyboxTexture(seed, palette),
    [palette, seed],
  );

  useEffect(() => {
    return () => {
      skyboxTexture.dispose();
    };
  }, [skyboxTexture]);

  const atmosphereClouds = useMemo(() => {
    const weatherCloudBoost =
      weather === 'storm' ? 1.55 : weather === 'rain' ? 1.32 : weather === 'mist' ? 1.45 : 1;
    const timeCloudBoost = timeOfDay === 'night' ? 0.82 : 1;
    const count = Math.max(
      quality === 'low' ? 2 : 3,
      Math.floor(cloudiness * 8 * weatherCloudBoost * timeCloudBoost * qualityScale),
    );
    const clouds = [] as Array<{
      x: number;
      y: number;
      z: number;
      speed: number;
      opacity: number;
      bounds: [number, number, number];
    }>;

    let state = seed;
    for (let index = 0; index < count; index += 1) {
      state = (state * 1664525 + 1013904223) | 0;
      const unitA = ((state >>> 0) % 1000) / 1000;
      state = (state * 1664525 + 1013904223) | 0;
      const unitB = ((state >>> 0) % 1000) / 1000;
      state = (state * 1664525 + 1013904223) | 0;
      const unitC = ((state >>> 0) % 1000) / 1000;

      clouds.push({
        x: cityBounds.centerX + (unitA - 0.5) * cityBounds.size * 0.9,
        y: 20 + unitB * 12,
        z: cityBounds.centerZ + (unitC - 0.5) * cityBounds.size * 0.9,
        speed: 0.07 + unitA * 0.18,
        opacity:
          (0.08 + unitB * 0.14) *
          (weather === 'mist' ? 1.6 : weather === 'storm' ? 1.35 : weather === 'rain' ? 1.2 : 1),
        bounds: [18 + unitC * 16, 1.1 + unitA * 1.2, 2],
      });
    }

    return clouds;
  }, [
    cityBounds.centerX,
    cityBounds.centerZ,
    cityBounds.size,
    cloudiness,
    quality,
    qualityScale,
    seed,
    timeOfDay,
    weather,
  ]);

  const neonOrbs = useMemo<NeonOrb[]>(() => {
    const baseCount = 8 + (seed % 5);
    const count = Math.max(
      quality === 'low' ? 3 : 5,
      Math.round(baseCount * qualityScale),
    );
    const baseRadius = cityBounds.size * 0.34;

    return Array.from({ length: count }, (_, index) => {
      const phase = (index / count) * Math.PI * 2 + (seed % 37) * 0.03;
      const radius = baseRadius * (0.72 + ((seed + index * 17) % 11) * 0.035);
      const speed = 0.16 + ((seed + index * 3) % 9) * 0.016;

      return {
        x: cityBounds.centerX + Math.cos(phase) * radius,
        y: 4.2 + ((seed + index * 23) % 7) * 0.48,
        z: cityBounds.centerZ + Math.sin(phase) * radius,
        radius,
        speed,
        phase,
      };
    });
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, quality, qualityScale, seed]);

  const edgeBands = useMemo(() => {
    const base = cityBounds.size;
    return [
      { radius: base * 0.9, height: 16, opacity: 0.09, glow: 0.4 },
      { radius: base * 0.98, height: 20, opacity: 0.12, glow: 0.56 },
      { radius: base * 1.08, height: 26, opacity: 0.16, glow: 0.76 },
    ];
  }, [cityBounds.size]);
  const rainDrops = useMemo(() => {
    const baseCount = weather === 'storm' ? 440 : weather === 'rain' ? 300 : 0;
    const count =
      baseCount === 0
        ? 0
        : Math.max(quality === 'low' ? 80 : 140, Math.round(baseCount * qualityScale));
    if (count === 0) {
      return [] as Array<{
        x: number;
        y: number;
        z: number;
        speed: number;
        length: number;
      }>;
    }

    let state = seed ^ 0x9e3779b9;
    const next = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const area = cityBounds.size * 0.9;
    return Array.from({ length: count }, () => ({
      x: cityBounds.centerX + (next() - 0.5) * area,
      y: 2 + next() * 22,
      z: cityBounds.centerZ + (next() - 0.5) * area,
      speed: 0.6 + next() * 1.2,
      length: 0.45 + next() * 1.1,
    }));
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, quality, qualityScale, seed, weather]);
  const skyPreset = useMemo(() => {
    const byTime = {
      dawn: {
        turbidity: 8.4,
        rayleigh: 2.1,
        mieCoefficient: 0.0063,
        mieDirectionalG: 0.82,
      },
      day: {
        turbidity: 7,
        rayleigh: 2.2,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.8,
      },
      sunset: {
        turbidity: 9.2,
        rayleigh: 1.9,
        mieCoefficient: 0.0078,
        mieDirectionalG: 0.86,
      },
      night: {
        turbidity: 11.4,
        rayleigh: 0.72,
        mieCoefficient: 0.0084,
        mieDirectionalG: 0.9,
      },
    } as const;
    const base = byTime[timeOfDay];
    const cloudBoost = weather === 'storm' ? 1.22 : weather === 'rain' ? 1.14 : 1;

    return {
      ...base,
      cloudBoost,
      envBlur: weather === 'mist' ? 0.74 : weather === 'storm' ? 0.7 : 0.62,
      cloudOpacityScale:
        weather === 'mist'
          ? 1.35
          : weather === 'rain'
            ? 1.16
            : weather === 'storm'
              ? 1.28
              : 1,
      sparkleOpacity:
        weather === 'storm'
          ? 0.1
          : weather === 'rain'
            ? 0.12
            : weather === 'mist'
              ? 0.15
              : 0.2,
    };
  }, [timeOfDay, weather]);
  const neonStrength = useMemo(() => {
    let value =
      timeOfDay === 'night'
        ? 1
        : timeOfDay === 'sunset'
          ? 0.84
          : timeOfDay === 'dawn'
            ? 0.7
            : 0.56;
    if (weather === 'storm') {
      value += 0.08;
    } else if (weather === 'mist') {
      value += 0.04;
    }
    return Math.max(0.5, Math.min(1.1, value));
  }, [timeOfDay, weather]);

  useFrame(({ clock }, delta) => {
    if (!enabled) {
      return;
    }

    const t = clock.elapsedTime;
    if (skyboxRef.current) {
      skyboxRef.current.rotation.y = t * 0.0045;
      skyboxRef.current.rotation.x = Math.sin(t * 0.05 + seed * 0.0008) * 0.015;
    }

    orbRefs.current.forEach((node, index) => {
      const orb = neonOrbs[index];
      if (!node || !orb) {
        return;
      }

      const angle = t * orb.speed + orb.phase;
      node.position.set(
        cityBounds.centerX + Math.cos(angle) * orb.radius,
        orb.y + Math.sin(t * 1.9 + index) * 0.34,
        cityBounds.centerZ + Math.sin(angle) * orb.radius,
      );
    });

    edgeRefs.current.forEach((node, index) => {
      if (!node) {
        return;
      }

      node.rotation.y = t * (0.018 + index * 0.01);
      node.position.y = 8 + index * 1.8 + Math.sin(t * (0.35 + index * 0.08)) * 0.16;
    });

    if (rainRef.current && rainDrops.length > 0) {
      const topY = 24;
      const minY = 0.25;
      const resetSpread = cityBounds.size * 0.9;
      rainDrops.forEach((drop, index) => {
        drop.y -= drop.speed * delta * 18;
        if (drop.y < minY) {
          drop.y = topY + ((seed + index * 13) % 9);
          drop.x =
            cityBounds.centerX +
            (((seed + index * 41) % 1000) / 1000 - 0.5) * resetSpread;
          drop.z =
            cityBounds.centerZ +
            (((seed + index * 59) % 1000) / 1000 - 0.5) * resetSpread;
        }

        rainDummy.position.set(drop.x, drop.y, drop.z);
        rainDummy.scale.set(1, drop.length, 1);
        rainDummy.updateMatrix();
        rainRef.current?.setMatrixAt(index, rainDummy.matrix);
      });

      rainRef.current.instanceMatrix.needsUpdate = true;
    }

    if (lightningRef.current) {
      if (weather === 'storm') {
        const pulse = Math.sin(t * 5.8 + seed * 0.01);
        lightningRef.current.intensity = pulse > 0.92 ? 1.8 + pulse * 3.4 : 0.08;
      } else {
        lightningRef.current.intensity = 0;
      }
    }

    edgeRingRefs.current.forEach((mesh, index) => {
      if (!mesh) {
        return;
      }

      const material = mesh.material as { opacity?: number; needsUpdate?: boolean };
      if (typeof material.opacity === 'number') {
        material.opacity =
          0.08 + index * 0.03 + Math.sin(t * (0.75 + index * 0.2)) * 0.015;
        material.needsUpdate = true;
      }
    });
  });

  if (!enabled) {
    return null;
  }

  const skySegments = quality === 'high' ? [64, 48] : quality === 'medium' ? [46, 34] : [30, 22];
  const cloudSegments = quality === 'high' ? 14 : quality === 'medium' ? 10 : 7;
  const edgeSegments = quality === 'high' ? 96 : quality === 'medium' ? 72 : 48;
  const ringSegments = quality === 'high' ? 160 : quality === 'medium' ? 108 : 72;
  const mainRingSegments = quality === 'high' ? 220 : quality === 'medium' ? 160 : 110;
  const orbLightBudget = quality === 'high' ? 8 : quality === 'medium' ? 5 : 3;
  const starCount =
    timeOfDay === 'night'
      ? Math.max(
          quality === 'low' ? 200 : 320,
          Math.floor(starDensity * 0.56 * qualityScale),
        )
      : Math.max(
          quality === 'low' ? 90 : 140,
          Math.floor(starDensity * 0.24 * qualityScale),
        );
  const sparkleCount = Math.max(
    quality === 'low' ? 50 : 90,
    Math.round(160 * qualityScale),
  );

  return (
    <>
      <mesh
        ref={skyboxRef}
        position={[cityBounds.centerX, cityBounds.size * 0.2, cityBounds.centerZ]}
        rotation={[0, seed * 0.0005, 0]}
      >
        <sphereGeometry args={[cityBounds.size * 2.8, skySegments[0], skySegments[1]]} />
        <meshBasicMaterial
          map={skyboxTexture}
          side={DoubleSide}
          transparent
          depthWrite={false}
          opacity={
            timeOfDay === 'night'
              ? 0.9
              : timeOfDay === 'sunset'
                ? 0.84
                : timeOfDay === 'dawn'
                  ? 0.78
                  : 0.7
          }
        />
      </mesh>

      <Sky
        distance={450000}
        sunPosition={[65, 48, 72]}
        turbidity={skyPreset.turbidity}
        rayleigh={skyPreset.rayleigh}
        mieCoefficient={skyPreset.mieCoefficient}
        mieDirectionalG={skyPreset.mieDirectionalG}
      />
      <Environment preset="city" blur={skyPreset.envBlur} />
      <Stars
        radius={260}
        depth={80}
        count={starCount}
        factor={1.6}
        saturation={0}
        fade
        speed={0.08}
      />
      <Sparkles
        count={sparkleCount}
        size={2.3}
        speed={0.16}
        opacity={skyPreset.sparkleOpacity * (quality === 'low' ? 0.78 : 1)}
        color={palette.accent}
        scale={[cityBounds.size * 0.7, 44, cityBounds.size * 0.7]}
      />

      {atmosphereClouds.map((cloud, index) => (
        <Cloud
          key={`${cloud.x}-${cloud.z}-${index}`}
          position={[cloud.x, cloud.y, cloud.z]}
          speed={cloud.speed}
          opacity={cloud.opacity * skyPreset.cloudOpacityScale}
          bounds={cloud.bounds}
          segments={cloudSegments}
        />
      ))}

      {rainDrops.length > 0 && (
        <instancedMesh
          ref={rainRef}
          args={[undefined, undefined, rainDrops.length]}
        >
          <boxGeometry args={[0.024, 0.9, 0.024]} />
          <meshStandardMaterial
            color={weather === 'storm' ? '#95bfff' : '#b8dcff'}
            emissive={palette.accent}
            emissiveIntensity={weather === 'storm' ? 0.42 : 0.22}
            transparent
            opacity={weather === 'storm' ? 0.42 : 0.3}
            depthWrite={false}
          />
        </instancedMesh>
      )}

      <pointLight
        ref={lightningRef}
        color="#b9d1ff"
        intensity={0}
        distance={cityBounds.size * 0.75}
        position={[cityBounds.centerX, 22, cityBounds.centerZ]}
        decay={2}
      />

      {neonOrbs.map((orb, index) => (
        <group
          key={`orb-${index}`}
          ref={(node) => {
            orbRefs.current[index] = node;
          }}
          position={[orb.x, orb.y, orb.z]}
        >
          <mesh>
            <sphereGeometry args={[0.16, 12, 12]} />
            <meshStandardMaterial
              color={palette.accent}
              emissive={palette.accent}
              emissiveIntensity={1.1 * neonStrength}
              transparent
              opacity={0.9}
            />
          </mesh>
          {index < orbLightBudget && (
            <pointLight
              color={palette.accent}
              intensity={0.9 * neonStrength}
              distance={8}
              decay={2}
            />
          )}
        </group>
      ))}

      {edgeBands.map((band, index) => (
        <group
          key={`edge-band-${index}`}
          ref={(node) => {
            edgeRefs.current[index] = node;
          }}
          position={[cityBounds.centerX, 8 + index * 1.8, cityBounds.centerZ]}
        >
          <mesh>
            <cylinderGeometry
              args={[
                band.radius,
                band.radius * 1.02,
                band.height,
                edgeSegments,
                1,
                true,
              ]}
            />
            <meshStandardMaterial
              color={palette.fog}
              emissive={palette.accent}
              emissiveIntensity={band.glow * neonStrength}
              transparent
              opacity={band.opacity}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}

      {edgeBands.map((band, index) => (
        <mesh
          key={`edge-ring-${index}`}
          ref={(node) => {
            edgeRingRefs.current[index] = node;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[cityBounds.centerX, 0.11 + index * 0.018, cityBounds.centerZ]}
        >
          <ringGeometry
            args={[band.radius * 0.92, band.radius * 1.05, ringSegments]}
          />
          <meshStandardMaterial
            color={palette.accent}
            emissive={palette.accent}
            emissiveIntensity={(0.52 + index * 0.16) * neonStrength}
            transparent
            opacity={0.08 + index * 0.03}
            depthWrite={false}
          />
        </mesh>
      ))}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[cityBounds.centerX, 0.09, cityBounds.centerZ]}
      >
        <ringGeometry args={[cityBounds.size * 0.64, cityBounds.size * 0.7, mainRingSegments]} />
        <meshStandardMaterial
          color={palette.accent}
          emissive={palette.accent}
          emissiveIntensity={0.62 * neonStrength}
          transparent
          opacity={0.14}
        />
      </mesh>
    </>
  );
});
