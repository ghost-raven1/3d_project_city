import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Group, MeshStandardMaterial } from 'three';
import { CityBounds, SceneViewMode } from './types';
import { getSceneModePreset } from './view-mode-presets';
import { SCENE_HUD_GLOW_WHITE } from './scene-hud-colors';
import { SCENE_MOTION } from './scene-motion';

interface ModeSignatureLayerProps {
  mode: SceneViewMode;
  cityBounds: CityBounds;
  accentColor: string;
  seed: number;
}

function blendColor(colorA: string, colorB: string, factor: number): string {
  const mixed = new Color(colorA).lerp(new Color(colorB), Math.max(0, Math.min(1, factor)));
  return `#${mixed.getHexString()}`;
}

export const ModeSignatureLayer = memo(function ModeSignatureLayer({
  mode,
  cityBounds,
  accentColor,
  seed,
}: ModeSignatureLayerProps) {
  const preset = useMemo(() => getSceneModePreset(mode), [mode]);
  const pulseMaterialRefs = useRef<Array<MeshStandardMaterial | null>>([]);
  const animatedGroupRefs = useRef<Array<Group | null>>([]);

  const modeColor = useMemo(
    () => blendColor(accentColor, preset.accent, 0.65),
    [accentColor, preset.accent],
  );

  const architectureSpokes = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        id: `arch-spoke-${index}`,
        angle: (index / 12) * Math.PI * 2 + (seed % 17) * 0.03,
        length: cityBounds.size * (0.55 + (index % 3) * 0.07),
      })),
    [cityBounds.size, seed],
  );

  const riskWatchNodes = useMemo(
    () =>
      Array.from({ length: 4 }, (_, index) => {
        const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
        const radius = cityBounds.size * 0.44;
        return {
          id: `risk-node-${index}`,
          x: cityBounds.centerX + Math.cos(angle) * radius,
          z: cityBounds.centerZ + Math.sin(angle) * radius,
          angle,
        };
      }),
    [cityBounds.centerX, cityBounds.centerZ, cityBounds.size],
  );

  const stackLayers = useMemo(
    () =>
      [2.4, 4.2, 6.2, 8.4].map((y, index) => ({
        id: `stack-layer-${index}`,
        y,
        radiusA: cityBounds.size * (0.2 + index * 0.05),
        radiusB: cityBounds.size * (0.24 + index * 0.05),
      })),
    [cityBounds.size],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    pulseMaterialRefs.current.forEach((material, index) => {
      if (!material) {
        return;
      }

      const wave =
        0.3 +
        Math.max(0, Math.sin(t * (SCENE_MOTION.signatureWaveBaseHz + index * 0.08) + index * 0.7));
      material.opacity = Math.min(0.78, preset.signatureOpacity * (0.4 + wave * 0.4));
      material.emissiveIntensity = 0.35 + wave * (0.4 + preset.signatureOpacity);
    });

    animatedGroupRefs.current.forEach((group, index) => {
      if (!group) {
        return;
      }

      group.rotation.y +=
        SCENE_MOTION.signatureRotateBase +
        (mode === 'architecture'
          ? SCENE_MOTION.signatureRotateBase
          : SCENE_MOTION.signatureRotateBase * 0.5);
      group.position.y +=
        Math.sin(t * (SCENE_MOTION.signatureFloatBaseHz + index * 0.2) + index) * 0.0015;
    });
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cityBounds.centerX, 0.045, cityBounds.centerZ]}>
        <ringGeometry args={[cityBounds.size * 0.21, cityBounds.size * 0.235, 128]} />
        <meshStandardMaterial
          ref={(node) => {
            pulseMaterialRefs.current[0] = node;
          }}
          color={modeColor}
          emissive={modeColor}
          transparent
          opacity={preset.signatureOpacity}
        />
      </mesh>

      {mode === 'overview' && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cityBounds.centerX, 0.042, cityBounds.centerZ]}>
            <ringGeometry args={[cityBounds.size * 0.36, cityBounds.size * 0.39, 128]} />
            <meshStandardMaterial
              ref={(node) => {
                pulseMaterialRefs.current[1] = node;
              }}
              color={modeColor}
              emissive={modeColor}
              transparent
              opacity={preset.signatureOpacity * 0.9}
            />
          </mesh>
          <mesh rotation={[0, 0, 0]} position={[cityBounds.centerX, 1.9, cityBounds.centerZ]}>
            <cylinderGeometry args={[cityBounds.size * 0.015, cityBounds.size * 0.02, 3.8, 24, 1, true]} />
            <meshStandardMaterial
              ref={(node) => {
                pulseMaterialRefs.current[2] = node;
              }}
              color={modeColor}
              emissive={modeColor}
              transparent
              opacity={preset.signatureOpacity * 0.42}
              side={2}
            />
          </mesh>
        </>
      )}

      {mode === 'architecture' && (
        <>
          <group
            ref={(node) => {
              animatedGroupRefs.current[0] = node;
            }}
            position={[cityBounds.centerX, 0.06, cityBounds.centerZ]}
          >
            {architectureSpokes.map((spoke, index) => (
              <mesh key={spoke.id} rotation={[0, spoke.angle, 0]}>
                <boxGeometry args={[spoke.length, 0.03, 0.08]} />
                <meshStandardMaterial
                  ref={(node) => {
                    pulseMaterialRefs.current[3 + index] = node;
                  }}
                  color={modeColor}
                  emissive={modeColor}
                  transparent
                  opacity={preset.signatureOpacity * 0.8}
                />
              </mesh>
            ))}
          </group>
          <group
            ref={(node) => {
              animatedGroupRefs.current[1] = node;
            }}
            position={[cityBounds.centerX, 0.11, cityBounds.centerZ]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[cityBounds.size * 0.46, cityBounds.size * 0.5, 180]} />
              <meshStandardMaterial
                ref={(node) => {
                  pulseMaterialRefs.current[20] = node;
                }}
                color={modeColor}
                emissive={modeColor}
                transparent
                opacity={preset.signatureOpacity}
              />
            </mesh>
          </group>
        </>
      )}

      {mode === 'risk' && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cityBounds.centerX, 0.055, cityBounds.centerZ]}>
            <ringGeometry args={[cityBounds.size * 0.28, cityBounds.size * 0.33, 128]} />
            <meshStandardMaterial
              ref={(node) => {
                pulseMaterialRefs.current[21] = node;
              }}
              color={modeColor}
              emissive={modeColor}
              transparent
              opacity={preset.signatureOpacity}
            />
          </mesh>
          {riskWatchNodes.map((node, index) => (
            <group key={node.id} position={[node.x, 0.35, node.z]} rotation={[0, node.angle + Math.PI, 0]}>
              <mesh>
                <coneGeometry args={[0.24, 0.55, 3]} />
                <meshStandardMaterial
                  ref={(material) => {
                    pulseMaterialRefs.current[22 + index] = material;
                  }}
                  color={modeColor}
                  emissive={modeColor}
                  transparent
                  opacity={preset.signatureOpacity * 0.9}
                />
              </mesh>
              <mesh position={[0, 0.42, 0]}>
                <sphereGeometry args={[0.07, 10, 10]} />
                <meshStandardMaterial
                  color={SCENE_HUD_GLOW_WHITE}
                  emissive={modeColor}
                  emissiveIntensity={1.15}
                />
              </mesh>
            </group>
          ))}
        </>
      )}

      {mode === 'stack' && (
        <>
          {stackLayers.map((layer, index) => (
            <mesh
              key={layer.id}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[cityBounds.centerX, layer.y, cityBounds.centerZ]}
            >
              <ringGeometry args={[layer.radiusA, layer.radiusB, 140]} />
              <meshStandardMaterial
                ref={(node) => {
                  pulseMaterialRefs.current[26 + index] = node;
                }}
                color={modeColor}
                emissive={modeColor}
                transparent
                opacity={preset.signatureOpacity * 0.76}
              />
            </mesh>
          ))}
          <mesh position={[cityBounds.centerX, 4.8, cityBounds.centerZ]}>
            <cylinderGeometry args={[cityBounds.size * 0.028, cityBounds.size * 0.028, 9, 24]} />
            <meshStandardMaterial
              ref={(node) => {
                pulseMaterialRefs.current[30] = node;
              }}
              color={modeColor}
              emissive={modeColor}
              transparent
              opacity={preset.signatureOpacity * 0.6}
            />
          </mesh>
        </>
      )}
    </group>
  );
});
