import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { TourPoint } from './types';

interface BuilderDronesProps {
  points: TourPoint[];
  enabled: boolean;
  speed: number;
  color: string;
}

export function BuilderDrones({
  points,
  enabled,
  speed,
  color,
}: BuilderDronesProps) {
  const droneRefs = useRef<Array<Group | null>>([]);

  useFrame(({ clock }) => {
    if (!enabled || points.length === 0) {
      return;
    }

    droneRefs.current.forEach((node, index) => {
      if (!node) {
        return;
      }

      const anchor = points[index % points.length];
      const t = clock.elapsedTime * speed + index * 1.2;

      node.position.set(
        anchor.x + Math.sin(t) * 1.6,
        anchor.y + 2.4 + Math.sin(t * 2.4) * 0.45,
        anchor.z + Math.cos(t) * 1.6,
      );
      node.rotation.y += 0.03;
    });
  });

  if (!enabled || points.length === 0) {
    return null;
  }

  return (
    <group>
      {points.slice(0, 14).map((point, index) => (
        <group
          key={`${point.x}-${point.z}-${index}`}
          ref={(node) => {
            droneRefs.current[index] = node;
          }}
          position={[point.x, point.y + 2.2, point.z]}
        >
          <mesh castShadow>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.92} />
          </mesh>
          <mesh position={[0, -0.22, 0]}>
            <boxGeometry args={[0.7, 0.03, 0.12]} />
            <meshStandardMaterial color="#2c3f5e" />
          </mesh>
          <mesh position={[0, -0.22, 0]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.7, 0.03, 0.12]} />
            <meshStandardMaterial color="#2c3f5e" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
