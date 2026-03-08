import { SceneViewMode } from './types';

export interface SceneModePreset {
  key: SceneViewMode;
  label: string;
  accent: string;
  cameraFov: number;
  orbitAutoRotateSpeed: number;
  orbitMinDistance: number;
  orbitMaxDistance: number;
  orbitDamping: number;
  orbitMaxPolarAngle: number;
  orbitFocusLerp: number;
  orbitCameraLerp: number;
  autoTourCadenceSec: number;
  selectedCameraOffset: [number, number, number];
  tourCameraOffset: [number, number, number];
  lightingAmbientScale: number;
  lightingDirectionalScale: number;
  lightingPointScale: number;
  lightingFogNearScale: number;
  lightingFogFarScale: number;
  postFxBloomBoost: number;
  postFxChromaticBoost: number;
  postFxNoiseBoost: number;
  postFxScanlineBoost: number;
  postFxVignetteBoost: number;
  postFxDoFBoost: number;
  postFxGodRaysBoost: number;
  postFxHue: number;
  postFxSaturation: number;
  postFxContrast: number;
  postFxBrightness: number;
  trafficDensity: number;
  airTrafficDensity: number;
  builderDensity: number;
  eventBudget: number;
  agentDensity: number;
  agentBudget: number;
  droneCruiseSpeed: number;
  signatureOpacity: number;
  routeOpacity: number;
  routePulseSpeed: number;
  routePulseCount: number;
  eventIntensityBoost: number;
  serviceMultiplier: number;
  pedestrianMultiplier: number;
  droneSpinBoost: number;
  pointerScale: number;
}

const MODE_PRESETS: Record<SceneViewMode, SceneModePreset> = {
  overview: {
    key: 'overview',
    label: 'Overview',
    accent: '#70dcff',
    cameraFov: 48,
    orbitAutoRotateSpeed: 0.42,
    orbitMinDistance: 8,
    orbitMaxDistance: 190,
    orbitDamping: 0.06,
    orbitMaxPolarAngle: Math.PI / 2.03,
    orbitFocusLerp: 0.06,
    orbitCameraLerp: 0.035,
    autoTourCadenceSec: 6,
    selectedCameraOffset: [8, 8, 8],
    tourCameraOffset: [10, 10, 10],
    lightingAmbientScale: 1,
    lightingDirectionalScale: 1,
    lightingPointScale: 1,
    lightingFogNearScale: 1,
    lightingFogFarScale: 1,
    postFxBloomBoost: 1,
    postFxChromaticBoost: 1,
    postFxNoiseBoost: 1,
    postFxScanlineBoost: 1,
    postFxVignetteBoost: 1,
    postFxDoFBoost: 1,
    postFxGodRaysBoost: 1,
    postFxHue: 0,
    postFxSaturation: 1,
    postFxContrast: 0.02,
    postFxBrightness: 0,
    trafficDensity: 1,
    airTrafficDensity: 1,
    builderDensity: 1,
    eventBudget: 36,
    agentDensity: 1,
    agentBudget: 64,
    droneCruiseSpeed: 1,
    signatureOpacity: 0.28,
    routeOpacity: 0.28,
    routePulseSpeed: 1,
    routePulseCount: 1,
    eventIntensityBoost: 1,
    serviceMultiplier: 1,
    pedestrianMultiplier: 1,
    droneSpinBoost: 1,
    pointerScale: 1,
  },
  architecture: {
    key: 'architecture',
    label: 'Architecture',
    accent: '#6bf7ff',
    cameraFov: 44,
    orbitAutoRotateSpeed: 0.34,
    orbitMinDistance: 6,
    orbitMaxDistance: 170,
    orbitDamping: 0.08,
    orbitMaxPolarAngle: Math.PI / 2.08,
    orbitFocusLerp: 0.082,
    orbitCameraLerp: 0.045,
    autoTourCadenceSec: 5.2,
    selectedCameraOffset: [6.6, 6.8, 6.6],
    tourCameraOffset: [8.4, 8.8, 8.4],
    lightingAmbientScale: 0.96,
    lightingDirectionalScale: 1.08,
    lightingPointScale: 1.2,
    lightingFogNearScale: 1.08,
    lightingFogFarScale: 1.06,
    postFxBloomBoost: 1.16,
    postFxChromaticBoost: 0.8,
    postFxNoiseBoost: 0.78,
    postFxScanlineBoost: 1.1,
    postFxVignetteBoost: 0.92,
    postFxDoFBoost: 1.24,
    postFxGodRaysBoost: 1.05,
    postFxHue: 0.01,
    postFxSaturation: 1.08,
    postFxContrast: 0.06,
    postFxBrightness: 0.02,
    trafficDensity: 1.28,
    airTrafficDensity: 1.2,
    builderDensity: 1.22,
    eventBudget: 32,
    agentDensity: 1.08,
    agentBudget: 72,
    droneCruiseSpeed: 1.08,
    signatureOpacity: 0.4,
    routeOpacity: 0.34,
    routePulseSpeed: 1.18,
    routePulseCount: 2,
    eventIntensityBoost: 1.06,
    serviceMultiplier: 0.92,
    pedestrianMultiplier: 1.36,
    droneSpinBoost: 1.08,
    pointerScale: 1.04,
  },
  risk: {
    key: 'risk',
    label: 'Risk',
    accent: '#ff6a7f',
    cameraFov: 53,
    orbitAutoRotateSpeed: 0.58,
    orbitMinDistance: 9,
    orbitMaxDistance: 210,
    orbitDamping: 0.05,
    orbitMaxPolarAngle: Math.PI / 2.02,
    orbitFocusLerp: 0.095,
    orbitCameraLerp: 0.055,
    autoTourCadenceSec: 4.2,
    selectedCameraOffset: [7.2, 6.2, 7.2],
    tourCameraOffset: [8.8, 7.4, 8.8],
    lightingAmbientScale: 0.84,
    lightingDirectionalScale: 0.72,
    lightingPointScale: 1.34,
    lightingFogNearScale: 0.8,
    lightingFogFarScale: 0.78,
    postFxBloomBoost: 1.36,
    postFxChromaticBoost: 1.48,
    postFxNoiseBoost: 1.42,
    postFxScanlineBoost: 1.34,
    postFxVignetteBoost: 1.3,
    postFxDoFBoost: 1.06,
    postFxGodRaysBoost: 1.2,
    postFxHue: -0.03,
    postFxSaturation: 1.18,
    postFxContrast: 0.14,
    postFxBrightness: -0.02,
    trafficDensity: 0.72,
    airTrafficDensity: 0.88,
    builderDensity: 0.78,
    eventBudget: 46,
    agentDensity: 1.3,
    agentBudget: 86,
    droneCruiseSpeed: 1.02,
    signatureOpacity: 0.44,
    routeOpacity: 0.46,
    routePulseSpeed: 1.34,
    routePulseCount: 2,
    eventIntensityBoost: 1.24,
    serviceMultiplier: 1.42,
    pedestrianMultiplier: 0.7,
    droneSpinBoost: 1.16,
    pointerScale: 1.08,
  },
  stack: {
    key: 'stack',
    label: 'Stack',
    accent: '#89b5ff',
    cameraFov: 41,
    orbitAutoRotateSpeed: 0.26,
    orbitMinDistance: 10,
    orbitMaxDistance: 175,
    orbitDamping: 0.085,
    orbitMaxPolarAngle: Math.PI / 2.16,
    orbitFocusLerp: 0.045,
    orbitCameraLerp: 0.028,
    autoTourCadenceSec: 7.8,
    selectedCameraOffset: [9.8, 11.4, 9.8],
    tourCameraOffset: [11.2, 13.2, 11.2],
    lightingAmbientScale: 1.06,
    lightingDirectionalScale: 0.92,
    lightingPointScale: 0.82,
    lightingFogNearScale: 1.18,
    lightingFogFarScale: 1.2,
    postFxBloomBoost: 0.82,
    postFxChromaticBoost: 0.52,
    postFxNoiseBoost: 0.58,
    postFxScanlineBoost: 0.82,
    postFxVignetteBoost: 0.74,
    postFxDoFBoost: 0.86,
    postFxGodRaysBoost: 0.72,
    postFxHue: 0.04,
    postFxSaturation: 0.86,
    postFxContrast: 0.09,
    postFxBrightness: 0.03,
    trafficDensity: 0.45,
    airTrafficDensity: 0.55,
    builderDensity: 0.62,
    eventBudget: 22,
    agentDensity: 0.62,
    agentBudget: 26,
    droneCruiseSpeed: 0.92,
    signatureOpacity: 0.33,
    routeOpacity: 0.22,
    routePulseSpeed: 0.78,
    routePulseCount: 1,
    eventIntensityBoost: 0.86,
    serviceMultiplier: 0.9,
    pedestrianMultiplier: 0.95,
    droneSpinBoost: 0.92,
    pointerScale: 0.96,
  },
};

export function getSceneModePreset(mode: SceneViewMode): SceneModePreset {
  return MODE_PRESETS[mode];
}
