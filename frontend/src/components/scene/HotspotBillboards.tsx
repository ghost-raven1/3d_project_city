import { memo, useMemo, useRef } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  MeshStandardMaterial,
  ShaderMaterial,
} from 'three';
import { ProjectEventType, SceneViewMode } from './types';
import {
  SCENE_HUD_GLOW_WHITE,
  SCENE_HUD_OUTLINE_DARK,
  SCENE_HUD_PANEL_LIGHT,
  SCENE_HUD_TEXT_PRIMARY,
} from './scene-hud-colors';
import { SCENE_MOTION } from './scene-motion';

interface BillboardNode {
  id: string;
  x: number;
  y: number;
  z: number;
  label: string;
  intensity: number;
  type: ProjectEventType;
}

interface HotspotBillboardsProps {
  nodes: BillboardNode[];
  mode: SceneViewMode;
  accentColor: string;
  presetIntensity?: number;
}

const billboardVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const billboardFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uModeBoost;
  uniform float uSeed;
  uniform float uTickerSpeed;
  uniform float uGlitchAmp;
  uniform float uOpacity;
  uniform vec3 uColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv;

    float bandId = floor((uv.y + uTime * 0.25 + uSeed) * 26.0);
    float glitchMask = step(0.72, hash(vec2(bandId, floor(uTime * 18.0 + uSeed * 13.0))));
    float jitter = (hash(vec2(floor(uTime * 30.0 + 7.0), bandId + uSeed * 29.0)) - 0.5) * uGlitchAmp;
    uv.x += jitter * glitchMask;

    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float shape = smoothstep(0.0, 0.045, edge);
    float border = 1.0 - smoothstep(0.02, 0.08, edge);

    float stripes = step(0.5, fract((uv.y + uTime * 0.38 + uSeed) * 20.0));
    float scan = 0.24 + stripes * 0.24;

    float tickerCenter = fract(uTime * uTickerSpeed + uSeed * 0.41);
    float ticker = exp(-pow((uv.x - tickerCenter) * 9.0, 2.0));

    float pulse = 0.55 + 0.45 * sin((uv.y + uTime * 1.35 + uSeed) * 6.28318);

    vec3 base = uColor * (0.22 + scan + ticker * 0.66 + pulse * 0.24);
    vec3 glitch = vec3(0.82, 0.95, 1.0) * glitchMask * (0.16 + ticker * 0.42);
    vec3 borderGlow = uColor * (0.35 + ticker * 0.45) * border;
    vec3 color = (base + glitch + borderGlow) * (0.62 + uIntensity * 0.9) * uModeBoost;

    float alpha = shape * min(0.98, uOpacity + ticker * 0.25 + border * 0.2);

    gl_FragColor = vec4(color, alpha);
  }
`;

function shortLabel(label: string): string {
  if (label.length <= 28) {
    return label;
  }
  return `…${label.slice(-27)}`;
}

function typeColor(type: ProjectEventType): string {
  if (type === 'accident') {
    return '#ff4f72';
  }
  if (type === 'recovery') {
    return '#55f2b1';
  }
  if (type === 'release') {
    return '#60c8ff';
  }
  return '#f8de7d';
}

function blendHex(colorA: string, colorB: string, factor: number): string {
  const mixed = new Color(colorA).lerp(
    new Color(colorB),
    Math.max(0, Math.min(1, factor)),
  );
  return `#${mixed.getHexString()}`;
}

function modeTickerSpeed(mode: SceneViewMode): number {
  if (mode === 'risk') {
    return 0.58;
  }
  if (mode === 'architecture') {
    return 0.42;
  }
  if (mode === 'stack') {
    return 0.34;
  }
  return 0.38;
}

function modeGlitchBoost(mode: SceneViewMode): number {
  if (mode === 'risk') {
    return 1.35;
  }
  if (mode === 'architecture') {
    return 1.05;
  }
  if (mode === 'stack') {
    return 0.78;
  }
  return 0.92;
}

export const HotspotBillboards = memo(function HotspotBillboards({
  nodes,
  mode,
  accentColor,
  presetIntensity = 1,
}: HotspotBillboardsProps) {
  const refs = useRef<Array<Group | null>>([]);
  const panelMaterials = useRef<Array<ShaderMaterial | null>>([]);
  const ringMaterials = useRef<Array<MeshStandardMaterial | null>>([]);

  const tunedPresetIntensity = useMemo(
    () => Math.max(0.55, Math.min(1.8, presetIntensity)),
    [presetIntensity],
  );

  const modeBoost = useMemo(() => {
    if (mode === 'risk') {
      return 1.24;
    }
    if (mode === 'architecture') {
      return 1.1;
    }
    if (mode === 'stack') {
      return 0.86;
    }
    return 1;
  }, [mode]);

  const tickerBase = useMemo(() => modeTickerSpeed(mode), [mode]);
  const glitchBase = useMemo(() => modeGlitchBoost(mode), [mode]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((node, index) => {
      const item = nodes[index];
      if (!node || !item) {
        return;
      }

      const bob = Math.sin(t * (SCENE_MOTION.billboardBobBaseHz + item.intensity * 1.4) + index * 0.73);
      node.position.y = item.y + bob * 0.09;
      node.rotation.y = Math.sin(t * 0.54 + index * 0.8) * 0.22;
      const scaleWave = 1 + Math.max(0, Math.sin(t * 2.1 + index * 0.47)) * 0.06;
      node.scale.setScalar(scaleWave);
    });

    panelMaterials.current.forEach((material, index) => {
      const item = nodes[index];
      if (!material || !item) {
        return;
      }

      const uniforms = material.uniforms as Record<string, { value: unknown }>;
      const pulse =
        0.45 +
        Math.max(
          0,
          Math.sin(
            t * (SCENE_MOTION.billboardPanelPulseBaseHz + item.intensity * 2.4) + index * 0.51,
          ),
        ) * 0.7;

      if (uniforms.uTime) {
        uniforms.uTime.value = t;
      }
      if (uniforms.uModeBoost) {
        uniforms.uModeBoost.value = modeBoost;
      }
      if (uniforms.uIntensity) {
        uniforms.uIntensity.value = 0.6 + item.intensity * 0.9;
      }
      if (uniforms.uTickerSpeed) {
        uniforms.uTickerSpeed.value =
          tickerBase + item.intensity * 0.24 + tunedPresetIntensity * 0.08;
      }
      if (uniforms.uGlitchAmp) {
        uniforms.uGlitchAmp.value =
          (0.022 + item.intensity * 0.018) * glitchBase * (0.85 + tunedPresetIntensity * 0.2);
      }
      if (uniforms.uOpacity) {
        uniforms.uOpacity.value = Math.min(0.94, 0.28 + pulse * 0.32);
      }
    });

    ringMaterials.current.forEach((material, index) => {
      const item = nodes[index];
      if (!material || !item) {
        return;
      }

      const pulse =
        0.36 +
        Math.max(0, Math.sin(t * SCENE_MOTION.billboardRingPulseBaseHz + index * 0.8)) * 1.05;
      material.emissiveIntensity =
        pulse * (0.64 + item.intensity * 0.92) * modeBoost * (0.9 + tunedPresetIntensity * 0.14);
      material.opacity = Math.min(0.9, 0.2 + pulse * 0.24);
    });
  });

  if (nodes.length === 0) {
    return null;
  }

  return (
    <group>
      {nodes.map((item, index) => {
        const color = blendHex(typeColor(item.type), accentColor, 0.44);
        const panelWidth = 0.86 + item.intensity * 0.62;
        const panelHeight = 0.26 + item.intensity * 0.18;
        const ringRadius = 0.2 + item.intensity * 0.15;
        const seed = (index + 1) * 0.173 + item.intensity * 0.67;

        return (
          <group
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            position={[item.x, item.y, item.z]}
          >
            <mesh position={[0, -0.54, 0]}>
              <cylinderGeometry args={[0.02, 0.03, 1.08, 8]} />
              <meshStandardMaterial
                color={SCENE_HUD_PANEL_LIGHT}
                emissive={SCENE_HUD_GLOW_WHITE}
                emissiveIntensity={0.25}
                metalness={0.36}
                roughness={0.4}
              />
            </mesh>

            <mesh position={[0, 0, 0.01]}>
              <planeGeometry args={[panelWidth, panelHeight]} />
              <shaderMaterial
                ref={(node) => {
                  panelMaterials.current[index] = node;
                }}
                transparent
                depthWrite={false}
                blending={AdditiveBlending}
                side={DoubleSide}
                uniforms={{
                  uTime: { value: 0 },
                  uIntensity: { value: 0.8 + item.intensity },
                  uModeBoost: { value: modeBoost },
                  uSeed: { value: seed },
                  uTickerSpeed: { value: tickerBase + item.intensity * 0.24 },
                  uGlitchAmp: { value: (0.02 + item.intensity * 0.02) * glitchBase },
                  uOpacity: { value: 0.42 },
                  uColor: { value: new Color(color) },
                }}
                vertexShader={billboardVertexShader}
                fragmentShader={billboardFragmentShader}
              />
            </mesh>

            <Text
              position={[0, 0.005, 0.04]}
              fontSize={0.088 + item.intensity * 0.03}
              color={SCENE_HUD_TEXT_PRIMARY}
              anchorX="center"
              anchorY="middle"
              maxWidth={panelWidth * 0.88}
              outlineWidth={0.009}
              outlineColor={SCENE_HUD_OUTLINE_DARK}
            >
              {shortLabel(item.label)}
            </Text>

            <mesh position={[0, -0.18, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[ringRadius, ringRadius + 0.08, 24]} />
              <meshStandardMaterial
                ref={(node) => {
                  ringMaterials.current[index] = node;
                }}
                color={color}
                emissive={color}
                emissiveIntensity={1}
                transparent
                opacity={0.35}
              />
            </mesh>

            {index < 10 && (
              <pointLight
                color={color}
                intensity={(0.52 + item.intensity * 0.68) * modeBoost * (0.86 + tunedPresetIntensity * 0.2)}
                distance={4 + item.intensity * 2.8}
                decay={2}
                position={[0, 0.1, 0.08]}
              />
            )}
          </group>
        );
      })}
    </group>
  );
});
