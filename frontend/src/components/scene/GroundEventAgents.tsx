import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { BuildingFootprint, CityBounds, ProjectCityEvent } from './types';
import {
  clampPointToCityBounds,
  pushPointOutOfFootprints,
  resolvePairwiseRepulsion,
} from './collision-utils';
import { SCENE_HUD_GLOW_WHITE, SCENE_HUD_PANEL_LIGHT } from './scene-hud-colors';

interface GroundEventAgentsProps {
  events: ProjectCityEvent[];
  cityBounds: CityBounds;
  buildingFootprints?: BuildingFootprint[];
  mode: 'overview' | 'architecture' | 'risk' | 'stack';
  color: string;
  seed: number;
  serviceMultiplier?: number;
  pedestrianMultiplier?: number;
  density?: number;
  maxAgents?: number;
}

interface EventAgent {
  id: string;
  role: 'pedestrian' | 'service';
  sourceX: number;
  sourceZ: number;
  targetX: number;
  targetZ: number;
  speed: number;
  phase: number;
  radius: number;
  intensity: number;
}

function nearestEvent(event: ProjectCityEvent, events: ProjectCityEvent[]): ProjectCityEvent {
  let best = event;
  let bestDistance = Number.POSITIVE_INFINITY;

  events.forEach((candidate) => {
    if (candidate.id === event.id) {
      return;
    }

    const distance = Math.hypot(candidate.x - event.x, candidate.z - event.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  });

  return best;
}

function nearestEventByTypes(
  event: ProjectCityEvent,
  events: ProjectCityEvent[],
  acceptedTypes: Set<ProjectCityEvent['type']>,
): ProjectCityEvent | null {
  let best: ProjectCityEvent | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  events.forEach((candidate) => {
    if (candidate.id === event.id || !acceptedTypes.has(candidate.type)) {
      return;
    }

    const distance = Math.hypot(candidate.x - event.x, candidate.z - event.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  });

  return best;
}

export const GroundEventAgents = memo(function GroundEventAgents({
  events,
  cityBounds,
  buildingFootprints = [],
  mode,
  color,
  seed,
  serviceMultiplier = 1,
  pedestrianMultiplier = 1,
  density = 1,
  maxAgents,
}: GroundEventAgentsProps) {
  const refs = useRef<Array<Group | null>>([]);
  const desiredPositionsRef = useRef<
    Array<{ x: number; y: number; z: number; rotationY: number }>
  >([]);

  const agents = useMemo<EventAgent[]>(() => {
    if (events.length === 0) {
      return [];
    }

    const modeServiceMultiplier =
      (mode === 'risk' ? 1.8 : mode === 'architecture' ? 0.9 : 1.1) *
      serviceMultiplier *
      Math.max(0.4, density);
    const modePedestrianMultiplier =
      (mode === 'architecture' ? 1.9 : mode === 'risk' ? 0.6 : 1.1) *
      pedestrianMultiplier *
      Math.max(0.35, density);
    const result: EventAgent[] = [];

    events.forEach((event, index) => {
      const serviceTarget =
        (mode === 'risk'
          ? nearestEventByTypes(event, events, new Set(['accident', 'recovery']))
          : nearestEventByTypes(event, events, new Set(['recovery', 'release']))) ??
        nearestEvent(event, events);
      const pedestrianTarget =
        (mode === 'architecture'
          ? nearestEventByTypes(event, events, new Set(['release', 'flash']))
          : nearestEventByTypes(event, events, new Set(['recovery', 'release']))) ??
        nearestEvent(event, events);

      const baseServiceCount = event.type === 'accident' ? 3 : event.type === 'recovery' ? 2 : 1;
      const basePedCount = event.type === 'release' ? 3 : event.type === 'flash' ? 2 : 1;
      const serviceEventBoost =
        event.type === 'accident' ? 1.35 : event.type === 'recovery' ? 1.2 : 0.92;
      const pedEventBoost =
        event.type === 'release' ? 1.3 : event.type === 'flash' ? 1.15 : 0.72;

      const serviceCount = Math.max(
        1,
        Math.round(baseServiceCount * modeServiceMultiplier * serviceEventBoost),
      );
      const pedestrianCount = Math.max(
        0,
        Math.round(
          basePedCount *
            modePedestrianMultiplier *
            pedEventBoost *
            (mode === 'risk' && event.type === 'accident' ? 0.25 : 1),
        ),
      );

      for (let serviceIndex = 0; serviceIndex < serviceCount; serviceIndex += 1) {
        result.push({
          id: `${event.id}-service-${serviceIndex}`,
          role: 'service',
          sourceX: event.x,
          sourceZ: event.z,
          targetX: serviceTarget.x,
          targetZ: serviceTarget.z,
          speed: 0.42 + (serviceIndex % 3) * 0.08 + event.intensity * 0.22,
          phase: (index + serviceIndex * 3 + seed) * 0.53,
          radius: 0.22 + serviceIndex * 0.08,
          intensity: event.intensity,
        });
      }

      for (let pedIndex = 0; pedIndex < pedestrianCount; pedIndex += 1) {
        result.push({
          id: `${event.id}-ped-${pedIndex}`,
          role: 'pedestrian',
          sourceX: event.x,
          sourceZ: event.z,
          targetX: pedestrianTarget.x,
          targetZ: pedestrianTarget.z,
          speed: 0.22 + (pedIndex % 4) * 0.06 + event.intensity * 0.1,
          phase: (index + pedIndex * 2 + seed * 0.7) * 0.37,
          radius: 0.15 + pedIndex * 0.05,
          intensity: event.intensity,
        });
      }
    });

    const limit = maxAgents ?? (mode === 'stack' ? 20 : 64);
    return result.slice(0, Math.max(4, limit));
  }, [density, events, maxAgents, mode, pedestrianMultiplier, seed, serviceMultiplier]);

  useFrame(({ clock }) => {
    if (agents.length === 0) {
      return;
    }

    const t = clock.elapsedTime;
    const desired = desiredPositionsRef.current;
    refs.current.forEach((_, index) => {
      const agent = agents[index];
      if (!agent) {
        return;
      }

      const travel = 0.5 + Math.sin(t * agent.speed + agent.phase) * 0.5;
      const travelAhead = 0.5 + Math.sin(t * agent.speed + agent.phase + 0.03) * 0.5;
      const x = agent.sourceX + (agent.targetX - agent.sourceX) * travel;
      const z = agent.sourceZ + (agent.targetZ - agent.sourceZ) * travel;
      const xAhead = agent.sourceX + (agent.targetX - agent.sourceX) * travelAhead;
      const zAhead = agent.sourceZ + (agent.targetZ - agent.sourceZ) * travelAhead;
      const orbitAngle = t * (2.1 + agent.intensity) + agent.phase * 2.4;

      const slot = desired[index] ?? {
        x: cityBounds.centerX,
        y: 0.11,
        z: cityBounds.centerZ,
        rotationY: 0,
      };
      slot.x = x + Math.cos(orbitAngle) * agent.radius;
      slot.y = 0.08 + (agent.role === 'service' ? 0.05 : 0.03);
      slot.z = z + Math.sin(orbitAngle) * agent.radius;
      slot.rotationY = Math.atan2(zAhead - z, xAhead - x) + Math.PI / 2;
      desired[index] = slot;
    });

    desired.length = agents.length;
    desired.forEach((point) => {
      pushPointOutOfFootprints(point, buildingFootprints, 0.24);
      clampPointToCityBounds(point, cityBounds, 0.38);
    });
    resolvePairwiseRepulsion(desired, 0.16, 0.64);

    refs.current.forEach((node, index) => {
      const point = desired[index];
      if (!node || !point) {
        return;
      }

      node.position.set(point.x, point.y, point.z);
      node.rotation.y = point.rotationY;
    });
  });

  if (agents.length === 0) {
    return null;
  }

  return (
    <group>
      {agents.map((agent, index) => (
        <group
          key={agent.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          position={[cityBounds.centerX, 0.1, cityBounds.centerZ]}
        >
          {agent.role === 'service' ? (
            <>
              <mesh>
                <boxGeometry args={[0.08, 0.08, 0.08]} />
                <meshStandardMaterial
                  color={SCENE_HUD_PANEL_LIGHT}
                  emissive={color}
                  emissiveIntensity={1.1 + agent.intensity * 0.7}
                />
              </mesh>
              <mesh position={[0, 0.06, 0]}>
                <sphereGeometry args={[0.025, 8, 8]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.3} />
              </mesh>
            </>
          ) : (
            <>
              <mesh>
                <capsuleGeometry args={[0.022, 0.1, 4, 8]} />
                <meshStandardMaterial color="#c4d8ef" emissive="#9fc6e8" emissiveIntensity={0.6} />
              </mesh>
              <mesh position={[0, 0.08, 0]}>
                <sphereGeometry args={[0.018, 8, 8]} />
                <meshStandardMaterial color={SCENE_HUD_GLOW_WHITE} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
});
