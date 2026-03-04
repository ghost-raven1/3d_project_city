import { memo, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { StackPassport } from '../../types/repository';
import { CityBounds } from './types';

interface StackPassportTowersProps {
  stack: StackPassport | null;
  cityBounds: CityBounds;
  accentColor: string;
}

interface StackTowerNode {
  id: string;
  label: string;
  category: string;
  x: number;
  z: number;
  height: number;
  color: string;
}

function categoryColor(category: string, fallback: string): string {
  if (category === 'runtime') {
    return '#4dc9ff';
  }
  if (category === 'framework') {
    return '#6ee6a6';
  }
  if (category === 'tooling') {
    return '#ffcb62';
  }
  if (category === 'infra') {
    return '#ff8ca7';
  }
  if (category === 'db') {
    return '#cfb3ff';
  }
  return fallback;
}

export const StackPassportTowers = memo(function StackPassportTowers({
  stack,
  cityBounds,
  accentColor,
}: StackPassportTowersProps) {
  const nodes = useMemo<StackTowerNode[]>(() => {
    if (!stack) {
      return [];
    }

    const entries = [
      ...stack.runtimes.slice(0, 2).map((label) => ({
        label,
        category: 'runtime',
      })),
      ...stack.frameworks.slice(0, 3).map((label) => ({
        label,
        category: 'framework',
      })),
      ...stack.tooling.slice(0, 2).map((label) => ({
        label,
        category: 'tooling',
      })),
      ...stack.infrastructure.slice(0, 2).map((label) => ({
        label,
        category: 'infra',
      })),
      ...stack.databases.slice(0, 2).map((label) => ({
        label,
        category: 'db',
      })),
      ...stack.ci.slice(0, 1).map((label) => ({
        label,
        category: 'ci',
      })),
    ].slice(0, 10);

    if (entries.length === 0) {
      return [];
    }

    const radius = cityBounds.size * 0.56;
    const step = (Math.PI * 2) / entries.length;

    return entries.map((entry, index) => {
      const angle = index * step + Math.PI / 7;
      const height = 1.6 + ((entry.label.length + index * 3) % 7) * 0.28;

      return {
        id: `${entry.category}-${entry.label}`,
        label: entry.label,
        category: entry.category,
        x: cityBounds.centerX + Math.cos(angle) * radius,
        z: cityBounds.centerZ + Math.sin(angle) * radius,
        height,
        color: categoryColor(entry.category, accentColor),
      };
    });
  }, [accentColor, cityBounds.centerX, cityBounds.centerZ, cityBounds.size, stack]);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <>
      {nodes.map((node) => (
        <group key={node.id} position={[node.x, 0, node.z]}>
          <mesh position={[0, node.height / 2, 0]}>
            <cylinderGeometry args={[0.34, 0.44, node.height, 12]} />
            <meshStandardMaterial
              color={node.color}
              emissive={node.color}
              emissiveIntensity={0.45}
              roughness={0.42}
              metalness={0.34}
              transparent
              opacity={0.84}
            />
          </mesh>

          <mesh position={[0, node.height + 0.22, 0]}>
            <boxGeometry args={[2.2, 0.42, 0.08]} />
            <meshStandardMaterial
              color="#eef6ff"
              emissive={node.color}
              emissiveIntensity={0.22}
              transparent
              opacity={0.9}
            />
          </mesh>

          <Text
            position={[0, node.height + 0.24, 0.05]}
            fontSize={0.13}
            color="#0f223a"
            anchorX="center"
            anchorY="middle"
            maxWidth={2.1}
          >
            {node.label}
          </Text>
        </group>
      ))}
    </>
  );
});

