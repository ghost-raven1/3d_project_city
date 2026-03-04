import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { CityBounds } from './types';

interface AirTrafficProps {
  enabled: boolean;
  cityBounds: CityBounds;
  color: string;
  seed: number;
}

interface Lane {
  radiusX: number;
  radiusZ: number;
  height: number;
  speed: number;
  phase: number;
}

export function AirTraffic({ enabled, cityBounds, color, seed }: AirTrafficProps) {
  const refs = useRef<Array<Group | null>>([]);

  const lanes = useMemo<Lane[]>(() => {
    const count = 16;

    return Array.from({ length: count }, (_, index) => {
      const layer = (index % 4) + 1;
      return {
        radiusX: cityBounds.size * (0.22 + layer * 0.08),
        radiusZ: cityBounds.size * (0.19 + layer * 0.07),
        height: 2 + layer * 1.1 + ((seed + index * 7) % 6) * 0.35,
        speed: 0.11 + ((seed + index * 13) % 9) * 0.02,
        phase: (index / count) * Math.PI * 2 + (seed % 43) * 0.02,
      };
    });
  }, [cityBounds.size, seed]);

  useFrame(({ clock }) => {
    if (!enabled) {
      return;
    }

    const t = clock.elapsedTime;
    refs.current.forEach((node, index) => {
      const lane = lanes[index];
      if (!node || !lane) {
        return;
      }

      const angle = t * lane.speed + lane.phase;
      node.position.set(
        cityBounds.centerX + Math.cos(angle) * lane.radiusX,
        lane.height + Math.sin(t * 2.1 + index) * 0.16,
        cityBounds.centerZ + Math.sin(angle) * lane.radiusZ,
      );
      node.rotation.y = angle + Math.PI / 2;
    });
  });

  if (!enabled) {
    return null;
  }

  return (
    <group>
      {lanes.map((lane, index) => (
        <group
          key={`air-${index}`}
          ref={(node) => {
            refs.current[index] = node;
          }}
          position={[cityBounds.centerX + lane.radiusX, lane.height, cityBounds.centerZ]}
        >
          <mesh>
            <capsuleGeometry args={[0.08, 0.26, 6, 10]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={1.15}
              roughness={0.22}
              metalness={0.54}
            />
          </mesh>
          <mesh position={[-0.2, 0, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
