import { memo, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { PositionedFileHistory } from '../../types/repository';
import { compactFloors, floorHeight } from '../../utils/building';
import { CityBounds } from './types';

interface ComparisonOverlayProps {
  baselineFiles: PositionedFileHistory[];
  currentFiles: PositionedFileHistory[];
  cityBounds: CityBounds;
  mode: 'ghost' | 'split';
  accentColor: string;
}

interface GhostBuilding {
  path: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  status: 'removed' | 'changed' | 'stable';
}

export const ComparisonOverlay = memo(function ComparisonOverlay({
  baselineFiles,
  currentFiles,
  cityBounds,
  mode,
  accentColor,
}: ComparisonOverlayProps) {
  const baselineNodes = useMemo<GhostBuilding[]>(() => {
    const currentMap = new Map(currentFiles.map((file) => [file.path, file]));

    return baselineFiles
      .map((file) => {
        const baselineHeight = compactFloors(file.commits).reduce(
          (sum, floor) => sum + floorHeight(floor.changes),
          0,
        );
        const current = currentMap.get(file.path);
        let status: GhostBuilding['status'] = 'stable';

        if (!current) {
          status = 'removed';
        } else if (
          current.commits.length !== file.commits.length ||
          Math.abs(current.totalChanges - file.totalChanges) > 12
        ) {
          status = 'changed';
        }

        return {
          path: file.path,
          x: file.x,
          z: file.z,
          width: file.width,
          depth: file.depth,
          height: Math.max(0.32, baselineHeight),
          status,
        };
      })
      .filter((item) => mode === 'ghost' || item.x <= cityBounds.centerX);
  }, [baselineFiles, cityBounds.centerX, currentFiles, mode]);

  const newNodes = useMemo(() => {
    if (mode === 'split') {
      return [];
    }

    const baselineSet = new Set(baselineFiles.map((file) => file.path));
    return currentFiles
      .filter((file) => !baselineSet.has(file.path))
      .slice(0, 240);
  }, [baselineFiles, currentFiles, mode]);

  return (
    <group>
      {mode === 'split' && (
        <>
          <mesh
            position={[cityBounds.centerX - cityBounds.size * 0.25, 0.05, cityBounds.centerZ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[cityBounds.size * 0.48, cityBounds.size * 0.92]} />
            <meshStandardMaterial
              color="#d9ecff"
              emissive="#bfdfff"
              emissiveIntensity={0.08}
              transparent
              opacity={0.14}
            />
          </mesh>
          <mesh
            position={[cityBounds.centerX, 0.06, cityBounds.centerZ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.38, cityBounds.size * 0.92]} />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={0.35}
              transparent
              opacity={0.35}
            />
          </mesh>
          <Text
            position={[cityBounds.centerX - cityBounds.size * 0.24, 0.35, cityBounds.centerZ - cityBounds.size * 0.44]}
            fontSize={0.6}
            color="#6a92be"
            anchorX="left"
            anchorY="middle"
          >
            BEFORE
          </Text>
          <Text
            position={[cityBounds.centerX + cityBounds.size * 0.06, 0.35, cityBounds.centerZ - cityBounds.size * 0.44]}
            fontSize={0.6}
            color={accentColor}
            anchorX="left"
            anchorY="middle"
          >
            NOW
          </Text>
        </>
      )}

      {baselineNodes.map((node) => {
        const tone =
          node.status === 'removed'
            ? '#ff7f97'
            : node.status === 'changed'
              ? '#ffc47c'
              : '#7eb7ff';
        const opacity =
          node.status === 'removed'
            ? 0.34
            : node.status === 'changed'
              ? 0.27
              : 0.17;

        return (
          <mesh
            key={`baseline-${node.path}`}
            position={[node.x, node.height / 2 + 0.05, node.z]}
          >
            <boxGeometry
              args={[
                Math.max(0.2, node.width * 0.9),
                node.height,
                Math.max(0.2, node.depth * 0.9),
              ]}
            />
            <meshStandardMaterial
              color={tone}
              emissive={tone}
              emissiveIntensity={0.35}
              transparent
              opacity={opacity}
              roughness={0.42}
              metalness={0.15}
            />
          </mesh>
        );
      })}

      {newNodes.map((node) => (
        <mesh key={`new-${node.path}`} position={[node.x, 0.22, node.z]}>
          <cylinderGeometry args={[0.08, 0.14, 0.46, 12]} />
          <meshStandardMaterial
            color="#73f7c8"
            emissive="#73f7c8"
            emissiveIntensity={0.45}
            transparent
            opacity={0.55}
          />
        </mesh>
      ))}
    </group>
  );
});
