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
  kind: 'car' | 'ship';
  size: number;
  trail: number;
  bob: number;
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
      const hash = ((Math.sin((seed * 0.19 + index * 1.37) * 12.9898) * 43758.5453) % 1 + 1) % 1;
      const kind: Lane['kind'] = hash > 0.72 ? 'ship' : 'car';
      const size = kind === 'ship' ? 1.24 + hash * 0.44 : 0.88 + hash * 0.28;
      return {
        radiusX: cityBounds.size * (0.22 + layer * 0.08),
        radiusZ: cityBounds.size * (0.19 + layer * 0.07),
        height: 2 + layer * 1.1 + ((seed + index * 7) % 6) * 0.35,
        speed: 0.11 + ((seed + index * 13) % 9) * 0.02,
        phase: (index / count) * Math.PI * 2 + (seed % 43) * 0.02,
        kind,
        size,
        trail: 0.08 + hash * 0.16,
        bob: 0.09 + hash * 0.08,
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
        lane.height + Math.sin(t * 2.1 + index) * lane.bob,
        buildingFootprints,
        0.14,
        1.35 + (index % 3) * 0.18 + lane.size * 0.12,
      );
      slot.rotationY = angle + Math.PI / 2;
      desired[index] = slot;
    });

    desired.length = lanes.length;
    resolvePairwiseRepulsion(desired, 0.95, 0.58);
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
          {lane.kind === 'car' ? (
            <>
              <mesh scale={[lane.size, 1, lane.size]}>
                <boxGeometry args={[0.4, 0.12, 0.22]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={1}
                  roughness={0.28}
                  metalness={0.48}
                />
              </mesh>
              <mesh position={[0.03, 0.07, 0]} scale={[lane.size, 1, lane.size]}>
                <capsuleGeometry args={[0.06, 0.2, 4, 8]} />
                <meshStandardMaterial
                  color="#d8f2ff"
                  emissive="#b2ebff"
                  emissiveIntensity={0.95}
                  roughness={0.12}
                  metalness={0.24}
                />
              </mesh>
              <mesh position={[-0.24 * lane.size, 0, 0]} scale={[lane.size, 1, lane.size]}>
                <sphereGeometry args={[0.045, 8, 8]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.35} />
              </mesh>
            </>
          ) : (
            <>
              <mesh rotation={[0, 0, Math.PI / 2]} scale={[lane.size, lane.size, lane.size]}>
                <capsuleGeometry args={[0.08, 0.48, 8, 12]} />
                <meshStandardMaterial
                  color="#dbe8ff"
                  emissive={color}
                  emissiveIntensity={0.8}
                  roughness={0.2}
                  metalness={0.6}
                />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} scale={[lane.size, lane.size, lane.size]}>
                <torusGeometry args={[0.18, 0.024, 10, 26]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
              </mesh>
              <mesh position={[0.24 * lane.size, 0, 0]} scale={[lane.size, lane.size, lane.size]}>
                <coneGeometry args={[0.08, 0.18, 8]} />
                <meshStandardMaterial color="#f3fbff" emissive={color} emissiveIntensity={0.95} />
              </mesh>
            </>
          )}
          <mesh position={[-0.34 * lane.size, 0, 0]}>
            <sphereGeometry args={[lane.trail, 8, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
