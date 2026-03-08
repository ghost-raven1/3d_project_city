import { memo, useRef } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { RoomPointer } from '../../types/collaboration';
import { SceneViewMode } from './types';
import { getSceneModePreset } from './view-mode-presets';
import {
  SCENE_HUD_OUTLINE_SOFT,
  SCENE_HUD_TEXT_PRIMARY,
} from './scene-hud-colors';
import { SCENE_MOTION } from './scene-motion';

interface LivePointersProps {
  pointers: RoomPointer[];
  mode: SceneViewMode;
}

function shortPath(path: string | null): string {
  if (!path) {
    return '';
  }

  if (path.length <= 26) {
    return path;
  }

  return `…${path.slice(-25)}`;
}

export const LivePointers = memo(function LivePointers({
  pointers,
  mode,
}: LivePointersProps) {
  const refs = useRef<Array<Group | null>>([]);
  const modeScale = getSceneModePreset(mode).pointerScale;

  useFrame(({ clock }) => {
    refs.current.forEach((node, index) => {
      if (!node) {
        return;
      }

      const pulse = 1 + Math.sin(clock.elapsedTime * SCENE_MOTION.pointerPulseHz + index) * 0.12;
      node.scale.set(pulse * modeScale, 1, pulse * modeScale);
    });
  });

  return (
    <group>
      {pointers.map((pointer, index) => (
        <group
          key={pointer.socketId}
          ref={(node) => {
            refs.current[index] = node;
          }}
          position={[pointer.x, Math.max(0.08, pointer.y + 0.1), pointer.z]}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.09, 0.16, 24]} />
            <meshStandardMaterial
              color={pointer.color}
              emissive={pointer.color}
              emissiveIntensity={1}
              transparent
              opacity={0.9}
            />
          </mesh>
          <mesh position={[0, 0.07, 0]}>
            <coneGeometry args={[0.06, 0.14, 14]} />
            <meshStandardMaterial color={pointer.color} emissive={pointer.color} emissiveIntensity={1.1} />
          </mesh>
          <Text
            position={[0, 0.2, 0]}
            fontSize={0.11}
            color={SCENE_HUD_TEXT_PRIMARY}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.015}
            outlineColor={SCENE_HUD_OUTLINE_SOFT}
            maxWidth={4.8}
          >
            {pointer.path ? `${pointer.nickname} · ${shortPath(pointer.path)}` : pointer.nickname}
          </Text>
        </group>
      ))}
    </group>
  );
});
