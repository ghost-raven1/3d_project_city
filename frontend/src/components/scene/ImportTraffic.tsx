import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { ImportRoadSegment } from './types';
import { SCENE_HUD_GLOW_WHITE } from './scene-hud-colors';

interface ImportTrafficProps {
  segments: ImportRoadSegment[];
  enabled: boolean;
  color: string;
}

interface TrafficRoute {
  id: string;
  points: Array<{ x: number; z: number }>;
  cumulative: number[];
  totalLength: number;
  speed: number;
  offset: number;
  laneHeight: number;
  tier: ImportRoadSegment['tier'];
}

function getPointOnRoute(route: TrafficRoute, distance: number): { x: number; z: number } {
  if (route.points.length === 0 || route.totalLength <= 0) {
    return { x: 0, z: 0 };
  }

  const dist = ((distance % route.totalLength) + route.totalLength) % route.totalLength;

  for (let index = 0; index < route.cumulative.length - 1; index += 1) {
    const start = route.cumulative[index] ?? 0;
    const end = route.cumulative[index + 1] ?? route.totalLength;
    if (dist > end) {
      continue;
    }

    const from = route.points[index];
    const to = route.points[index + 1];
    if (!from || !to) {
      break;
    }

    const sectionLength = Math.max(0.001, end - start);
    const t = (dist - start) / sectionLength;

    return {
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t,
    };
  }

  const fallback = route.points[route.points.length - 1];
  return fallback ?? { x: 0, z: 0 };
}

function offsetPolyline(
  points: Array<{ x: number; z: number }>,
  offset: number,
): Array<{ x: number; z: number }> {
  if (offset === 0 || points.length < 2) {
    return points;
  }

  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)] ?? point;
    const next = points[Math.min(points.length - 1, index + 1)] ?? point;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.0001) {
      return point;
    }

    const normalX = -dz / length;
    const normalZ = dx / length;
    return {
      x: point.x + normalX * offset,
      z: point.z + normalZ * offset,
    };
  });
}

function buildRoute(
  id: string,
  points: Array<{ x: number; z: number }>,
  tier: ImportRoadSegment['tier'],
  speed: number,
  offset: number,
  laneHeight: number,
): TrafficRoute | null {
  if (points.length < 2) {
    return null;
  }

  const cumulative = [0];
  let total = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) {
      continue;
    }

    total += Math.hypot(to.x - from.x, to.z - from.z);
    cumulative.push(total);
  }

  if (total <= 0.2) {
    return null;
  }

  return {
    id,
    points,
    cumulative,
    totalLength: total,
    speed,
    offset,
    laneHeight,
    tier,
  };
}

export function ImportTraffic({ segments, enabled, color }: ImportTrafficProps) {
  const refs = useRef<Array<Group | null>>([]);
  const routes = useMemo<TrafficRoute[]>(() => {
    return segments
      .flatMap((segment, index) => {
        if (segment.points.length < 2) {
          return [] as TrafficRoute[];
        }

        const laneProfiles =
          segment.tier === 'highway'
            ? [
                { direction: 1, lateralOffset: 0.14, copies: 2, speedBase: 4.2 },
                { direction: -1, lateralOffset: -0.14, copies: 2, speedBase: 3.9 },
              ]
            : segment.tier === 'arterial'
              ? [
                  { direction: 1, lateralOffset: 0.1, copies: 1, speedBase: 3.4 },
                  { direction: -1, lateralOffset: -0.1, copies: 1, speedBase: 3.1 },
                ]
              : [{ direction: index % 2 === 0 ? 1 : -1, lateralOffset: 0, copies: 1, speedBase: 2.3 }];

        const routeCandidates: TrafficRoute[] = [];

        laneProfiles.forEach((profile, laneIndex) => {
          for (let copy = 0; copy < profile.copies; copy += 1) {
            const shifted = offsetPolyline(segment.points, profile.lateralOffset);
            const lanePoints =
              profile.direction === 1 ? shifted : [...shifted].reverse();
            const route = buildRoute(
              `${segment.id}-${profile.direction}-${laneIndex}-${copy}`,
              lanePoints,
              segment.tier,
              profile.speedBase +
                segment.trafficBias * 1.2 +
                (copy % 2) * 0.22 +
                ((index + laneIndex) % 4) * 0.14,
              ((index * 19 + laneIndex * 7 + copy * 13) % 73) * 0.11,
              0.082 +
                (segment.tier === 'highway'
                  ? 0.02
                  : segment.tier === 'arterial'
                    ? 0.012
                    : 0.006) +
                copy * 0.003,
            );
            if (route) {
              routeCandidates.push(route);
            }
          }
        });

        return routeCandidates;
      })
      .filter((route): route is TrafficRoute => route !== null);
  }, [segments]);

  useFrame(({ clock }) => {
    if (!enabled) {
      return;
    }

    refs.current.forEach((node, index) => {
      const route = routes[index];
      if (!node || !route) {
        return;
      }

      const distance = clock.elapsedTime * route.speed + route.offset;
      const point = getPointOnRoute(route, distance);
      const lookAhead = getPointOnRoute(route, distance + 0.25);
      const angle = Math.atan2(lookAhead.z - point.z, lookAhead.x - point.x);

      node.position.set(
        point.x,
        route.laneHeight + Math.sin(clock.elapsedTime * 2.8 + index) * 0.006,
        point.z,
      );
      node.rotation.y = angle + Math.PI / 2;
    });
  });

  if (!enabled || routes.length === 0) {
    return null;
  }

  return (
    <group>
      {routes.map((route, index) => {
        const start = route.points[0];
        if (!start) {
          return null;
        }

      return (
        <group
          key={`${route.id}-pulse-${index}`}
          ref={(node) => {
            refs.current[index] = node;
          }}
          position={[start.x, route.laneHeight, start.z]}
        >
          <mesh>
            <capsuleGeometry
              args={[
                route.tier === 'highway' ? 0.036 : route.tier === 'arterial' ? 0.032 : 0.028,
                route.tier === 'highway' ? 0.14 : route.tier === 'arterial' ? 0.12 : 0.1,
                4,
                8,
              ]}
            />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={
                route.tier === 'highway' ? 1.3 : route.tier === 'arterial' ? 1.22 : 1.1
              }
              roughness={0.22}
              metalness={0.56}
            />
          </mesh>
          <mesh position={[0, 0, -0.06]}>
            <sphereGeometry args={[0.024, 8, 8]} />
            <meshStandardMaterial
              color={SCENE_HUD_GLOW_WHITE}
              emissive={SCENE_HUD_GLOW_WHITE}
              emissiveIntensity={1.5}
            />
          </mesh>
        </group>
        );
      })}
    </group>
  );
}
