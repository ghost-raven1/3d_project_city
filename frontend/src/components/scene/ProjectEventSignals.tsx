import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, MeshStandardMaterial } from 'three';
import { ProjectCityEvent } from './types';

interface ProjectEventSignalsProps {
  events: ProjectCityEvent[];
  mode: 'overview' | 'architecture' | 'risk' | 'stack';
  intensityBoost?: number;
}

export const ProjectEventSignals = memo(function ProjectEventSignals({
  events,
  mode,
  intensityBoost = 1,
}: ProjectEventSignalsProps) {
  const refs = useRef<Array<Group | null>>([]);
  const materials = useRef<Array<MeshStandardMaterial | null>>([]);

  const modeBoost = useMemo(() => {
    if (mode === 'risk') {
      return 1.22;
    }
    if (mode === 'architecture') {
      return 1.08;
    }
    if (mode === 'stack') {
      return 0.82;
    }
    return 1;
  }, [mode]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((node, index) => {
      const event = events[index];
      if (!node || !event) {
        return;
      }

      const pulse = 1 + Math.sin(t * (2.8 + event.intensity * 3.2) + index) * 0.22;
      node.scale.setScalar(pulse);
      node.position.y = event.y + 0.06 + Math.sin(t * 3.4 + index) * 0.08;
    });

    materials.current.forEach((material, index) => {
      const event = events[index];
      if (!material || !event) {
        return;
      }

      const wave = 0.45 + Math.max(0, Math.sin(t * (4 + event.intensity * 2.5) + index)) * 1.1;
      material.emissiveIntensity = wave * modeBoost * intensityBoost * (0.6 + event.intensity * 0.7);
      material.opacity = Math.min(0.94, 0.24 + wave * 0.26);
    });
  });

  return (
    <group>
      {events.map((event, index) => {
        const color =
          event.type === 'accident'
            ? '#ff6077'
            : event.type === 'recovery'
              ? '#48d79c'
              : event.type === 'release'
                ? '#5ac8ff'
                : '#f7e47b';

        return (
          <group
            key={event.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            position={[event.x, event.y, event.z]}
          >
            {event.type === 'accident' && (
              <>
                <mesh>
                  <cylinderGeometry args={[0.05, 0.11, 0.9 + event.intensity * 0.8, 12]} />
                  <meshStandardMaterial
                    ref={(node) => {
                      materials.current[index] = node;
                    }}
                    color={color}
                    emissive={color}
                    transparent
                    opacity={0.42}
                  />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.22, 0.34 + event.intensity * 0.18, 24]} />
                  <meshStandardMaterial color={color} emissive={color} transparent opacity={0.35} />
                </mesh>
              </>
            )}

            {event.type === 'recovery' && (
              <>
                <mesh>
                  <coneGeometry args={[0.18 + event.intensity * 0.1, 0.54 + event.intensity * 0.2, 10]} />
                  <meshStandardMaterial
                    ref={(node) => {
                      materials.current[index] = node;
                    }}
                    color={color}
                    emissive={color}
                    transparent
                    opacity={0.38}
                  />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.2, 0.32 + event.intensity * 0.14, 24]} />
                  <meshStandardMaterial color={color} emissive={color} transparent opacity={0.3} />
                </mesh>
              </>
            )}

            {event.type === 'release' && (
              <>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.24, 0.4 + event.intensity * 0.22, 28]} />
                  <meshStandardMaterial
                    ref={(node) => {
                      materials.current[index] = node;
                    }}
                    color={color}
                    emissive={color}
                    transparent
                    opacity={0.34}
                  />
                </mesh>
                <mesh position={[0, 0.12, 0]}>
                  <sphereGeometry args={[0.07 + event.intensity * 0.04, 10, 10]} />
                  <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
                </mesh>
              </>
            )}

            {event.type === 'flash' && (
              <>
                <mesh>
                  <sphereGeometry args={[0.08 + event.intensity * 0.05, 10, 10]} />
                  <meshStandardMaterial
                    ref={(node) => {
                      materials.current[index] = node;
                    }}
                    color={color}
                    emissive={color}
                    transparent
                    opacity={0.46}
                  />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.15, 0.28 + event.intensity * 0.16, 24]} />
                  <meshStandardMaterial color={color} emissive={color} transparent opacity={0.28} />
                </mesh>
              </>
            )}
          </group>
        );
      })}
    </group>
  );
});
