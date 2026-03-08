import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Group, MeshStandardMaterial, PointLight } from 'three';
import { PostFxQuality, ProjectCityEvent, SceneViewMode } from './types';

interface EventFireworksProps {
  events: ProjectCityEvent[];
  mode: SceneViewMode;
  accentColor: string;
  quality: PostFxQuality;
  presetIntensity?: number;
  musicPulse?: number;
}

interface FireworkBurst {
  id: string;
  x: number;
  y: number;
  z: number;
  strength: number;
  color: string;
  sparkColor: string;
  phase: number;
  tempo: number;
  sparkCount: number;
}

function hashToUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000000) / 1000000;
}

function cycle01(value: number): number {
  const normalized = value % 1;
  return normalized < 0 ? normalized + 1 : normalized;
}

function blendHex(colorA: string, colorB: string, factor: number): string {
  const mixed = new Color(colorA).lerp(
    new Color(colorB),
    Math.max(0, Math.min(1, factor)),
  );
  return `#${mixed.getHexString()}`;
}

function eventBaseColor(type: ProjectCityEvent['type']): string {
  if (type === 'release') {
    return '#5fc8ff';
  }
  if (type === 'flash') {
    return '#ffd86e';
  }
  if (type === 'accident') {
    return '#ff6c80';
  }
  return '#58e4ad';
}

function modeBurstBoost(mode: SceneViewMode): number {
  if (mode === 'risk') {
    return 1.2;
  }
  if (mode === 'architecture') {
    return 1.08;
  }
  if (mode === 'stack') {
    return 0.82;
  }
  return 1;
}

function modeTempoBoost(mode: SceneViewMode): number {
  if (mode === 'risk') {
    return 1.18;
  }
  if (mode === 'architecture') {
    return 1.06;
  }
  if (mode === 'stack') {
    return 0.88;
  }
  return 1;
}

export const EventFireworks = memo(function EventFireworks({
  events,
  mode,
  accentColor,
  quality,
  presetIntensity = 1,
  musicPulse = 0,
}: EventFireworksProps) {
  const burstRefs = useRef<Array<Group | null>>([]);
  const lightRefs = useRef<Array<PointLight | null>>([]);
  const trailMaterialsRef = useRef<Array<MeshStandardMaterial | null>>([]);
  const coreMaterialsRef = useRef<Array<MeshStandardMaterial | null>>([]);
  const waveMaterialsRef = useRef<Array<MeshStandardMaterial | null>>([]);
  const sparkMaterialsRef = useRef<Array<Array<MeshStandardMaterial | null>>>([]);

  const tunedPreset = useMemo(
    () => Math.max(0.55, Math.min(1.8, presetIntensity)),
    [presetIntensity],
  );
  const clampedMusicPulse = useMemo(
    () => Math.max(0, Math.min(1, musicPulse)),
    [musicPulse],
  );

  const bursts = useMemo<FireworkBurst[]>(() => {
    if (events.length === 0) {
      return [];
    }

    const qualityBudget = quality === 'low' ? 5 : quality === 'medium' ? 9 : 13;
    const modeBudgetScale = mode === 'risk' ? 1.16 : mode === 'stack' ? 0.72 : 1;
    const maxBursts = Math.max(
      4,
      Math.round(
        qualityBudget *
          modeBudgetScale *
          (0.74 + tunedPreset * 0.24) *
          (1 + clampedMusicPulse * 0.18),
      ),
    );

    const ranked = events.slice(0, maxBursts * 2);

    const result: FireworkBurst[] = [];
    ranked.forEach((event) => {
      const copies = event.type === 'release' ? 2 : event.type === 'flash' ? 2 : 1;
      for (let copy = 0; copy < copies; copy += 1) {
        if (result.length >= maxBursts) {
          return;
        }
        const seed = hashToUnit(`${event.id}:firework:${copy}`);
        const phase = seed * Math.PI * 2;
        const angle = phase * Math.PI * 1.26;
        const spread = 0.24 + copy * 0.22 + seed * 0.16;
        const color = blendHex(eventBaseColor(event.type), accentColor, 0.42);
        result.push({
          id: `${event.id}-firework-${copy}`,
          x: event.x + Math.cos(angle) * spread,
          y:
            event.y +
            (event.type === 'release' ? 0.5 : event.type === 'flash' ? 0.44 : 0.3),
          z: event.z + Math.sin(angle) * spread,
          strength: Math.max(0.25, Math.min(1.18, event.intensity * (0.82 + copy * 0.1))),
          color,
          sparkColor: blendHex(color, '#f2fbff', 0.32),
          phase,
          tempo: 0.32 + event.intensity * 0.3 + copy * 0.07,
          sparkCount: event.type === 'release' ? 10 : event.type === 'flash' ? 8 : 6,
        });
      }
    });

    return result.slice(0, maxBursts);
  }, [accentColor, clampedMusicPulse, events, mode, quality, tunedPreset]);

  const burstBoost = useMemo(() => modeBurstBoost(mode), [mode]);
  const tempoBoost = useMemo(() => modeTempoBoost(mode), [mode]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    const tunedBurstBoost =
      burstBoost * (0.82 + tunedPreset * 0.22) * (1 + clampedMusicPulse * 0.44);
    const tunedTempo =
      tempoBoost * (0.84 + tunedPreset * 0.16) * (1 + clampedMusicPulse * 0.2);

    burstRefs.current.forEach((node, index) => {
      const burst = bursts[index];
      if (!node || !burst) {
        return;
      }

      const cycle = cycle01(time * burst.tempo * tunedTempo + burst.phase);
      const pop = Math.sin(cycle * Math.PI);
      const bloom = Math.pow(Math.max(0, pop), 0.78);
      const decay = Math.max(0, 1 - Math.max(0, cycle - 0.62) / 0.38);

      node.position.y = burst.y + 0.14 + bloom * (0.86 + burst.strength * 0.36);
      node.scale.set(
        0.24 + bloom * (1.16 + burst.strength * 0.44),
        0.58 + bloom * 0.84,
        0.24 + bloom * (1.16 + burst.strength * 0.44),
      );
      node.rotation.y = (time * (0.3 + burst.strength * 0.14) + burst.phase) % (Math.PI * 2);

      const light = lightRefs.current[index];
      if (light) {
        light.intensity = (0.32 + bloom * 4.4) * decay * tunedBurstBoost;
        light.distance = 3 + burst.strength * 3 + bloom * 2.4;
      }
    });

    trailMaterialsRef.current.forEach((material, index) => {
      const burst = bursts[index];
      if (!material || !burst) {
        return;
      }
      const cycle = cycle01(time * burst.tempo * tunedTempo + burst.phase);
      const launch = Math.max(0, 1 - Math.abs(cycle - 0.12) * 10);
      material.opacity = Math.min(0.74, 0.12 + launch * 0.48);
      material.emissiveIntensity = (0.2 + launch * 1.5) * tunedBurstBoost;
    });

    coreMaterialsRef.current.forEach((material, index) => {
      const burst = bursts[index];
      if (!material || !burst) {
        return;
      }
      const cycle = cycle01(time * burst.tempo * tunedTempo + burst.phase);
      const pop = Math.sin(cycle * Math.PI);
      const bloom = Math.pow(Math.max(0, pop), 0.78);
      const decay = Math.max(0, 1 - Math.max(0, cycle - 0.62) / 0.38);
      material.opacity = Math.min(0.98, (0.36 + bloom * 0.58) * decay);
      material.emissiveIntensity = (0.82 + bloom * 3.6) * tunedBurstBoost;
    });

    waveMaterialsRef.current.forEach((material, index) => {
      const burst = bursts[index];
      if (!material || !burst) {
        return;
      }
      const cycle = cycle01(time * burst.tempo * tunedTempo + burst.phase);
      const pop = Math.sin(cycle * Math.PI);
      const bloom = Math.pow(Math.max(0, pop), 0.92);
      const decay = Math.max(0, 1 - Math.max(0, cycle - 0.56) / 0.44);
      material.opacity = Math.min(0.72, (0.08 + bloom * 0.28) * decay);
      material.emissiveIntensity = (0.28 + bloom * 2) * tunedBurstBoost;
    });

    sparkMaterialsRef.current.forEach((sparkRow, index) => {
      const burst = bursts[index];
      if (!burst || !sparkRow) {
        return;
      }
      const cycle = cycle01(time * burst.tempo * tunedTempo + burst.phase);
      const pop = Math.sin(cycle * Math.PI);
      const bloom = Math.pow(Math.max(0, pop), 0.78);
      const decay = Math.max(0, 1 - Math.max(0, cycle - 0.62) / 0.38);
      sparkRow.forEach((material, sparkIndex) => {
        if (!material) {
          return;
        }
        const flicker =
          0.72 +
          Math.max(0, Math.sin(time * 9.6 + sparkIndex * 1.08 + burst.phase * 5.2)) *
            0.52;
        material.opacity = Math.min(0.95, (0.2 + bloom * 0.46) * decay);
        material.emissiveIntensity = flicker * (0.52 + bloom * 1.7) * tunedBurstBoost;
      });
    });
  });

  if (bursts.length === 0) {
    return null;
  }

  return (
    <group>
      {bursts.map((burst, index) => (
        <group
          key={burst.id}
          ref={(node) => {
            burstRefs.current[index] = node;
          }}
          position={[burst.x, burst.y, burst.z]}
          scale={[0.24, 0.58, 0.24]}
        >
          <pointLight
            ref={(node) => {
              lightRefs.current[index] = node;
            }}
            color={burst.color}
            intensity={1.4}
            distance={5.6}
            decay={2}
          />

          <mesh position={[0, -0.5, 0]}>
            <cylinderGeometry args={[0.026, 0.014, 0.96 + burst.strength * 0.24, 8]} />
            <meshStandardMaterial
              ref={(material) => {
                trailMaterialsRef.current[index] = material;
              }}
              color="#d8ecff"
              emissive={burst.color}
              emissiveIntensity={0.48}
              transparent
              opacity={0.22}
            />
          </mesh>

          <mesh>
            <sphereGeometry args={[0.18 + burst.strength * 0.05, 12, 12]} />
            <meshStandardMaterial
              ref={(material) => {
                coreMaterialsRef.current[index] = material;
              }}
              color={burst.color}
              emissive={burst.color}
              emissiveIntensity={1.34}
              transparent
              opacity={0.78}
            />
          </mesh>

          <mesh>
            <sphereGeometry args={[0.36 + burst.strength * 0.09, 16, 16]} />
            <meshStandardMaterial
              ref={(material) => {
                waveMaterialsRef.current[index] = material;
              }}
              color={burst.color}
              emissive={burst.color}
              emissiveIntensity={0.92}
              transparent
              wireframe
              opacity={0.24}
            />
          </mesh>

          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
            <ringGeometry args={[0.24, 0.42 + burst.strength * 0.16, 24]} />
            <meshStandardMaterial
              color={burst.color}
              emissive={burst.color}
              transparent
              opacity={0.16}
            />
          </mesh>

          {Array.from({ length: burst.sparkCount }).map((_, sparkIndex) => {
            const angle = (sparkIndex / burst.sparkCount) * Math.PI * 2;
            const spread = 0.34 + burst.strength * 0.2;
            const lift = Math.sin((sparkIndex + 1) * 0.7) * 0.12;

            return (
              <mesh
                key={`${burst.id}-spark-${sparkIndex}`}
                position={[
                  Math.cos(angle) * spread,
                  lift,
                  Math.sin(angle) * spread,
                ]}
                rotation={[0, -angle, Math.PI / 2]}
              >
                <capsuleGeometry args={[0.012, 0.3 + burst.strength * 0.18, 4, 8]} />
                <meshStandardMaterial
                  ref={(material) => {
                    if (!sparkMaterialsRef.current[index]) {
                      sparkMaterialsRef.current[index] = [];
                    }
                    sparkMaterialsRef.current[index][sparkIndex] = material;
                  }}
                  color={burst.sparkColor}
                  emissive={burst.color}
                  emissiveIntensity={1.22}
                  transparent
                  opacity={0.52}
                />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
});
