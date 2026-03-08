import { memo, useCallback, useMemo, useRef } from 'react';
import {
  BrightnessContrast,
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  GodRays,
  HueSaturation,
  Noise,
  Scanline,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Mesh, Vector2 } from 'three';
import { CityBounds, PostFxQuality, SceneViewMode, TourMode } from './types';
import { SceneModePreset } from './view-mode-presets';

interface PostProcessingLayerProps {
  enabled: boolean;
  quality: PostFxQuality;
  preset: SceneModePreset;
  presetIntensity: number;
  mode: SceneViewMode;
  weather: 'clear' | 'mist' | 'rain' | 'storm';
  timeOfDay: 'dawn' | 'day' | 'sunset' | 'night';
  tourMode: TourMode;
  selectedPath: string | null;
  accentColor: string;
  cityBounds: CityBounds;
}

export const PostProcessingLayer = memo(function PostProcessingLayer({
  enabled,
  quality,
  preset,
  presetIntensity,
  mode,
  weather,
  timeOfDay,
  tourMode,
  selectedPath,
  accentColor,
  cityBounds,
}: PostProcessingLayerProps) {
  const sunRef = useRef<Mesh>(null!);
  const tunedIntensity = Math.max(0.55, Math.min(1.8, presetIntensity));
  const blendBoost = useCallback(
    (target: number) => 1 + (target - 1) * tunedIntensity,
    [tunedIntensity],
  );

  const bloomIntensity = useMemo(() => {
    let value =
      mode === 'risk'
        ? 0.96
        : mode === 'architecture'
          ? 0.86
          : mode === 'stack'
            ? 0.7
            : 0.78;
    if (weather === 'storm') {
      value += 0.1;
    } else if (weather === 'rain') {
      value += 0.05;
    }
    if (timeOfDay === 'night') {
      value += 0.14;
    } else if (timeOfDay === 'sunset') {
      value += 0.07;
    }
    return Math.min(1.28, value * blendBoost(preset.postFxBloomBoost));
  }, [blendBoost, mode, preset.postFxBloomBoost, timeOfDay, weather]);
  const bloomThreshold = useMemo(() => {
    let value = mode === 'stack' ? 0.62 : mode === 'risk' ? 0.56 : 0.54;
    if (timeOfDay === 'night') {
      value -= 0.08;
    } else if (timeOfDay === 'sunset') {
      value -= 0.04;
    }
    if (weather === 'storm') {
      value -= 0.03;
    } else if (weather === 'mist') {
      value += 0.03;
    }
    return Math.max(0.42, Math.min(0.7, value));
  }, [mode, timeOfDay, weather]);
  const bloomSmoothing = useMemo(() => {
    return timeOfDay === 'day' ? 0.16 : 0.2;
  }, [timeOfDay]);

  const chromaticOffset = useMemo(() => {
    const offset =
      mode === 'risk'
        ? 0.00092
        : mode === 'architecture'
          ? 0.0007
          : mode === 'stack'
            ? 0.00054
            : 0.00064;
    return new Vector2(
      offset * blendBoost(preset.postFxChromaticBoost),
      offset * 0.52 * blendBoost(preset.postFxChromaticBoost),
    );
  }, [blendBoost, mode, preset.postFxChromaticBoost]);

  const dofEnabled = tourMode !== 'orbit' || Boolean(selectedPath);
  const godRaysEnabled =
    timeOfDay === 'night' || timeOfDay === 'sunset' || weather === 'storm';
  const qualityScale = quality === 'high' ? 1 : quality === 'medium' ? 0.72 : 0.5;
  const msaa = quality === 'high' ? 4 : quality === 'medium' ? 2 : 0;
  const allowDof = quality !== 'low' && dofEnabled;
  const allowGodRays = quality !== 'low' && godRaysEnabled;
  const allowChromatic = quality !== 'low';
  const allowScanline = quality === 'high' || (quality === 'medium' && mode === 'risk');
  const brightnessCompensation = useMemo(() => {
    let value =
      timeOfDay === 'day'
        ? -0.12
        : timeOfDay === 'dawn'
          ? -0.08
          : timeOfDay === 'sunset'
            ? -0.04
            : -0.01;
    if (weather === 'clear' && timeOfDay === 'day') {
      value -= 0.04;
    } else if (weather === 'mist' && timeOfDay === 'day') {
      value -= 0.02;
    }
    if (timeOfDay === 'night') {
      value -= 0.005;
    }
    if (quality === 'low') {
      value -= 0.015;
    }
    return value;
  }, [quality, timeOfDay, weather]);
  const contrastCompensation = useMemo(() => {
    return timeOfDay === 'day' ? 0.08 : timeOfDay === 'sunset' ? 0.05 : 0.03;
  }, [timeOfDay]);

  const sunPosition: [number, number, number] = [
    cityBounds.centerX + cityBounds.size * 0.3,
    18,
    cityBounds.centerZ - cityBounds.size * 0.3,
  ];

  return (
    <>
      <mesh ref={sunRef} position={sunPosition}>
        <sphereGeometry args={[1.2, 20, 20]} />
        <meshBasicMaterial
          color={timeOfDay === 'night' ? accentColor : '#ffdca8'}
        />
      </mesh>

      <EffectComposer enabled={enabled} multisampling={msaa}>
        <Bloom
          blendFunction={BlendFunction.SCREEN}
          intensity={bloomIntensity * (0.52 + qualityScale * 0.24)}
          luminanceThreshold={bloomThreshold}
          luminanceSmoothing={bloomSmoothing}
          mipmapBlur
        />

        {allowDof ? (
          <DepthOfField
            focusDistance={selectedPath ? 0.032 : 0.024}
            focalLength={selectedPath ? 0.034 : 0.026}
            bokehScale={
              (selectedPath ? 2.3 : 1.7) *
              qualityScale *
              blendBoost(preset.postFxDoFBoost)
            }
            height={quality === 'high' ? 720 : 560}
          />
        ) : (
          <></>
        )}

        {allowGodRays ? (
          <GodRays
            sun={sunRef}
            blendFunction={BlendFunction.SCREEN}
            samples={quality === 'high' ? 60 : 34}
            density={0.88}
            decay={0.94}
            weight={0.55}
            exposure={
              (0.22 + qualityScale * 0.12) *
              blendBoost(preset.postFxGodRaysBoost)
            }
            clampMax={1}
            blur
          />
        ) : (
          <></>
        )}

        {allowChromatic ? (
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={chromaticOffset}
          />
        ) : (
          <></>
        )}
        <Noise
          premultiply
          blendFunction={BlendFunction.SOFT_LIGHT}
          opacity={
            (weather === 'storm' ? 0.14 : 0.08) *
            (quality === 'low' ? 0.56 : 0.82 + qualityScale * 0.2) *
            blendBoost(preset.postFxNoiseBoost)
          }
        />
        {allowScanline ? (
          <Scanline
            blendFunction={BlendFunction.OVERLAY}
            density={1.08}
            opacity={
              (mode === 'risk' ? 0.2 : 0.14) *
              blendBoost(preset.postFxScanlineBoost)
            }
          />
        ) : (
          <></>
        )}
        <HueSaturation
          hue={preset.postFxHue * tunedIntensity}
          saturation={(preset.postFxSaturation - 1) * tunedIntensity}
        />
        <BrightnessContrast
          brightness={preset.postFxBrightness * tunedIntensity + brightnessCompensation}
          contrast={preset.postFxContrast * tunedIntensity + contrastCompensation}
        />
        <Vignette
          eskil={false}
          offset={timeOfDay === 'night' ? 0.22 : 0.18}
          darkness={
            (timeOfDay === 'night' ? 0.42 : 0.28) *
            blendBoost(preset.postFxVignetteBoost)
          }
        />
      </EffectComposer>
    </>
  );
});
