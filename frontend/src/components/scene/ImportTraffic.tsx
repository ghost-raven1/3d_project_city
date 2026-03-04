import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { ImportRoadSegment } from './types';

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

export function ImportTraffic({ segments, enabled, color }: ImportTrafficProps) {
  const refs = useRef<Array<Group | null>>([]);
  const routes = useMemo<TrafficRoute[]>(() => {
    return segments
      .map((segment, index) => {
        if (segment.points.length < 2) {
          return null;
        }

        const cumulative = [0];
        let total = 0;

        for (let pointIndex = 0; pointIndex < segment.points.length - 1; pointIndex += 1) {
          const from = segment.points[pointIndex];
          const to = segment.points[pointIndex + 1];
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
          id: segment.id,
          points: segment.points,
          cumulative,
          totalLength: total,
          speed: 2.1 + (index % 7) * 0.52 + segment.trafficBias * 0.8,
          offset: ((index * 11) % 37) * 0.12,
          laneHeight: 0.084 + (index % 3) * 0.008,
        };
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
            <capsuleGeometry args={[0.03, 0.12, 4, 8]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={1.2}
              roughness={0.22}
              metalness={0.56}
            />
          </mesh>
          <mesh position={[0, 0, -0.06]}>
            <sphereGeometry args={[0.024, 8, 8]} />
            <meshStandardMaterial color="#e8f4ff" emissive="#e8f4ff" emissiveIntensity={1.5} />
          </mesh>
        </group>
        );
      })}
    </group>
  );
}
