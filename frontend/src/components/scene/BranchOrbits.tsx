import { memo, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { BranchSignal } from '../../types/repository';
import { stringToColor } from '../../utils/color';
import { CityBounds } from './types';
import { SCENE_HUD_OUTLINE_DARK } from './scene-hud-colors';

interface BranchOrbitsProps {
  branches: BranchSignal[];
  cityBounds: CityBounds;
  accentColor: string;
}

interface OrbitNode {
  id: string;
  label: string;
  commits: number;
  radius: number;
  arc: number;
  angle: number;
  y: number;
  tube: number;
  color: string;
  showLabel: boolean;
}

function hashAngle(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }

  const normalized = Math.abs(hash % 360);
  return (normalized * Math.PI) / 180;
}

export const BranchOrbits = memo(function BranchOrbits({
  branches,
  cityBounds,
  accentColor,
}: BranchOrbitsProps) {
  const nodes = useMemo<OrbitNode[]>(() => {
    if (branches.length === 0) {
      return [];
    }

    const visible = branches
      .filter((branch) => branch.commits > 0)
      .slice(0, 8);
    if (visible.length === 0) {
      return [];
    }

    const baseRadius = cityBounds.size * 0.41;

    return visible.map((branch, index) => {
      const share = Math.max(0.05, Math.min(1, branch.share));
      const radius = baseRadius + 4 + index * 1.95;
      const arc = Math.PI * (0.54 + share * 1.2);
      const angle = hashAngle(branch.name) + index * 0.42;
      const y = 0.2 + index * 0.12;
      const tube = 0.04 + share * 0.08;

      return {
        id: `${branch.name}-${index}`,
        label: branch.name,
        commits: branch.commits,
        radius,
        arc,
        angle,
        y,
        tube,
        color: stringToColor(branch.name),
        showLabel: index < 4,
      };
    });
  }, [branches, cityBounds.size]);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <group position={[cityBounds.centerX, 0, cityBounds.centerZ]}>
      {nodes.map((node) => (
        <group
          key={node.id}
          position={[0, node.y, 0]}
          rotation={[0, node.angle, 0]}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[node.radius, node.tube, 8, 88, node.arc]} />
            <meshStandardMaterial
              color={node.color}
              emissive={node.color}
              emissiveIntensity={0.5}
              transparent
              opacity={0.45}
              metalness={0.6}
              roughness={0.3}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
            <torusGeometry
              args={[node.radius, Math.max(0.01, node.tube * 0.4), 6, 72, node.arc]}
            />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={0.7}
              transparent
              opacity={0.24}
              metalness={0.5}
              roughness={0.35}
            />
          </mesh>

          {node.showLabel && (
            <Text
              position={[
                Math.cos(node.arc * 0.92) * node.radius,
                0.24,
                Math.sin(node.arc * 0.92) * node.radius,
              ]}
              fontSize={0.35}
              maxWidth={6}
              textAlign="left"
              color={node.color}
              anchorX="left"
              anchorY="middle"
              outlineColor={SCENE_HUD_OUTLINE_DARK}
              outlineWidth={0.02}
            >
              {`${node.label} (${node.commits})`}
            </Text>
          )}
        </group>
      ))}
    </group>
  );
});
