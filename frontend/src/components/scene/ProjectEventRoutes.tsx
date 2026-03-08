import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Group, MeshStandardMaterial } from 'three';
import { ProjectCityEvent, SceneViewMode } from './types';
import { getSceneModePreset } from './view-mode-presets';

interface ProjectEventRoutesProps {
  events: ProjectCityEvent[];
  mode: SceneViewMode;
  accentColor: string;
}

interface RoutePoint {
  x: number;
  y: number;
  z: number;
}

interface EventRoute {
  id: string;
  points: RoutePoint[];
  color: string;
  cumulative: number[];
  totalLength: number;
  speed: number;
  pulseCount: number;
}

interface RoutePulse {
  id: string;
  routeIndex: number;
  phase: number;
  scale: number;
}

function blendColor(colorA: string, colorB: string, factor: number): string {
  const mixed = new Color(colorA).lerp(new Color(colorB), Math.max(0, Math.min(1, factor)));
  return `#${mixed.getHexString()}`;
}

function distance(a: RoutePoint, b: RoutePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function pointAlongRoute(route: EventRoute, distanceValue: number): RoutePoint {
  if (route.points.length === 0 || route.totalLength <= 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const wrapped =
    ((distanceValue % route.totalLength) + route.totalLength) % route.totalLength;

  for (let index = 0; index < route.cumulative.length - 1; index += 1) {
    const startDistance = route.cumulative[index] ?? 0;
    const endDistance = route.cumulative[index + 1] ?? route.totalLength;
    if (wrapped > endDistance) {
      continue;
    }

    const from = route.points[index];
    const to = route.points[index + 1];
    if (!from || !to) {
      break;
    }

    const segmentLength = Math.max(0.0001, endDistance - startDistance);
    const t = (wrapped - startDistance) / segmentLength;
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    };
  }

  const fallback = route.points[route.points.length - 1];
  return fallback ?? { x: 0, y: 0, z: 0 };
}

function nearestEventByType(
  source: ProjectCityEvent,
  events: ProjectCityEvent[],
  acceptedTypes: Set<ProjectCityEvent['type']>,
): ProjectCityEvent | null {
  let best: ProjectCityEvent | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  events.forEach((candidate) => {
    if (candidate.id === source.id || !acceptedTypes.has(candidate.type)) {
      return;
    }

    const d = Math.hypot(candidate.x - source.x, candidate.z - source.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  });

  return best;
}

function makeRoute(
  id: string,
  from: ProjectCityEvent,
  to: ProjectCityEvent,
  color: string,
  speed: number,
  pulseCount: number,
): EventRoute {
  const midpoint: RoutePoint = {
    x: (from.x + to.x) * 0.5,
    y: Math.max(from.y, to.y) + 0.25 + Math.hypot(to.x - from.x, to.z - from.z) * 0.03,
    z: (from.z + to.z) * 0.5,
  };
  const points: RoutePoint[] = [
    { x: from.x, y: from.y + 0.06, z: from.z },
    midpoint,
    { x: to.x, y: to.y + 0.06, z: to.z },
  ];

  const cumulative = [0];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) {
      continue;
    }
    totalLength += distance(a, b);
    cumulative.push(totalLength);
  }

  return {
    id,
    points,
    color,
    cumulative,
    totalLength: Math.max(0.001, totalLength),
    speed,
    pulseCount,
  };
}

export const ProjectEventRoutes = memo(function ProjectEventRoutes({
  events,
  mode,
  accentColor,
}: ProjectEventRoutesProps) {
  const preset = useMemo(() => getSceneModePreset(mode), [mode]);
  const pulseRefs = useRef<Array<Group | null>>([]);
  const pulseMaterialRefs = useRef<Array<MeshStandardMaterial | null>>([]);

  const routes = useMemo<EventRoute[]>(() => {
    if (events.length < 2) {
      return [];
    }

    const result: EventRoute[] = [];
    const routeColorByType = {
      accident: blendColor(accentColor, '#ff6e81', 0.7),
      recovery: blendColor(accentColor, '#66d9a4', 0.58),
      release: blendColor(accentColor, '#6bc8ff', 0.68),
      flash: blendColor(accentColor, '#ffe27d', 0.64),
    } as const;

    events.forEach((event) => {
      const targetTypes =
        event.type === 'accident'
          ? new Set<ProjectCityEvent['type']>(['recovery', 'release'])
          : event.type === 'recovery'
            ? new Set<ProjectCityEvent['type']>(['release'])
            : event.type === 'release'
              ? new Set<ProjectCityEvent['type']>(['flash'])
              : new Set<ProjectCityEvent['type']>(['release', 'recovery']);

      const target = nearestEventByType(event, events, targetTypes);
      if (!target) {
        return;
      }

      const intensity = (event.intensity + target.intensity) * 0.5;
      const pulseCount = Math.max(
        1,
        Math.min(3, Math.round((preset.routePulseCount + intensity) * 0.9)),
      );

      result.push(
        makeRoute(
          `${event.id}->${target.id}`,
          event,
          target,
          routeColorByType[event.type],
          (0.28 + intensity * 0.36) * preset.routePulseSpeed,
          pulseCount,
        ),
      );
    });

    return result.slice(0, mode === 'stack' ? 18 : 36);
  }, [accentColor, events, mode, preset.routePulseCount, preset.routePulseSpeed]);

  const pulses = useMemo<RoutePulse[]>(() => {
    return routes.flatMap((route, routeIndex) =>
      Array.from({ length: route.pulseCount }, (_, pulseIndex) => ({
        id: `${route.id}-pulse-${pulseIndex}`,
        routeIndex,
        phase: pulseIndex / Math.max(1, route.pulseCount),
        scale: 0.75 + pulseIndex * 0.12,
      })),
    );
  }, [routes]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;

    pulseRefs.current.forEach((node, index) => {
      const pulse = pulses[index];
      if (!node || !pulse) {
        return;
      }

      const route = routes[pulse.routeIndex];
      if (!route) {
        return;
      }

      const dist = route.totalLength * pulse.phase + time * route.speed;
      const point = pointAlongRoute(route, dist);

      node.position.set(point.x, point.y, point.z);
      const wave = 0.65 + Math.sin(time * 4.2 + index) * 0.2;
      node.scale.setScalar(Math.max(0.4, pulse.scale * wave));
    });

    pulseMaterialRefs.current.forEach((material, index) => {
      if (!material) {
        return;
      }

      const pulse = 0.6 + Math.max(0, Math.sin(time * 3.4 + index * 0.8)) * 0.85;
      material.opacity = Math.min(0.95, preset.routeOpacity * 0.4 + pulse * 0.34);
      material.emissiveIntensity = 0.9 + pulse * 0.55;
    });
  });

  if (routes.length === 0) {
    return null;
  }

  return (
    <group>
      {routes.map((route, index) => (
        <line key={route.id}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(route.points.flatMap((point) => [point.x, point.y, point.z])), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={route.color}
            transparent
            opacity={Math.min(0.92, preset.routeOpacity + index * 0.004)}
          />
        </line>
      ))}

      {pulses.map((pulse, index) => {
        const route = routes[pulse.routeIndex];
        const start = route?.points[0];
        if (!start || !route) {
          return null;
        }

        return (
          <group
            key={pulse.id}
            ref={(node) => {
              pulseRefs.current[index] = node;
            }}
            position={[start.x, start.y, start.z]}
          >
            <mesh>
              <sphereGeometry args={[0.06, 10, 10]} />
              <meshStandardMaterial
                ref={(node) => {
                  pulseMaterialRefs.current[index] = node;
                }}
                color={route.color}
                emissive={route.color}
                transparent
                opacity={0.8}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});
