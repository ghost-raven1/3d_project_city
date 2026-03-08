import { useEffect, useMemo, useState } from 'react';
import { CoasterDriveProfile, TourMode } from '../components/scene/types';

interface UseScenePreferencesParams {
  generatedAt?: string;
}

const ATMOSPHERE_STEP_MS = 14000;
const TIME_OF_DAY_STEP_TICKS = 2;
const SCENE_PREFERENCES_STORAGE_KEY = 'repo-city:scene-preferences:v1';

type TimeOfDayMode = 'auto' | 'dawn' | 'day' | 'sunset' | 'night';
type WeatherMode = 'auto' | 'clear' | 'mist' | 'rain' | 'storm';
type UiMode = 'full' | 'balanced' | 'focus';
type VisualPreset = 'immersive' | 'balanced' | 'performance';
type TargetFps = 30 | 45 | 60;
type RenderProfileLock = 'auto' | 'cinematic' | 'balanced' | 'performance';

interface PersistedScenePreferences {
  autoTour: boolean;
  showAtmosphere: boolean;
  showWeather: boolean;
  showBuilders: boolean;
  showMinimap: boolean;
  showInsights: boolean;
  showBranchMap: boolean;
  showFileCard: boolean;
  showChat: boolean;
  showNarrator: boolean;
  showPostProcessing: boolean;
  adaptivePostFx: boolean;
  modePresetIntensity: number;
  showFps: boolean;
  showCyberpunkOverlay: boolean;
  timeOfDay: TimeOfDayMode;
  weatherMode: WeatherMode;
  dynamicAtmosphere: boolean;
  constructionMode: boolean;
  constructionSpeed: number;
  coasterIntensity: number;
  coasterProfile: CoasterDriveProfile;
  tourMode: TourMode;
  followDroneIndex: number;
  liveWatch: boolean;
  topPanelCollapsed: boolean;
  uiMode: UiMode;
  visualPreset: VisualPreset;
  targetFps: TargetFps;
  renderProfileLock: RenderProfileLock;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asEnum<T extends string>(value: unknown, variants: readonly T[]): T | undefined {
  return typeof value === 'string' && variants.includes(value as T) ? (value as T) : undefined;
}

function loadScenePreferences(): Partial<PersistedScenePreferences> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SCENE_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const targetFpsRaw = asNumber(parsed.targetFps);
    const targetFps =
      targetFpsRaw === 30 || targetFpsRaw === 45 || targetFpsRaw === 60
        ? (targetFpsRaw as TargetFps)
        : undefined;
    return {
      autoTour: asBoolean(parsed.autoTour),
      showAtmosphere: asBoolean(parsed.showAtmosphere),
      showWeather: asBoolean(parsed.showWeather),
      showBuilders: asBoolean(parsed.showBuilders),
      showMinimap: asBoolean(parsed.showMinimap),
      showInsights: asBoolean(parsed.showInsights),
      showBranchMap: asBoolean(parsed.showBranchMap),
      showFileCard: asBoolean(parsed.showFileCard),
      showChat: asBoolean(parsed.showChat),
      showNarrator: asBoolean(parsed.showNarrator),
      showPostProcessing: asBoolean(parsed.showPostProcessing),
      adaptivePostFx: asBoolean(parsed.adaptivePostFx),
      modePresetIntensity: asNumber(parsed.modePresetIntensity),
      showFps: asBoolean(parsed.showFps),
      showCyberpunkOverlay: asBoolean(parsed.showCyberpunkOverlay),
      timeOfDay: asEnum(parsed.timeOfDay, ['auto', 'dawn', 'day', 'sunset', 'night']),
      weatherMode: asEnum(parsed.weatherMode, ['auto', 'clear', 'mist', 'rain', 'storm']),
      dynamicAtmosphere: asBoolean(parsed.dynamicAtmosphere),
      constructionMode: asBoolean(parsed.constructionMode),
      constructionSpeed: asNumber(parsed.constructionSpeed),
      coasterIntensity: asNumber(parsed.coasterIntensity),
      coasterProfile: asEnum(parsed.coasterProfile, ['comfort', 'sport', 'extreme']),
      tourMode: asEnum(parsed.tourMode, ['orbit', 'drone', 'walk', 'coaster']),
      followDroneIndex: asNumber(parsed.followDroneIndex),
      liveWatch: asBoolean(parsed.liveWatch),
      topPanelCollapsed: asBoolean(parsed.topPanelCollapsed),
      uiMode: asEnum(parsed.uiMode, ['full', 'balanced', 'focus']),
      visualPreset: asEnum(parsed.visualPreset, [
        'immersive',
        'balanced',
        'performance',
      ]),
      targetFps,
      renderProfileLock: asEnum(parsed.renderProfileLock, [
        'auto',
        'cinematic',
        'balanced',
        'performance',
      ]),
    };
  } catch {
    return {};
  }
}

export function useScenePreferences({ generatedAt }: UseScenePreferencesParams) {
  const persisted = useMemo(() => loadScenePreferences(), []);
  const [autoTour, setAutoTour] = useState(persisted.autoTour ?? true);
  const [showAtmosphere, setShowAtmosphere] = useState(persisted.showAtmosphere ?? true);
  const [showWeather, setShowWeather] = useState(persisted.showWeather ?? true);
  const [showBuilders, setShowBuilders] = useState(persisted.showBuilders ?? true);
  const [showMinimap, setShowMinimap] = useState(persisted.showMinimap ?? true);
  const [showInsights, setShowInsights] = useState(persisted.showInsights ?? true);
  const [showBranchMap, setShowBranchMap] = useState(persisted.showBranchMap ?? true);
  const [showFileCard, setShowFileCard] = useState(persisted.showFileCard ?? true);
  const [showChat, setShowChat] = useState(persisted.showChat ?? true);
  const [showNarrator, setShowNarrator] = useState(persisted.showNarrator ?? true);
  const [showPostProcessing, setShowPostProcessing] = useState(
    persisted.showPostProcessing ?? true,
  );
  const [adaptivePostFx, setAdaptivePostFx] = useState(persisted.adaptivePostFx ?? true);
  const [modePresetIntensity, setModePresetIntensity] = useState(
    persisted.modePresetIntensity ?? 1,
  );
  const [showFps, setShowFps] = useState(persisted.showFps ?? false);
  const [showCyberpunkOverlay, setShowCyberpunkOverlay] = useState(
    persisted.showCyberpunkOverlay ?? true,
  );
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayMode>(persisted.timeOfDay ?? 'auto');
  const [weatherMode, setWeatherMode] = useState<WeatherMode>(persisted.weatherMode ?? 'auto');
  const [dynamicAtmosphere, setDynamicAtmosphere] = useState(
    persisted.dynamicAtmosphere ?? false,
  );
  const [atmosphereTick, setAtmosphereTick] = useState(0);
  const [constructionMode, setConstructionMode] = useState(persisted.constructionMode ?? false);
  const [constructionSpeed, setConstructionSpeed] = useState(
    persisted.constructionSpeed ?? 0.65,
  );
  const [coasterIntensity, setCoasterIntensity] = useState(
    Math.max(0.65, Math.min(1.8, persisted.coasterIntensity ?? 1.1)),
  );
  const [coasterProfile, setCoasterProfile] = useState<CoasterDriveProfile>(
    persisted.coasterProfile ?? 'sport',
  );
  const [tourMode, setTourMode] = useState<TourMode>(persisted.tourMode ?? 'orbit');
  const [followDroneIndex, setFollowDroneIndex] = useState(
    Math.max(0, Math.floor(persisted.followDroneIndex ?? 0)),
  );
  const [walkBuildingPath, setWalkBuildingPath] = useState<string | null>(null);
  const [liveWatch, setLiveWatch] = useState(persisted.liveWatch ?? false);
  const [topPanelCollapsed, setTopPanelCollapsed] = useState(
    persisted.topPanelCollapsed ?? true,
  );
  const [uiMode, setUiMode] = useState<UiMode>(persisted.uiMode ?? 'full');
  const [visualPreset, setVisualPreset] = useState<VisualPreset>(
    persisted.visualPreset ?? 'balanced',
  );
  const [targetFps, setTargetFps] = useState<TargetFps>(persisted.targetFps ?? 45);
  const [renderProfileLock, setRenderProfileLock] = useState<RenderProfileLock>(
    persisted.renderProfileLock ?? 'auto',
  );

  useEffect(() => {
    if (!dynamicAtmosphere) {
      return;
    }

    const interval = setInterval(() => {
      setAtmosphereTick((value) => value + 1);
    }, ATMOSPHERE_STEP_MS);

    return () => clearInterval(interval);
  }, [dynamicAtmosphere]);

  useEffect(() => {
    setWalkBuildingPath(null);
  }, [generatedAt]);

  useEffect(() => {
    if (tourMode !== 'walk') {
      setWalkBuildingPath(null);
    }
  }, [tourMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload: PersistedScenePreferences = {
      autoTour,
      showAtmosphere,
      showWeather,
      showBuilders,
      showMinimap,
      showInsights,
      showBranchMap,
      showFileCard,
      showChat,
      showNarrator,
      showPostProcessing,
      adaptivePostFx,
      modePresetIntensity,
      showFps,
      showCyberpunkOverlay,
      timeOfDay,
      weatherMode,
      dynamicAtmosphere,
      constructionMode,
      constructionSpeed,
      coasterIntensity,
      coasterProfile,
      tourMode,
      followDroneIndex,
      liveWatch,
      topPanelCollapsed,
      uiMode,
      visualPreset,
      targetFps,
      renderProfileLock,
    };
    window.localStorage.setItem(SCENE_PREFERENCES_STORAGE_KEY, JSON.stringify(payload));
  }, [
    adaptivePostFx,
    autoTour,
    constructionMode,
    constructionSpeed,
    coasterIntensity,
    coasterProfile,
    dynamicAtmosphere,
    followDroneIndex,
    liveWatch,
    modePresetIntensity,
    showAtmosphere,
    showBranchMap,
    showBuilders,
    showChat,
    showCyberpunkOverlay,
    showFileCard,
    showFps,
    showInsights,
    showMinimap,
    showNarrator,
    showPostProcessing,
    showWeather,
    timeOfDay,
    topPanelCollapsed,
    tourMode,
    uiMode,
    visualPreset,
    targetFps,
    renderProfileLock,
    weatherMode,
  ]);

  const effectiveTimeOfDay = useMemo(() => {
    if (!dynamicAtmosphere) {
      return timeOfDay;
    }

    const sequence: Array<'dawn' | 'day' | 'sunset' | 'night'> = [
      'dawn',
      'day',
      'sunset',
      'night',
    ];
    const phase = Math.floor(atmosphereTick / TIME_OF_DAY_STEP_TICKS);
    return sequence[phase % sequence.length] ?? 'day';
  }, [atmosphereTick, dynamicAtmosphere, timeOfDay]);

  const effectiveWeatherMode = useMemo(() => {
    if (!dynamicAtmosphere) {
      return weatherMode;
    }

    const sequence: Array<'clear' | 'mist' | 'rain' | 'storm'> = [
      'clear',
      'mist',
      'rain',
      'storm',
      'rain',
      'mist',
      'clear',
      'clear',
    ];
    return sequence[atmosphereTick % sequence.length] ?? 'clear';
  }, [atmosphereTick, dynamicAtmosphere, weatherMode]);

  return {
    autoTour,
    showAtmosphere,
    showWeather,
    showBuilders,
    showMinimap,
    showInsights,
    showBranchMap,
    showFileCard,
    showChat,
    showNarrator,
    showPostProcessing,
    adaptivePostFx,
    modePresetIntensity,
    showFps,
    showCyberpunkOverlay,
    timeOfDay,
    weatherMode,
    dynamicAtmosphere,
    constructionMode,
    constructionSpeed,
    coasterIntensity,
    coasterProfile,
    tourMode,
    followDroneIndex,
    walkBuildingPath,
    liveWatch,
    topPanelCollapsed,
    uiMode,
    visualPreset,
    targetFps,
    renderProfileLock,
    effectiveTimeOfDay,
    effectiveWeatherMode,
    setAutoTour,
    setShowAtmosphere,
    setShowWeather,
    setShowBuilders,
    setShowMinimap,
    setShowInsights,
    setShowBranchMap,
    setShowFileCard,
    setShowChat,
    setShowNarrator,
    setShowPostProcessing,
    setAdaptivePostFx,
    setModePresetIntensity,
    setShowFps,
    setShowCyberpunkOverlay,
    setTimeOfDay,
    setWeatherMode,
    setDynamicAtmosphere,
    setConstructionMode,
    setConstructionSpeed,
    setCoasterIntensity,
    setCoasterProfile,
    setTourMode,
    setFollowDroneIndex,
    setWalkBuildingPath,
    setLiveWatch,
    setTopPanelCollapsed,
    setUiMode,
    setVisualPreset,
    setTargetFps,
    setRenderProfileLock,
  };
}
