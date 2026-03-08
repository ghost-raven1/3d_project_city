import { memo, useEffect, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { ImportRoadSegment } from './types';
import { ImportTraffic } from './ImportTraffic';
import { createRoadTexture } from '../../utils/procedural-textures';
import {
  SCENE_HUD_OUTLINE_DARK,
  SCENE_HUD_PANEL_LIGHT,
  SCENE_HUD_PANEL_TEXT_DARK,
} from './scene-hud-colors';

interface RoadNetworkProps {
  segments: ImportRoadSegment[];
  trafficSegments: ImportRoadSegment[];
  accentColor: string;
  trafficEnabled: boolean;
  textureSeed: number;
  wetness: number;
}

interface RoadPiece {
  id: string;
  x: number;
  z: number;
  length: number;
  angle: number;
  width: number;
  glowWidth: number;
  glowOpacity: number;
  tier: 'highway' | 'arterial' | 'local';
  violationScore: number;
  cycleScore: number;
}

interface RoadLine {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  tier: 'highway' | 'arterial' | 'local';
}

interface IntersectionNode {
  x: number;
  z: number;
  size: number;
}

function segmentIntersection(lineA: RoadLine, lineB: RoadLine): { x: number; z: number } | null {
  const denominator =
    (lineA.x1 - lineA.x2) * (lineB.z1 - lineB.z2) -
    (lineA.z1 - lineA.z2) * (lineB.x1 - lineB.x2);

  if (Math.abs(denominator) < 0.0001) {
    return null;
  }

  const detA = lineA.x1 * lineA.z2 - lineA.z1 * lineA.x2;
  const detB = lineB.x1 * lineB.z2 - lineB.z1 * lineB.x2;
  const x =
    (detA * (lineB.x1 - lineB.x2) - (lineA.x1 - lineA.x2) * detB) / denominator;
  const z =
    (detA * (lineB.z1 - lineB.z2) - (lineA.z1 - lineA.z2) * detB) / denominator;

  const withinA =
    x >= Math.min(lineA.x1, lineA.x2) - 0.01 &&
    x <= Math.max(lineA.x1, lineA.x2) + 0.01 &&
    z >= Math.min(lineA.z1, lineA.z2) - 0.01 &&
    z <= Math.max(lineA.z1, lineA.z2) + 0.01;
  const withinB =
    x >= Math.min(lineB.x1, lineB.x2) - 0.01 &&
    x <= Math.max(lineB.x1, lineB.x2) + 0.01 &&
    z >= Math.min(lineB.z1, lineB.z2) - 0.01 &&
    z <= Math.max(lineB.z1, lineB.z2) + 0.01;

  if (!withinA || !withinB) {
    return null;
  }

  return { x, z };
}

function pointDistanceToEndpoint(
  point: { x: number; z: number },
  line: RoadLine,
): number {
  const d1 = Math.hypot(point.x - line.x1, point.z - line.z1);
  const d2 = Math.hypot(point.x - line.x2, point.z - line.z2);
  return Math.min(d1, d2);
}

export const RoadNetwork = memo(function RoadNetwork({
  segments,
  trafficSegments,
  accentColor,
  trafficEnabled,
  textureSeed,
  wetness,
}: RoadNetworkProps) {
  const pieces = useMemo<RoadPiece[]>(() => {
    return segments.flatMap((road) => {
      const result: RoadPiece[] = [];

      for (let index = 0; index < road.points.length - 1; index += 1) {
        const from = road.points[index];
        const to = road.points[index + 1];
        if (!from || !to) {
          continue;
        }

        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.24) {
          continue;
        }

        result.push({
          id: `${road.id}-${index}`,
          x: (from.x + to.x) / 2,
          z: (from.z + to.z) / 2,
          length,
          angle: Math.atan2(dz, dx),
          width: road.width,
          glowWidth: road.glowWidth,
          glowOpacity: road.glowOpacity,
          tier: road.tier,
          violationScore: road.violationScore,
          cycleScore: road.cycleScore,
        });
      }

      return result;
    });
  }, [segments]);

  const roadTexture = useMemo(() => {
    return createRoadTexture(textureSeed, accentColor);
  }, [accentColor, textureSeed]);

  useEffect(() => {
    return () => {
      roadTexture.dispose();
    };
  }, [roadTexture]);

  const roadLines = useMemo<RoadLine[]>(() => {
    return segments.flatMap((segment) => {
      if (segment.tier === 'local') {
        return [];
      }

      const lines: RoadLine[] = [];
      for (let index = 0; index < segment.points.length - 1; index += 1) {
        const from = segment.points[index];
        const to = segment.points[index + 1];
        if (!from || !to) {
          continue;
        }

        lines.push({
          id: `${segment.id}-line-${index}`,
          x1: from.x,
          z1: from.z,
          x2: to.x,
          z2: to.z,
          tier: segment.tier,
        });
      }

      return lines;
    });
  }, [segments]);

  const intersections = useMemo<IntersectionNode[]>(() => {
    const nodes: IntersectionNode[] = [];
    const dedupe = new Set<string>();
    const limitedLines = roadLines.slice(0, 260);

    for (let index = 0; index < limitedLines.length; index += 1) {
      const a = limitedLines[index];
      if (!a) {
        continue;
      }

      for (let inner = index + 1; inner < limitedLines.length; inner += 1) {
        const b = limitedLines[inner];
        if (!b) {
          continue;
        }

        const intersection = segmentIntersection(a, b);
        if (!intersection) {
          continue;
        }

        if (pointDistanceToEndpoint(intersection, a) < 0.24 || pointDistanceToEndpoint(intersection, b) < 0.24) {
          continue;
        }

        const key = `${Math.round(intersection.x * 2)}:${Math.round(intersection.z * 2)}`;
        if (dedupe.has(key)) {
          continue;
        }

        dedupe.add(key);
        nodes.push({
          x: intersection.x,
          z: intersection.z,
          size: a.tier === 'highway' || b.tier === 'highway' ? 0.46 : 0.34,
        });

        if (nodes.length >= 90) {
          return nodes;
        }
      }
    }

    return nodes;
  }, [roadLines]);

  const highwaySigns = useMemo(() => {
    return segments
      .filter((segment) => segment.tier === 'highway')
      .sort((a, b) => b.trafficBias - a.trafficBias)
      .slice(0, 14)
      .map((segment) => {
        const midIndex = Math.floor(segment.points.length / 2);
        const mid = segment.points[midIndex];
        const next = segment.points[Math.min(segment.points.length - 1, midIndex + 1)];
        if (!mid || !next) {
          return null;
        }

        const angle = Math.atan2(next.z - mid.z, next.x - mid.x);
        return {
          id: `${segment.id}-sign`,
          x: mid.x,
          z: mid.z,
          angle,
          label: segment.label,
        };
      })
      .filter((item): item is { id: string; x: number; z: number; angle: number; label: string } => item !== null);
  }, [segments]);

  const roadRoughness = Math.max(0.62, 0.88 - wetness * 0.12);
  const roadMetalness = 0.08 + wetness * 0.1;
  const roadOpacity = 0.62 + wetness * 0.06;

  return (
    <>
      {pieces.map((road) => (
        <group key={road.id} position={[road.x, 0.025, road.z]} rotation={[0, road.angle, 0]}>
          <mesh receiveShadow>
            <boxGeometry args={[road.length, 0.034, road.width + 0.09]} />
            <meshStandardMaterial
              color={
                road.violationScore > 0.35
                  ? '#ffd0d6'
                  : road.cycleScore > 0.35
                    ? '#ffe5c2'
                    : road.tier === 'highway'
                      ? '#cfdff4'
                      : '#d8e6f7'
              }
              transparent
              opacity={road.tier === 'highway' ? 0.44 : 0.4}
              roughness={0.9}
              metalness={0.08}
            />
          </mesh>
          <mesh receiveShadow>
            <boxGeometry args={[road.length, 0.03, road.width]} />
            <meshStandardMaterial
              color={
                road.violationScore > 0.35
                  ? '#ffe7eb'
                  : road.cycleScore > 0.35
                    ? '#fff1dd'
                    : road.tier === 'highway'
                      ? '#edf4ff'
                      : '#f4f8ff'
              }
              map={roadTexture}
              transparent
              opacity={roadOpacity}
              roughness={roadRoughness}
              metalness={roadMetalness}
            />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[road.length * 0.98, 0.01, road.glowWidth]} />
            <meshStandardMaterial
              color={
                road.violationScore > 0.25
                  ? '#ff5f78'
                  : road.cycleScore > 0.25
                    ? '#ffb357'
                    : accentColor
              }
              emissive={
                road.violationScore > 0.25
                  ? '#ff5f78'
                  : road.cycleScore > 0.25
                    ? '#ffb357'
                    : accentColor
              }
              emissiveIntensity={
                road.violationScore > 0.25
                  ? 1.25
                  : road.cycleScore > 0.25
                    ? 1.1
                    : road.tier === 'highway'
                      ? 1.05
                      : 0.68
              }
              transparent
              opacity={Math.min(0.9, road.glowOpacity + road.violationScore * 0.25)}
            />
          </mesh>
          <mesh position={[0, 0.021, 0]}>
            <boxGeometry args={[road.length * 0.95, 0.006, Math.max(0.025, road.width * 0.08)]} />
            <meshStandardMaterial color={SCENE_HUD_PANEL_LIGHT} transparent opacity={0.28} />
          </mesh>
        </group>
      ))}

      {intersections.map((node, index) => (
        <group key={`junction-${index}`} position={[node.x, 0.05, node.z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[node.size * 0.6, node.size, 32]} />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={0.95}
              transparent
              opacity={0.45}
            />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.12, 10]} />
            <meshStandardMaterial
              color={SCENE_HUD_PANEL_LIGHT}
              emissive={SCENE_HUD_PANEL_LIGHT}
              emissiveIntensity={1.25}
            />
          </mesh>
        </group>
      ))}

      {highwaySigns.map((sign) => (
        <group
          key={sign.id}
          position={[sign.x, 0.6, sign.z]}
          rotation={[0, sign.angle, 0]}
        >
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[Math.max(1.8, sign.label.length * 0.16), 0.22, 0.04]} />
            <meshStandardMaterial
              color={SCENE_HUD_PANEL_LIGHT}
              emissive={accentColor}
              emissiveIntensity={0.12}
              transparent
              opacity={0.92}
            />
          </mesh>
          <Text
            position={[0, 0.02, 0.03]}
            fontSize={0.12}
            color={SCENE_HUD_PANEL_TEXT_DARK}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.014}
            outlineColor={SCENE_HUD_OUTLINE_DARK}
            maxWidth={5}
          >
            {sign.label}
          </Text>
        </group>
      ))}

      <ImportTraffic
        segments={trafficSegments}
        enabled={trafficEnabled}
        color={accentColor}
      />
    </>
  );
});
