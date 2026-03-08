import { memo, useMemo, useRef } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Color, Group, MeshStandardMaterial } from 'three';
import { ProjectCityEvent, SceneViewMode } from './types';
import {
  SCENE_HUD_GLOW_WHITE,
  SCENE_HUD_OUTLINE_DARK,
  SCENE_HUD_TEXT_PRIMARY,
  SCENE_HUD_TEXT_SECONDARY,
} from './scene-hud-colors';
import { SCENE_MOTION } from './scene-motion';

interface CityActivitiesProps {
  events: ProjectCityEvent[];
  mode: SceneViewMode;
  accentColor: string;
  presetIntensity?: number;
}

interface ActivityNode {
  id: string;
  eventType: ProjectCityEvent['type'];
  x: number;
  y: number;
  z: number;
  intensity: number;
  color: string;
  title: string;
  subtitle: string;
}

interface ActivityOrbiter {
  id: string;
  activityIndex: number;
  radius: number;
  speed: number;
  phase: number;
  height: number;
  color: string;
}

const titlesByType: Record<ProjectCityEvent['type'], string[]> = {
  flash: ['Glitch Hunt', 'Arcade Sprint', 'Neon Side Quest'],
  accident: ['Rescue Run', 'Patch Patrol', 'Crisis Quest'],
  recovery: ['Repair Jam', 'Rebuild Rally', 'Stability Camp'],
  release: ['Launch Parade', 'Hyperdrive Premiere', 'Portal Opening'],
};

const subtitlesByType: Record<ProjectCityEvent['type'], string[]> = {
  flash: ['TRON grid vibes', 'Ready Player pulse', 'Matrix deja-vu'],
  accident: ['Ghostbusters protocol', 'RoboCop response', 'Pacific Rim alert'],
  recovery: ['1-UP energy', 'Wall-E cleanup', 'Starfleet maintenance'],
  release: ['Millennium jump', 'TARDIS lane', 'Aperture test'],
};

function pick<T>(items: T[], index: number): T {
  return items[((index % items.length) + items.length) % items.length] as T;
}

function blendHex(colorA: string, colorB: string, factor: number): string {
  const mixed = new Color(colorA).lerp(
    new Color(colorB),
    Math.max(0, Math.min(1, factor)),
  );
  return `#${mixed.getHexString()}`;
}

function baseColor(type: ProjectCityEvent['type']): string {
  if (type === 'accident') {
    return '#ff6f83';
  }
  if (type === 'recovery') {
    return '#5fe4ac';
  }
  if (type === 'release') {
    return '#66cfff';
  }
  return '#ffd97d';
}

function modeBoost(mode: SceneViewMode): number {
  if (mode === 'risk') {
    return 1.24;
  }
  if (mode === 'architecture') {
    return 1.1;
  }
  if (mode === 'stack') {
    return 0.86;
  }
  return 1;
}

function modeVelocityBoost(mode: SceneViewMode): number {
  if (mode === 'risk') {
    return 1.22;
  }
  if (mode === 'architecture') {
    return 1.06;
  }
  if (mode === 'stack') {
    return 0.9;
  }
  return 1;
}

export const CityActivities = memo(function CityActivities({
  events,
  mode,
  accentColor,
  presetIntensity = 1,
}: CityActivitiesProps) {
  const groupsRef = useRef<Array<Group | null>>([]);
  const ringMaterialsRef = useRef<Array<MeshStandardMaterial | null>>([]);
  const coreMaterialsRef = useRef<Array<MeshStandardMaterial | null>>([]);
  const orbiterRefs = useRef<Array<Group | null>>([]);
  const orbiterMaterialsRef = useRef<Array<MeshStandardMaterial | null>>([]);

  const tunedPreset = useMemo(
    () => Math.max(0.55, Math.min(1.8, presetIntensity)),
    [presetIntensity],
  );

  const activities = useMemo<ActivityNode[]>(() => {
    if (events.length === 0) {
      return [];
    }

    const limit = Math.max(
      6,
      Math.round((mode === 'stack' ? 8 : 14) * (0.72 + tunedPreset * 0.34)),
    );
    const sorted = [...events]
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, limit);

    const result: ActivityNode[] = [];
    sorted.forEach((event, index) => {
      const extraCopies =
        event.type === 'flash' || event.type === 'release'
          ? mode === 'risk'
            ? 0
            : 1
          : 0;
      const copies = 1 + extraCopies;

      for (let copy = 0; copy < copies; copy += 1) {
        const angle = ((index + 1) * 1.19 + copy * 2.11) % (Math.PI * 2);
        const offset = 0.45 + copy * 0.36 + (index % 3) * 0.08;
        result.push({
          id: `${event.id}-activity-${copy}`,
          eventType: event.type,
          x: event.x + Math.cos(angle) * offset,
          y: 0.06,
          z: event.z + Math.sin(angle) * offset,
          intensity: Math.max(0.2, Math.min(1, event.intensity * (0.86 + copy * 0.08))),
          color: blendHex(baseColor(event.type), accentColor, 0.38),
          title: pick(titlesByType[event.type], index + copy),
          subtitle: pick(subtitlesByType[event.type], index + copy),
        });
      }
    });

    return result.slice(0, limit);
  }, [accentColor, events, mode, tunedPreset]);

  const orbiters = useMemo<ActivityOrbiter[]>(() => {
    return activities.flatMap((activity, activityIndex) => {
      const count = activity.eventType === 'release' || activity.eventType === 'flash' ? 4 : 3;
      return Array.from({ length: count }, (_, orbiterIndex) => ({
        id: `${activity.id}-orbiter-${orbiterIndex}`,
        activityIndex,
        radius: 0.23 + orbiterIndex * 0.09 + activity.intensity * 0.14,
        speed: 0.74 + orbiterIndex * 0.22 + activity.intensity * 0.35,
        phase: (activityIndex + 1) * (orbiterIndex + 1) * 0.63,
        height: 0.08 + orbiterIndex * 0.02,
        color: blendHex(activity.color, '#eef7ff', 0.24),
      }));
    });
  }, [activities]);

  const visualModeBoost = useMemo(() => modeBoost(mode), [mode]);
  const velocityBoost = useMemo(() => modeVelocityBoost(mode), [mode]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;

    groupsRef.current.forEach((node, index) => {
      const activity = activities[index];
      if (!node || !activity) {
        return;
      }

      const bob = Math.sin(
        time * (SCENE_MOTION.activityBobBaseHz + activity.intensity * 1.1) + index * 0.71,
      );
      node.position.y = activity.y + 0.02 + bob * 0.03;
      node.rotation.y = Math.sin(time * 0.45 + index) * 0.28;
    });

    ringMaterialsRef.current.forEach((material, index) => {
      const activity = activities[index];
      if (!material || !activity) {
        return;
      }

      const pulse =
        0.42 +
        Math.max(
          0,
          Math.sin(
            time * (SCENE_MOTION.activityRingPulseBaseHz + activity.intensity * 1.8) + index * 0.6,
          ),
        ) * 1.05;
      material.emissiveIntensity =
        pulse * (0.72 + activity.intensity * 0.88) * visualModeBoost * (0.86 + tunedPreset * 0.2);
      material.opacity = Math.min(0.94, 0.24 + pulse * 0.2);
    });

    coreMaterialsRef.current.forEach((material, index) => {
      const activity = activities[index];
      if (!material || !activity) {
        return;
      }

      const wave =
        0.6 +
        Math.max(0, Math.sin(time * SCENE_MOTION.activityCorePulseBaseHz + index * 0.75)) * 0.7;
      material.emissiveIntensity =
        wave * visualModeBoost * (0.95 + activity.intensity * 0.65) * (0.84 + tunedPreset * 0.18);
    });

    orbiterRefs.current.forEach((node, index) => {
      const orbiter = orbiters[index];
      if (!node || !orbiter) {
        return;
      }

      const activity = activities[orbiter.activityIndex];
      if (!activity) {
        return;
      }

      const angle = time * orbiter.speed * velocityBoost + orbiter.phase;
      node.position.set(
        activity.x + Math.cos(angle) * orbiter.radius,
        activity.y + orbiter.height + Math.sin(angle * 2.2) * 0.02,
        activity.z + Math.sin(angle) * orbiter.radius,
      );
    });

    orbiterMaterialsRef.current.forEach((material, index) => {
      if (!material) {
        return;
      }

      const pulse =
        0.9 +
        Math.max(0, Math.sin(time * SCENE_MOTION.activityOrbiterPulseBaseHz + index * 0.6)) * 0.7;
      material.emissiveIntensity = pulse * (0.85 + tunedPreset * 0.2);
    });
  });

  if (activities.length === 0) {
    return null;
  }

  return (
    <group>
      {activities.map((activity, index) => {
        const titleSize = 0.056 + activity.intensity * 0.018;
        const subtitleSize = 0.037 + activity.intensity * 0.01;

        return (
          <group
            key={activity.id}
            ref={(node) => {
              groupsRef.current[index] = node;
            }}
            position={[activity.x, activity.y, activity.z]}
          >
            <mesh position={[0, 0.015, 0]}>
              <cylinderGeometry args={[0.1, 0.12, 0.03, 14]} />
              <meshStandardMaterial color="#1f2b3c" emissive="#11192a" emissiveIntensity={0.28} />
            </mesh>

            <mesh position={[0, 0.11, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.21 + activity.intensity * 0.08, 0.022, 10, 32]} />
              <meshStandardMaterial
                ref={(node) => {
                  ringMaterialsRef.current[index] = node;
                }}
                color={activity.color}
                emissive={activity.color}
                transparent
                opacity={0.46}
              />
            </mesh>

            <mesh position={[0, 0.2, 0]}>
              <octahedronGeometry args={[0.056 + activity.intensity * 0.03, 0]} />
              <meshStandardMaterial
                ref={(node) => {
                  coreMaterialsRef.current[index] = node;
                }}
                color={SCENE_HUD_GLOW_WHITE}
                emissive={activity.color}
                emissiveIntensity={1.2}
                metalness={0.3}
                roughness={0.26}
              />
            </mesh>

            <Text
              position={[0, 0.32, 0.01]}
              fontSize={titleSize}
              color={SCENE_HUD_TEXT_PRIMARY}
              anchorX="center"
              anchorY="middle"
              maxWidth={2.4}
              outlineWidth={0.008}
              outlineColor={SCENE_HUD_OUTLINE_DARK}
            >
              {activity.title}
            </Text>
            <Text
              position={[0, 0.26, 0.01]}
              fontSize={subtitleSize}
              color={SCENE_HUD_TEXT_SECONDARY}
              anchorX="center"
              anchorY="middle"
              maxWidth={2.5}
              outlineWidth={0.006}
              outlineColor={SCENE_HUD_OUTLINE_DARK}
            >
              {activity.subtitle}
            </Text>

            {index < 8 && (
              <pointLight
                color={activity.color}
                intensity={(0.46 + activity.intensity * 0.64) * visualModeBoost * (0.86 + tunedPreset * 0.2)}
                distance={2.8 + activity.intensity * 2.3}
                decay={2}
                position={[0, 0.2, 0]}
              />
            )}
          </group>
        );
      })}

      {orbiters.map((orbiter, index) => (
        <group
          key={orbiter.id}
          ref={(node) => {
            orbiterRefs.current[index] = node;
          }}
          position={[0, 0, 0]}
        >
          <mesh>
            <sphereGeometry args={[0.018, 8, 8]} />
            <meshStandardMaterial
              ref={(node) => {
                orbiterMaterialsRef.current[index] = node;
              }}
              color={orbiter.color}
              emissive={orbiter.color}
              emissiveIntensity={1.1}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
});
