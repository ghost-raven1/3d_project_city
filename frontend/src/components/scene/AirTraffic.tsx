import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { BuildingFootprint, CityBounds } from './types';
import {
  clampPointToCityBounds,
  ensureAltitudeOverFootprints,
  resolvePairwiseRepulsion,
} from './collision-utils';

interface AirTrafficProps {
  enabled: boolean;
  cityBounds: CityBounds;
  buildingFootprints?: BuildingFootprint[];
  color: string;
  seed: number;
  density?: number;
}

interface Lane {
  radiusX: number;
  radiusZ: number;
  height: number;
  speed: number;
  phase: number;
}

export function AirTraffic({
  enabled,
  cityBounds,
  buildingFootprints = [],
  color,
  seed,
  density = 1,
}: AirTrafficProps) {
  const refs = useRef<Array<Group | null>>([]);
  const desiredPositionsRef = useRef<
    Array<{ x: number; y: number; z: number; rotationY: number }>
  >([]);

  const lanes = useMemo<Lane[]>(() => {
    const normalizedDensity = Math.max(0.3, density);
    const count = Math.max(6, Math.min(32, Math.round(16 * normalizedDensity)));

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
  }, [cityBounds.size, density, seed]);

  useFrame(({ clock }) => {
    if (!enabled) {
      return;
    }

    const t = clock.elapsedTime;
    const desired = desiredPositionsRef.current;
    refs.current.forEach((_, index) => {
      const lane = lanes[index];
      if (!lane) {
        return;
      }

      const angle = t * lane.speed + lane.phase;
      const slot = desired[index] ?? {
        x: cityBounds.centerX,
        y: lane.height,
        z: cityBounds.centerZ,
        rotationY: 0,
      };
      slot.x = cityBounds.centerX + Math.cos(angle) * lane.radiusX;
      slot.z = cityBounds.centerZ + Math.sin(angle) * lane.radiusZ;
      slot.y = ensureAltitudeOverFootprints(
        slot.x,
        slot.z,
        lane.height + Math.sin(t * 2.1 + index) * 0.16,
        buildingFootprints,
        0.14,
        1.35 + (index % 3) * 0.18,
      );
      slot.rotationY = angle + Math.PI / 2;
      desired[index] = slot;
    });

    desired.length = lanes.length;
    resolvePairwiseRepulsion(desired, 0.58, 0.52);
    desired.forEach((point) => {
      clampPointToCityBounds(point, cityBounds, 1.2);
      point.y = ensureAltitudeOverFootprints(
        point.x,
        point.z,
        point.y,
        buildingFootprints,
        0.14,
        1.32,
      );
    });

    refs.current.forEach((node, index) => {
      const point = desired[index];
      if (!node || !point) {
        return;
      }

      node.position.set(point.x, point.y, point.z);
      node.rotation.y = point.rotationY;
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
