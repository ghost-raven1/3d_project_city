import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { BuildingFootprint, CityBounds, SceneViewMode, TourPoint } from './types';
import { dronePoseAt } from './drone-motion';
import { getSceneModePreset } from './view-mode-presets';
import {
  clampPointToCityBounds,
  ensureAltitudeOverFootprints,
  pushPointOutOfFootprints,
  resolvePairwiseRepulsion,
} from './collision-utils';
import { SCENE_HUD_GLOW_WHITE } from './scene-hud-colors';

interface BuilderDronesProps {
  points: TourPoint[];
  enabled: boolean;
  speed: number;
  color: string;
  mode: SceneViewMode;
  cityBounds?: CityBounds | null;
  buildingFootprints?: BuildingFootprint[];
  selectedDroneIndex?: number | null;
  onSelectDrone?: (index: number) => void;
}

export function BuilderDrones({
  points,
  enabled,
  speed,
  color,
  mode,
  cityBounds,
  buildingFootprints = [],
  selectedDroneIndex,
  onSelectDrone,
}: BuilderDronesProps) {
  const droneRefs = useRef<Array<Group | null>>([]);
  const rotorRefs = useRef<Array<Group | null>>([]);
  const pulseRefs = useRef<Array<Group | null>>([]);
  const desiredPositionsRef = useRef<Array<{ x: number; y: number; z: number }>>([]);
  const modePreset = getSceneModePreset(mode);
  const modeSpinBoost = modePreset.droneSpinBoost;
  const beaconColor =
    mode === 'risk'
      ? '#ff8ca1'
      : mode === 'architecture'
        ? '#72ecff'
        : mode === 'stack'
          ? '#9ab9ff'
          : color;
  const shellColor =
    mode === 'risk'
      ? '#ffe9ee'
      : mode === 'stack'
        ? '#e8edff'
        : mode === 'architecture'
          ? '#e4fbff'
          : '#d9e9ff';

  useFrame(({ clock }) => {
    if (!enabled || points.length === 0) {
      return;
    }

    const visibleCount = Math.min(14, points.length);
    const desired = desiredPositionsRef.current;

    for (let index = 0; index < visibleCount; index += 1) {
      const pose = dronePoseAt(points, index, clock.elapsedTime, speed);
      if (!pose) {
        continue;
      }

      const slot = desired[index] ?? { x: pose.x, y: pose.y, z: pose.z };
      slot.x = pose.x;
      slot.z = pose.z;
      slot.y = ensureAltitudeOverFootprints(
        slot.x,
        slot.z,
        pose.y,
        buildingFootprints,
        0.14,
        1.2,
      );
      desired[index] = slot;
    }
    desired.length = visibleCount;

    resolvePairwiseRepulsion(desired, 0.92, 0.62);

    desired.forEach((point) => {
      pushPointOutOfFootprints(point, buildingFootprints, 0.22);
      if (cityBounds) {
        clampPointToCityBounds(point, cityBounds, 0.8);
      }
    });

    droneRefs.current.forEach((node, index) => {
      if (!node) {
        return;
      }

      const pose = dronePoseAt(points, index, clock.elapsedTime, speed);
      const finalPoint = desired[index];
      if (!pose || !finalPoint) {
        return;
      }

      node.position.set(finalPoint.x, finalPoint.y, finalPoint.z);
      node.rotation.y = pose.yaw;
    });

    rotorRefs.current.forEach((rotor, index) => {
      if (!rotor) {
        return;
      }

      const spin = (clock.elapsedTime * 18 * modeSpinBoost + index * 2.4) % (Math.PI * 2);
      rotor.rotation.y = spin;
    });

    pulseRefs.current.forEach((pulse, index) => {
      if (!pulse) {
        return;
      }

      const scale = 1 + Math.sin(clock.elapsedTime * (5.2 + modeSpinBoost * 0.6) + index) * 0.16;
      pulse.scale.set(scale, 1, scale);
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
          onClick={(event) => {
            event.stopPropagation();
            onSelectDrone?.(index);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(event) => {
            event.stopPropagation();
            document.body.style.cursor = 'default';
          }}
          position={[point.x, point.y + 2.2, point.z]}
        >
          <mesh castShadow>
            <capsuleGeometry args={[0.14, 0.22, 8, 16]} />
            <meshStandardMaterial
              color={shellColor}
              emissive={color}
              emissiveIntensity={0.62}
              metalness={0.58}
              roughness={0.22}
            />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={1.25}
              metalness={0.18}
              roughness={0.35}
            />
          </mesh>

          <mesh position={[0, -0.14, 0]}>
            <boxGeometry args={[0.78, 0.04, 0.18]} />
            <meshStandardMaterial color="#233955" metalness={0.34} roughness={0.48} />
          </mesh>
          <mesh position={[0, -0.14, 0]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.72, 0.04, 0.18]} />
            <meshStandardMaterial color="#223651" metalness={0.34} roughness={0.5} />
          </mesh>

          {[
            [0.28, -0.12, 0.28],
            [-0.28, -0.12, 0.28],
            [0.28, -0.12, -0.28],
            [-0.28, -0.12, -0.28],
          ].map(([x, y, z], rotorIndex) => (
            <group
              key={`${index}-rotor-${rotorIndex}`}
              position={[x, y, z]}
              ref={(node) => {
                rotorRefs.current[index * 4 + rotorIndex] = node;
              }}
            >
              <mesh>
                <cylinderGeometry args={[0.03, 0.03, 0.02, 10]} />
                <meshStandardMaterial color="#1d2f48" metalness={0.4} roughness={0.42} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.1, 0.125, 20]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={0.86}
                  transparent
                  opacity={0.7}
                />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <boxGeometry args={[0.23, 0.008, 0.03]} />
                <meshStandardMaterial color="#dbe9fd" emissive="#dbe9fd" emissiveIntensity={0.4} />
              </mesh>
            </group>
          ))}

          <group
            ref={(node) => {
              pulseRefs.current[index] = node;
            }}
            position={[0, -0.22, 0]}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.16, 0.24, 18]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={1}
                transparent
                opacity={0.55}
              />
            </mesh>
          </group>

          <mesh position={[0, -0.26, -0.12]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshStandardMaterial color="#ff6688" emissive="#ff6688" emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[0, -0.26, 0.12]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshStandardMaterial color="#6fffd0" emissive="#6fffd0" emissiveIntensity={1.6} />
          </mesh>
          {selectedDroneIndex === index && (
            <mesh position={[0, -0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.2, 0.3, 20]} />
              <meshStandardMaterial
                color={SCENE_HUD_GLOW_WHITE}
                emissive={SCENE_HUD_GLOW_WHITE}
                emissiveIntensity={1.3}
                transparent
                opacity={0.94}
              />
            </mesh>
          )}
          {index < 6 && (
            <pointLight
              color={beaconColor}
              intensity={selectedDroneIndex === index ? 1.35 : 0.95}
              distance={5.2}
              decay={2}
              position={[0, -0.08, 0]}
            />
          )}
        </group>
      ))}
    </group>
  );
}
