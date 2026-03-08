import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CatmullRomCurve3,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import {
  advanceCoasterRide,
  buildCoasterTrack,
  createInitialCoasterRideState,
  DEFAULT_COASTER_PHYSICS,
  resolveCoasterDriveProfileTuning,
  sampleCoasterTrack,
} from './roller-coaster';
import {
  BuildingFootprint,
  CityBounds,
  CoasterCameraPose,
  CoasterControlInput,
  CoasterDriveProfile,
  PostFxQuality,
  SceneViewMode,
} from './types';

interface RollerCoasterProps {
  enabled: boolean;
  rideActive: boolean;
  cityBounds: CityBounds;
  buildingFootprints: BuildingFootprint[];
  seed: number;
  mode: SceneViewMode;
  quality: PostFxQuality;
  intensity: number;
  driveProfile: CoasterDriveProfile;
  accentColor: string;
  controlInput?: CoasterControlInput | null;
  onCameraPoseChange?: (pose: CoasterCameraPose | null) => void;
}

const upVector = new Vector3(0, 1, 0);
const rightVector = new Vector3();
const tangentVector = new Vector3();
const lookVector = new Vector3();
const forwardLookVector = new Vector3();
const lookRightVector = new Vector3();
const lookUpVector = new Vector3();
const scaleVector = new Vector3();
const matrix = new Matrix4();
const quaternion = new Quaternion();
const fallbackForward = new Vector3(1, 0, 0);
const carForwardVector = new Vector3();
const carRightVector = new Vector3();
const carUpVector = new Vector3();
const carOffsetVector = new Vector3();
const carMatrix = new Matrix4();
const carQuaternion = new Quaternion();
const carBankQuaternion = new Quaternion();

interface TieTransform {
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentY: number;
  tangentZ: number;
}

type CoasterFxKind = 'smoke' | 'firework' | 'burst';

interface CoasterFxAnchor {
  id: string;
  x: number;
  y: number;
  z: number;
  phase: number;
  strength: number;
  kind: CoasterFxKind;
}

export function RollerCoaster({
  enabled,
  rideActive,
  cityBounds,
  buildingFootprints,
  seed,
  mode,
  quality,
  intensity,
  driveProfile,
  accentColor,
  controlInput,
  onCameraPoseChange,
}: RollerCoasterProps) {
  const trainRefs = useRef<Array<Group | null>>([]);
  const tieMeshRef = useRef<InstancedMesh | null>(null);
  const smokeRefs = useRef<Array<Group | null>>([]);
  const smokePulseRefs = useRef<Array<MeshStandardMaterial | null>>([]);
  const fireworkRefs = useRef<Array<Group | null>>([]);
  const fireworkCoreRefs = useRef<Array<MeshStandardMaterial | null>>([]);
  const fireworkWaveRefs = useRef<Array<MeshStandardMaterial | null>>([]);
  const burstRefs = useRef<Array<Group | null>>([]);
  const burstCoreRefs = useRef<Array<MeshStandardMaterial | null>>([]);
  const keyStateRef = useRef<Record<string, boolean>>({});
  const throttleRef = useRef(0);
  const cameraModeRef = useRef<'front' | 'chase'>('front');
  const resetRequestedRef = useRef(false);
  const wasRideActiveRef = useRef(rideActive);
  const lapTimeSecRef = useRef(0);
  const bestLapSecRef = useRef<number | null>(null);
  const topSpeedRef = useRef(0);
  const lastLapRef = useRef(0);
  const externalCameraToggleSeq = controlInput?.cameraToggleSeq ?? 0;
  const externalResetSeq = controlInput?.resetSeq ?? 0;
  const externalRegenerateSeq = controlInput?.regenerateSeq ?? 0;
  const externalManualThrottle = controlInput?.manualThrottle ?? null;
  const lastExternalCameraToggleSeqRef = useRef(externalCameraToggleSeq);
  const lastExternalResetSeqRef = useRef(externalResetSeq);
  const lastExternalRegenerateSeqRef = useRef(externalRegenerateSeq);
  const lookYawRef = useRef(0);
  const lookPitchRef = useRef(0);
  const lookDragActiveRef = useRef(false);
  const lastLookPointerRef = useRef<{ x: number; y: number } | null>(null);
  const latestTrackInputsRef = useRef({
    cityBounds,
    buildingFootprints,
    seed,
  });
  const [trackRebuildVersion, setTrackRebuildVersion] = useState(0);
  const rideStateRef = useRef(createInitialCoasterRideState({
    points: [],
    supports: [],
    totalLength: 0,
    minClearance: Number.POSITIVE_INFINITY,
    maxHeight: 0,
  }));

  const trackLayout = useMemo(() => {
    const source = latestTrackInputsRef.current;
    const rebuildSeed = source.seed + trackRebuildVersion * 997.3;
    return buildCoasterTrack(
      source.buildingFootprints,
      source.cityBounds,
      rebuildSeed,
    );
  }, [trackRebuildVersion]);

  const resetRideSession = useCallback(() => {
    const initialState = createInitialCoasterRideState(trackLayout);
    rideStateRef.current = initialState;
    throttleRef.current = 0;
    keyStateRef.current = {};
    cameraModeRef.current = 'front';
    resetRequestedRef.current = false;
    lapTimeSecRef.current = 0;
    bestLapSecRef.current = null;
    topSpeedRef.current = initialState.speed;
    lastLapRef.current = initialState.lap;
    lookYawRef.current = 0;
    lookPitchRef.current = 0;
    lookDragActiveRef.current = false;
    lastLookPointerRef.current = null;
  }, [trackLayout]);

  useEffect(() => {
    resetRideSession();
  }, [resetRideSession]);

  useEffect(() => {
    if (!enabled) {
      onCameraPoseChange?.(null);
    }
  }, [enabled, onCameraPoseChange]);

  useEffect(() => {
    if (rideActive) {
      return;
    }
    onCameraPoseChange?.(null);
  }, [onCameraPoseChange, rideActive]);

  useEffect(() => {
    if (rideActive && !wasRideActiveRef.current) {
      resetRideSession();
    }
    if (!rideActive) {
      throttleRef.current = 0;
      keyStateRef.current = {};
    }
    wasRideActiveRef.current = rideActive;
  }, [resetRideSession, rideActive]);

  useEffect(() => {
    latestTrackInputsRef.current = {
      cityBounds,
      buildingFootprints,
      seed,
    };
  }, [buildingFootprints, cityBounds, seed]);

  useEffect(() => {
    if (externalRegenerateSeq === lastExternalRegenerateSeqRef.current) {
      return;
    }
    lastExternalRegenerateSeqRef.current = externalRegenerateSeq;
    latestTrackInputsRef.current = {
      cityBounds,
      buildingFootprints,
      seed,
    };
    setTrackRebuildVersion((current) => current + 1);
    resetRequestedRef.current = true;
  }, [buildingFootprints, cityBounds, externalRegenerateSeq, seed]);

  useEffect(() => {
    if (externalCameraToggleSeq === lastExternalCameraToggleSeqRef.current) {
      return;
    }
    lastExternalCameraToggleSeqRef.current = externalCameraToggleSeq;
    if (!rideActive) {
      return;
    }
    lookYawRef.current = 0;
    lookPitchRef.current = 0;
  }, [externalCameraToggleSeq, rideActive]);

  useEffect(() => {
    if (externalResetSeq === lastExternalResetSeqRef.current) {
      return;
    }
    lastExternalResetSeqRef.current = externalResetSeq;
    if (rideActive) {
      resetRequestedRef.current = true;
    }
  }, [externalResetSeq, rideActive]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const isCoasterControl =
        key === 'w' ||
        key === 's' ||
        key === 'b' ||
        key === 'c' ||
        key === 'r' ||
        key === 'arrowup' ||
        key === 'arrowdown' ||
        key === ' ';
      if (rideActive && isCoasterControl) {
        event.preventDefault();
      }
      keyStateRef.current[key] = true;
      if (key === 'c' && rideActive) {
        lookYawRef.current = 0;
        lookPitchRef.current = 0;
      }
      if (key === 'r' && rideActive) {
        resetRequestedRef.current = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keyStateRef.current[key] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [rideActive]);

  useEffect(() => {
    const applyLookDelta = (dx: number, dy: number) => {
      lookYawRef.current = Math.max(-0.9, Math.min(0.9, lookYawRef.current - dx * 0.0029));
      lookPitchRef.current = Math.max(-0.44, Math.min(0.36, lookPitchRef.current - dy * 0.0023));
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!rideActive) {
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      const target = event.target as Element | null;
      if (!target || !target.closest('#repo-city-canvas')) {
        return;
      }
      lookDragActiveRef.current = true;
      lastLookPointerRef.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!rideActive || !lookDragActiveRef.current) {
        return;
      }
      const last = lastLookPointerRef.current;
      if (!last) {
        lastLookPointerRef.current = { x: event.clientX, y: event.clientY };
        return;
      }
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      lastLookPointerRef.current = { x: event.clientX, y: event.clientY };
      applyLookDelta(dx, dy);
    };

    const onPointerEnd = () => {
      lookDragActiveRef.current = false;
      lastLookPointerRef.current = null;
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [rideActive]);

  const carCount = quality === 'low' ? 2 : quality === 'medium' ? 3 : 4;
  const tieCount = quality === 'low' ? 64 : quality === 'medium' ? 92 : 128;
  const railRadius = quality === 'low' ? 0.06 : 0.07;
  const railSegments = quality === 'low' ? 6 : 8;
  const tunedIntensity = Math.max(0.65, Math.min(1.8, intensity));
  const driveProfileTuning = useMemo(
    () => resolveCoasterDriveProfileTuning(driveProfile),
    [driveProfile],
  );

  const ties = useMemo<TieTransform[]>(() => {
    if (trackLayout.totalLength <= 0) {
      return [];
    }

    const spacing = Math.max(2.4, trackLayout.totalLength / tieCount);
    const result: TieTransform[] = [];

    for (let index = 0; index < tieCount; index += 1) {
      const sample = sampleCoasterTrack(trackLayout, index * spacing);
      if (!sample) {
        continue;
      }

      result.push({
        x: sample.x,
        y: sample.y,
        z: sample.z,
        tangentX: sample.tangentX,
        tangentY: sample.tangentY,
        tangentZ: sample.tangentZ,
      });
    }

    return result;
  }, [tieCount, trackLayout]);

  const coasterEffects = useMemo<CoasterFxAnchor[]>(() => {
    if (trackLayout.points.length < 4) {
      return [];
    }

    const budget = quality === 'low' ? 4 : quality === 'medium' ? 7 : 11;
    const seedUnit = (index: number): number => {
      const raw = Math.sin(seed * 13.91 + index * 79.17) * 43758.5453;
      return raw - Math.floor(raw);
    };

    const supportSource = trackLayout.supports.map((support, index) => ({
      key: support.path || `support-${index}`,
      x: support.x,
      y: support.railY + 0.42,
      z: support.z,
      index,
    }));
    const pointStride = Math.max(12, Math.floor(trackLayout.points.length / Math.max(1, budget * 2)));
    const pointSource = trackLayout.points
      .filter((_, index) => index % pointStride === 0)
      .map((point, index) => ({
        key: `point-${index}`,
        x: point.x,
        y: point.y + 0.48,
        z: point.z,
        index,
      }));

    const source = supportSource.length >= 3 ? supportSource : pointSource;
    if (source.length === 0) {
      return [];
    }

    const stride = Math.max(1, Math.floor(source.length / Math.max(1, budget)));
    const result: CoasterFxAnchor[] = [];

    for (let index = 0; index < source.length && result.length < budget; index += stride) {
      const node = source[index];
      if (!node) {
        continue;
      }

      const slot = result.length;
      const kind: CoasterFxKind =
        slot % 3 === 0 ? 'smoke' : slot % 3 === 1 ? 'firework' : 'burst';
      const phase = seedUnit(index + slot * 3.1);
      const offsetAngle = phase * Math.PI * 2;
      const offsetRadius = 0.34 + seedUnit(index + slot + 9) * 0.52;
      const x = node.x + Math.cos(offsetAngle) * offsetRadius;
      const z = node.z + Math.sin(offsetAngle) * offsetRadius;
      const y = node.y + (kind === 'firework' ? 0.5 : kind === 'burst' ? 0.26 : 0.08);

      result.push({
        id: `${kind}-${node.key}-${slot}`,
        x,
        y,
        z,
        phase,
        strength: 0.72 + seedUnit(index + slot + 17) * 0.58,
        kind,
      });
    }

    return result;
  }, [quality, seed, trackLayout.points, trackLayout.supports]);

  const smokeEffects = useMemo(
    () => coasterEffects.filter((effect) => effect.kind === 'smoke'),
    [coasterEffects],
  );
  const fireworkEffects = useMemo(
    () => coasterEffects.filter((effect) => effect.kind === 'firework'),
    [coasterEffects],
  );
  const burstEffects = useMemo(
    () => coasterEffects.filter((effect) => effect.kind === 'burst'),
    [coasterEffects],
  );

  const { leftCurve, rightCurve } = useMemo(() => {
    if (trackLayout.points.length === 0) {
      return {
        leftCurve: new CatmullRomCurve3([], true),
        rightCurve: new CatmullRomCurve3([], true),
      };
    }

    const railOffset = 0.22;
    const leftPoints: Vector3[] = [];
    const rightPoints: Vector3[] = [];

    trackLayout.points.forEach((point) => {
      tangentVector.set(point.tangentX, point.tangentY, point.tangentZ);
      rightVector.crossVectors(tangentVector, upVector);

      if (rightVector.lengthSq() < 0.0001) {
        rightVector.set(0, 0, 1);
      } else {
        rightVector.normalize();
      }

      leftPoints.push(
        new Vector3(
          point.x - rightVector.x * railOffset,
          point.y,
          point.z - rightVector.z * railOffset,
        ),
      );
      rightPoints.push(
        new Vector3(
          point.x + rightVector.x * railOffset,
          point.y,
          point.z + rightVector.z * railOffset,
        ),
      );
    });

    return {
      leftCurve: new CatmullRomCurve3(leftPoints, true, 'centripetal', 0.34),
      rightCurve: new CatmullRomCurve3(rightPoints, true, 'centripetal', 0.34),
    };
  }, [trackLayout.points]);

  useEffect(() => {
    const tieMesh = tieMeshRef.current;
    if (!tieMesh) {
      return;
    }

    ties.forEach((tie, index) => {
      tangentVector.set(tie.tangentX, tie.tangentY, tie.tangentZ);
      if (tangentVector.lengthSq() < 0.0001) {
        tangentVector.copy(fallbackForward);
      } else {
        tangentVector.normalize();
      }

      lookVector.crossVectors(tangentVector, upVector);
      if (lookVector.lengthSq() < 0.0001) {
        lookVector.set(0, 0, 1);
      } else {
        lookVector.normalize();
      }

      quaternion.setFromUnitVectors(fallbackForward, lookVector);
      matrix.compose(
        new Vector3(tie.x, tie.y - 0.02, tie.z),
        quaternion,
        scaleVector.set(1, 1, 1),
      );
      tieMesh.setMatrixAt(index, matrix);
    });

    tieMesh.instanceMatrix.needsUpdate = true;
  }, [ties]);

  useFrame((_, delta) => {
    if (!enabled || trackLayout.totalLength <= 0 || trackLayout.points.length < 2) {
      return;
    }

    if (rideActive && resetRequestedRef.current) {
      resetRideSession();
    }

    const tunedConfig = {
      ...DEFAULT_COASTER_PHYSICS,
      cruiseSpeed:
        (mode === 'risk' ? 15.5 : mode === 'architecture' ? 13.3 : 14) *
        (0.92 + tunedIntensity * 0.1) *
        driveProfileTuning.speed,
      gravityScale:
        (mode === 'risk' ? 1.02 : mode === 'architecture' ? 0.9 : 0.96) *
        (0.88 + tunedIntensity * 0.16) *
        driveProfileTuning.gravity,
      slopeDriveSuppression:
        (mode === 'risk' ? 1.95 : 1.78) *
        (0.84 + tunedIntensity * 0.2) *
        driveProfileTuning.slopeSuppression,
      slopeLookaheadGain:
        (mode === 'risk' ? 4.5 : 4.1) *
        (0.86 + tunedIntensity * 0.2) *
        driveProfileTuning.lookahead,
      downhillRushGain:
        (mode === 'risk' ? 1.2 : 1.08) *
        (0.84 + tunedIntensity * 0.22) *
        driveProfileTuning.downhill,
      uphillResistance:
        ((mode === 'risk' ? 0.17 : 0.22) / (0.92 + tunedIntensity * 0.12)) *
        driveProfileTuning.uphill,
      maxLateralAccel:
        (mode === 'risk' ? 26 : 24) *
        (0.94 + tunedIntensity * 0.1) *
        driveProfileTuning.lateral,
      manualBoostForce:
        (mode === 'risk' ? 4.2 : 3.8) *
        (0.86 + tunedIntensity * 0.2) *
        driveProfileTuning.boost,
      manualBrakeForce:
        (mode === 'risk' ? 5.2 : 5.8) *
        (0.84 + tunedIntensity * 0.14) *
        driveProfileTuning.brake,
      manualTopSpeedBoost:
        (mode === 'risk' ? 6 : 5.2) *
        (0.84 + tunedIntensity * 0.18) *
        driveProfileTuning.topBoost,
    };

    const keyState = keyStateRef.current;
    const manualThrottle =
      externalManualThrottle === null
        ? null
        : Math.max(-1, Math.min(1, externalManualThrottle));
    const boostPressed = Boolean(keyState.w || keyState.arrowup || keyState[' ']);
    const brakePressed = Boolean(keyState.s || keyState.arrowdown || keyState.b);
    const throttleTarget =
      manualThrottle !== null
        ? manualThrottle
        : boostPressed && !brakePressed
          ? 1
          : brakePressed && !boostPressed
            ? -1
            : 0;
    const throttleBlend = 1 - Math.exp(-delta * (Math.abs(throttleTarget) < 0.02 ? 6 : 9.5));
    throttleRef.current += (throttleTarget - throttleRef.current) * throttleBlend;
    const throttle = rideActive
      ? Math.max(-1, Math.min(1, throttleRef.current))
      : 0;

    rideStateRef.current = advanceCoasterRide(
      trackLayout,
      rideStateRef.current,
      delta,
      tunedConfig,
      { throttle },
    );

    if (rideActive) {
      topSpeedRef.current = Math.max(topSpeedRef.current, rideStateRef.current.speed);
      lapTimeSecRef.current += delta;
      const lapDelta = rideStateRef.current.lap - lastLapRef.current;
      if (lapDelta > 0) {
        const completedLapTime = lapTimeSecRef.current / lapDelta;
        if (
          completedLapTime > 0.1 &&
          (bestLapSecRef.current === null || completedLapTime < bestLapSecRef.current)
        ) {
          bestLapSecRef.current = completedLapTime;
        }
        lapTimeSecRef.current = 0;
        lastLapRef.current = rideStateRef.current.lap;
      } else if (lapDelta < 0) {
        lapTimeSecRef.current = 0;
        lastLapRef.current = rideStateRef.current.lap;
      }
    }

    const leadSample = sampleCoasterTrack(trackLayout, rideStateRef.current.distance);
    if (!leadSample) {
      return;
    }

    const downhillFactor = Math.max(0, -leadSample.slope);
    const uphillFactor = Math.max(0, leadSample.slope);
    const lookAheadDistance = Math.max(
      6.8,
      rideStateRef.current.speed * (0.48 + downhillFactor * (0.18 + tunedIntensity * 0.08)),
    );
    const lookSample = sampleCoasterTrack(
      trackLayout,
      rideStateRef.current.distance + lookAheadDistance,
    );

    if (!lookSample) {
      return;
    }

    tangentVector.set(
      leadSample.tangentX,
      leadSample.tangentY,
      leadSample.tangentZ,
    );
    if (tangentVector.lengthSq() > 0.0001) {
      tangentVector.normalize();
    }
    rightVector.crossVectors(tangentVector, upVector);
    if (rightVector.lengthSq() > 0.0001) {
      rightVector.normalize();
    } else {
      rightVector.set(0, 0, 1);
    }

    const banking = Math.max(
      -0.2,
      Math.min(
        0.25,
        leadSample.curvature * rideStateRef.current.speed * (0.15 + tunedIntensity * 0.04),
      ),
    );
    const timeSec = performance.now() * 0.001;
    const vibration =
      Math.sin(timeSec * 18) *
      Math.min(
        0.036 * driveProfileTuning.cameraEnergy,
        rideStateRef.current.speed * (0.0009 + tunedIntensity * 0.0002) +
          Math.abs(rideStateRef.current.acceleration) * (0.0014 + tunedIntensity * 0.0006),
      ) *
      driveProfileTuning.cameraEnergy;
    if (rideActive) {
      const cameraMode = cameraModeRef.current;
      const fovBoost =
        (downhillFactor * (8.4 + tunedIntensity * 3.6) - uphillFactor * 2.3) *
        driveProfileTuning.cameraEnergy;
      forwardLookVector.set(
        lookSample.x - leadSample.x,
        lookSample.y - leadSample.y,
        lookSample.z - leadSample.z,
      );
      if (forwardLookVector.lengthSq() < 0.0001) {
        forwardLookVector.copy(tangentVector);
      } else {
        forwardLookVector.normalize();
      }
      lookRightVector.crossVectors(forwardLookVector, upVector);
      if (lookRightVector.lengthSq() < 0.0001) {
        lookRightVector.copy(rightVector);
      } else {
        lookRightVector.normalize();
      }
      lookUpVector.crossVectors(lookRightVector, forwardLookVector);
      if (lookUpVector.lengthSq() < 0.0001) {
        lookUpVector.set(0, 1, 0);
      } else {
        lookUpVector.normalize();
      }
      if (cameraMode === 'front') {
        forwardLookVector
          .addScaledVector(lookRightVector, lookYawRef.current)
          .addScaledVector(lookUpVector, lookPitchRef.current);
        if (forwardLookVector.lengthSq() < 0.0001) {
          forwardLookVector.copy(tangentVector);
        } else {
          forwardLookVector.normalize();
        }
      }
      const chaseDistance =
        (3.4 + rideStateRef.current.speed * (0.04 + tunedIntensity * 0.02)) *
        (0.94 + driveProfileTuning.cameraEnergy * 0.08);
      const chaseLift =
        1.22 + Math.abs(leadSample.curvature) * (0.16 + tunedIntensity * 0.08);
      let cameraX =
        cameraMode === 'front'
          ? leadSample.x - tangentVector.x * 0.08 + rightVector.x * banking * 0.1
          : leadSample.x - tangentVector.x * chaseDistance + rightVector.x * banking * 0.42;
      let cameraY =
        cameraMode === 'front'
          ? leadSample.y + 0.49 + vibration
          : leadSample.y + chaseLift + vibration * 0.65;
      let cameraZ =
        cameraMode === 'front'
          ? leadSample.z - tangentVector.z * 0.08 + rightVector.z * banking * 0.1
          : leadSample.z - tangentVector.z * chaseDistance + rightVector.z * banking * 0.42;
      if (cameraMode === 'front') {
        const bodyCenterX = leadSample.x;
        const bodyCenterY = leadSample.y + 0.24;
        const bodyCenterZ = leadSample.z;
        carOffsetVector.set(
          cameraX - bodyCenterX,
          cameraY - bodyCenterY,
          cameraZ - bodyCenterZ,
        );
        const localX = carOffsetVector.dot(rightVector);
        const localY = carOffsetVector.y;
        const localZ = carOffsetVector.dot(tangentVector);
        const insideBody =
          Math.abs(localX) < 0.5 &&
          Math.abs(localZ) < 0.68 &&
          localY < 0.24;
        if (insideBody) {
          const lift = 0.24 - localY + 0.08;
          cameraX += upVector.x * lift + tangentVector.x * 0.08;
          cameraY += upVector.y * lift + tangentVector.y * 0.08;
          cameraZ += upVector.z * lift + tangentVector.z * 0.08;
        }
      }
      const seatLookDistance = 4.4 + downhillFactor * 0.95;
      const targetX =
        cameraMode === 'front'
          ? cameraX + forwardLookVector.x * seatLookDistance
          : leadSample.x + tangentVector.x * (4.8 + downhillFactor * 1.6);
      const targetY =
        cameraMode === 'front'
          ? cameraY + forwardLookVector.y * seatLookDistance
          : leadSample.y + 0.62 + uphillFactor * 0.52 - downhillFactor * 0.2;
      const targetZ =
        cameraMode === 'front'
          ? cameraZ + forwardLookVector.z * seatLookDistance
          : leadSample.z + tangentVector.z * (4.8 + downhillFactor * 1.6);
      const baseFov = cameraMode === 'front' ? 60 : 57;
      const minFov = cameraMode === 'front' ? 58 : 54;
      const maxFov = cameraMode === 'front' ? 78 : 73;

      onCameraPoseChange?.({
        x: cameraX,
        y: cameraY,
        z: cameraZ,
        targetX,
        targetY,
        targetZ,
        fov: Math.max(
          minFov,
          Math.min(
            maxFov,
            baseFov +
              (rideStateRef.current.speed - 8) * (0.56 + tunedIntensity * 0.07) +
              (rideStateRef.current.gForce - 1) * (3.8 + tunedIntensity * 0.62) +
              fovBoost,
          ),
        ),
        speed: rideStateRef.current.speed,
        acceleration: rideStateRef.current.acceleration,
        gForce: rideStateRef.current.gForce,
        lap: rideStateRef.current.lap,
        emergencyBrake: rideStateRef.current.emergencyBrake,
        slope: leadSample.slope,
        clearance: leadSample.clearance,
        throttle,
        cameraMode,
        lapTimeSec: lapTimeSecRef.current,
        bestLapSec: bestLapSecRef.current,
        topSpeed: topSpeedRef.current,
      });
    }

    const spacing = 2.6;
    trainRefs.current.forEach((car, index) => {
      if (!car) {
        return;
      }

      const sample = sampleCoasterTrack(trackLayout, rideStateRef.current.distance - index * spacing);
      const ahead = sampleCoasterTrack(
        trackLayout,
        rideStateRef.current.distance - index * spacing + 1.3,
      );
      if (!sample || !ahead) {
        return;
      }

      car.position.set(sample.x, sample.y + 0.19, sample.z);
      carForwardVector.set(
        ahead.x - sample.x,
        ahead.y - sample.y,
        ahead.z - sample.z,
      );
      if (carForwardVector.lengthSq() < 0.000001) {
        carForwardVector.copy(tangentVector);
      } else {
        carForwardVector.normalize();
      }
      // Keep a right-handed basis: right = up x forward, up = forward x right.
      carRightVector.crossVectors(upVector, carForwardVector);
      if (carRightVector.lengthSq() < 0.000001) {
        carRightVector.set(1, 0, 0).applyQuaternion(car.quaternion);
      } else {
        carRightVector.normalize();
      }
      carUpVector.crossVectors(carForwardVector, carRightVector);
      if (carUpVector.lengthSq() < 0.000001) {
        carUpVector.copy(upVector);
      } else {
        carUpVector.normalize();
      }
      carRightVector.crossVectors(carUpVector, carForwardVector).normalize();

      carMatrix.makeBasis(carRightVector, carUpVector, carForwardVector);
      carQuaternion.setFromRotationMatrix(carMatrix);

      const sway = Math.max(-0.34, Math.min(0.34, sample.curvature * rideStateRef.current.speed * 0.2));
      carBankQuaternion.setFromAxisAngle(carForwardVector, sway * 0.52);
      carQuaternion.multiply(carBankQuaternion);

      // Prevent long-path interpolation that visually looks like a full spin.
      if (car.quaternion.dot(carQuaternion) < 0) {
        carQuaternion.x *= -1;
        carQuaternion.y *= -1;
        carQuaternion.z *= -1;
        carQuaternion.w *= -1;
      }
      car.quaternion.slerp(carQuaternion, 0.62);
    });

    smokeRefs.current.forEach((node, index) => {
      const effect = smokeEffects[index];
      if (!node || !effect) {
        return;
      }
      const rise = Math.max(0, Math.sin((timeSec * 0.8 + effect.phase) * Math.PI * 2));
      node.position.y = effect.y + rise * (0.34 + effect.strength * 0.25);
      const scale = 0.82 + rise * 0.5 + effect.strength * 0.12;
      node.scale.set(scale, scale * (1.05 + rise * 0.22), scale);
      node.rotation.y = timeSec * (0.28 + effect.strength * 0.2);
    });
    smokePulseRefs.current.forEach((material, index) => {
      const effect = smokeEffects[index];
      if (!material || !effect) {
        return;
      }
      const pulse = 0.55 + Math.max(0, Math.sin(timeSec * 1.4 + effect.phase * Math.PI * 2)) * 0.45;
      material.opacity = Math.min(0.54, 0.18 + pulse * 0.28);
      material.emissiveIntensity = 0.08 + pulse * 0.18;
    });

    fireworkRefs.current.forEach((node, index) => {
      const effect = fireworkEffects[index];
      if (!node || !effect) {
        return;
      }
      const cycle = (timeSec * (0.55 + effect.strength * 0.36) + effect.phase * 1.7) % 1;
      const burst = Math.sin(cycle * Math.PI);
      const radius = 0.38 + burst * (1.3 + effect.strength * 0.35);
      node.scale.set(radius, radius, radius);
      node.position.y = effect.y + Math.max(0, Math.sin(cycle * Math.PI * 2)) * 0.28;
      node.rotation.y = timeSec * (0.7 + effect.strength * 0.35);
    });
    fireworkCoreRefs.current.forEach((material, index) => {
      const effect = fireworkEffects[index];
      if (!material || !effect) {
        return;
      }
      const pulse = 0.66 + Math.max(0, Math.sin(timeSec * 5.2 + effect.phase * Math.PI * 2)) * 0.74;
      material.emissiveIntensity = 0.72 + pulse * 0.9;
      material.opacity = Math.min(0.95, 0.36 + pulse * 0.4);
    });
    fireworkWaveRefs.current.forEach((material, index) => {
      const effect = fireworkEffects[index];
      if (!material || !effect) {
        return;
      }
      const cycle = (timeSec * (0.58 + effect.strength * 0.3) + effect.phase * 1.7) % 1;
      const fade = 1 - cycle;
      material.opacity = Math.max(0.04, fade * 0.65);
      material.emissiveIntensity = 0.2 + fade * 0.7;
    });

    burstRefs.current.forEach((node, index) => {
      const effect = burstEffects[index];
      if (!node || !effect) {
        return;
      }
      const pulse = 0.56 + Math.max(0, Math.sin(timeSec * (2.4 + effect.strength) + effect.phase * 8)) * 0.88;
      node.scale.setScalar(0.75 + pulse * 0.45);
      node.rotation.y = timeSec * (0.9 + effect.strength * 0.45);
      node.position.y = effect.y + Math.sin(timeSec * 1.6 + effect.phase * 6) * 0.06;
    });
    burstCoreRefs.current.forEach((material, index) => {
      const effect = burstEffects[index];
      if (!material || !effect) {
        return;
      }
      const glow = 0.7 + Math.max(0, Math.sin(timeSec * 4.6 + effect.phase * Math.PI * 2)) * 0.75;
      material.emissiveIntensity = 0.46 + glow * 0.9;
      material.opacity = Math.min(0.9, 0.28 + glow * 0.32);
    });
  });

  if (!enabled || trackLayout.points.length < 4) {
    return null;
  }

  return (
    <group>
      <mesh>
        <tubeGeometry
          args={[
            leftCurve,
            Math.max(240, trackLayout.points.length * 2),
            railRadius,
            railSegments,
            true,
          ]}
        />
        <meshStandardMaterial
          color="#f2f7ff"
          emissive={accentColor}
          emissiveIntensity={0.34}
          roughness={0.32}
          metalness={0.78}
        />
      </mesh>
      <mesh>
        <tubeGeometry
          args={[
            rightCurve,
            Math.max(240, trackLayout.points.length * 2),
            railRadius,
            railSegments,
            true,
          ]}
        />
        <meshStandardMaterial
          color="#f2f7ff"
          emissive={accentColor}
          emissiveIntensity={0.34}
          roughness={0.32}
          metalness={0.78}
        />
      </mesh>

      <instancedMesh
        ref={tieMeshRef}
        args={[undefined, undefined, ties.length]}
        castShadow={quality !== 'low'}
      >
        <boxGeometry args={[0.38, 0.07, 0.72]} />
        <meshStandardMaterial
          color="#364f68"
          emissive="#1f3044"
          emissiveIntensity={0.44}
          roughness={0.56}
          metalness={0.22}
        />
      </instancedMesh>

      {trackLayout.supports.map((support, index) => {
        const height = Math.max(0.2, support.railY - support.baseY);
        const beamColor = index % 2 === 0 ? '#8ad6ff' : '#74b6ff';

        return (
          <group key={`${support.path}-${index}`} position={[support.x, support.baseY, support.z]}>
            <mesh position={[0, height * 0.5, 0]} castShadow={quality !== 'low'}>
              <cylinderGeometry args={[0.09, 0.11, height, 10]} />
              <meshStandardMaterial
                color="#e6f2ff"
                emissive={beamColor}
                emissiveIntensity={0.46}
                roughness={0.36}
                metalness={0.72}
              />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <cylinderGeometry args={[0.24, 0.26, 0.06, 12]} />
              <meshStandardMaterial color="#2b4a63" roughness={0.6} metalness={0.18} />
            </mesh>
          </group>
        );
      })}

      {smokeEffects.map((effect, index) => (
        <group
          key={effect.id}
          ref={(node) => {
            smokeRefs.current[index] = node;
          }}
          position={[effect.x, effect.y, effect.z]}
        >
          <mesh castShadow={quality === 'high'}>
            <sphereGeometry args={[0.28, 12, 12]} />
            <meshStandardMaterial
              ref={(material) => {
                smokePulseRefs.current[index] = material;
              }}
              color="#e8f4ff"
              emissive={accentColor}
              emissiveIntensity={0.14}
              transparent
              opacity={0.32}
              depthWrite={false}
              roughness={0.92}
              metalness={0.04}
            />
          </mesh>
          <mesh position={[0.24, 0.18, -0.08]}>
            <sphereGeometry args={[0.18, 10, 10]} />
            <meshStandardMaterial
              color="#d9e6f8"
              transparent
              opacity={0.24}
              depthWrite={false}
              roughness={0.95}
              metalness={0.02}
            />
          </mesh>
          <mesh position={[-0.2, 0.14, 0.12]}>
            <sphereGeometry args={[0.16, 10, 10]} />
            <meshStandardMaterial
              color="#c8d8ea"
              transparent
              opacity={0.22}
              depthWrite={false}
              roughness={0.96}
              metalness={0.02}
            />
          </mesh>
        </group>
      ))}

      {fireworkEffects.map((effect, index) => (
        <group
          key={effect.id}
          ref={(node) => {
            fireworkRefs.current[index] = node;
          }}
          position={[effect.x, effect.y, effect.z]}
        >
          <mesh>
            <sphereGeometry args={[0.14, 10, 10]} />
            <meshStandardMaterial
              ref={(material) => {
                fireworkCoreRefs.current[index] = material;
              }}
              color="#fdf6dd"
              emissive={accentColor}
              emissiveIntensity={1}
              transparent
              opacity={0.76}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.7, 16, 16]} />
            <meshStandardMaterial
              ref={(material) => {
                fireworkWaveRefs.current[index] = material;
              }}
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={0.6}
              transparent
              opacity={0.42}
              depthWrite={false}
              roughness={0.3}
              metalness={0.1}
              wireframe
            />
          </mesh>
          {Array.from({ length: 6 }).map((_, sparkIndex) => {
            const angle = (sparkIndex / 6) * Math.PI * 2;
            return (
              <mesh
                key={`${effect.id}-spark-${sparkIndex}`}
                position={[Math.cos(angle) * 0.95, Math.sin(angle * 1.3) * 0.32, Math.sin(angle) * 0.95]}
              >
                <sphereGeometry args={[0.06, 8, 8]} />
                <meshStandardMaterial
                  color="#ffe8af"
                  emissive={accentColor}
                  emissiveIntensity={0.9}
                  transparent
                  opacity={0.7}
                  depthWrite={false}
                />
              </mesh>
            );
          })}
        </group>
      ))}

      {burstEffects.map((effect, index) => (
        <group
          key={effect.id}
          ref={(node) => {
            burstRefs.current[index] = node;
          }}
          position={[effect.x, effect.y, effect.z]}
        >
          <mesh>
            <octahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial
              ref={(material) => {
                burstCoreRefs.current[index] = material;
              }}
              color="#fff5df"
              emissive={accentColor}
              emissiveIntensity={0.95}
              transparent
              opacity={0.76}
              depthWrite={false}
              roughness={0.26}
              metalness={0.38}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.5, 0.05, 8, 18]} />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={0.66}
              transparent
              opacity={0.44}
              depthWrite={false}
            />
          </mesh>
          {Array.from({ length: 5 }).map((_, rayIndex) => {
            const angle = (rayIndex / 5) * Math.PI * 2;
            return (
              <mesh
                key={`${effect.id}-ray-${rayIndex}`}
                position={[Math.cos(angle) * 0.35, 0, Math.sin(angle) * 0.35]}
                rotation={[0, -angle, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.02, 0.02, 0.45, 8]} />
                <meshStandardMaterial
                  color="#ffe3a8"
                  emissive={accentColor}
                  emissiveIntensity={0.74}
                  transparent
                  opacity={0.62}
                  depthWrite={false}
                />
              </mesh>
            );
          })}
        </group>
      ))}

      {Array.from({ length: carCount }).map((_, index) => (
        <group
          key={`coaster-car-${index}`}
          ref={(node) => {
            trainRefs.current[index] = node;
          }}
        >
          <mesh position={[0, 0.08, 0]} castShadow={quality !== 'low'}>
            <boxGeometry args={[1.12, 0.24, 1.48]} />
            <meshStandardMaterial
              color={index === 0 ? '#ffddb7' : '#d6e6ff'}
              emissive={accentColor}
              emissiveIntensity={index === 0 ? 0.48 : 0.32}
              roughness={0.29}
              metalness={0.62}
            />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[1, 0.1, 1.3]} />
            <meshStandardMaterial color="#1d3048" roughness={0.44} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.28, 0.6]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.28, 0.3, 12]} />
            <meshStandardMaterial
              color={index === 0 ? '#ffcf98' : '#cadffd'}
              emissive={accentColor}
              emissiveIntensity={0.28}
              roughness={0.32}
              metalness={0.54}
            />
          </mesh>
          <mesh position={[0.38, 0.34, -0.08]} castShadow={quality === 'high'}>
            <boxGeometry args={[0.08, 0.2, 0.9]} />
            <meshStandardMaterial color="#20334c" roughness={0.36} metalness={0.52} />
          </mesh>
          <mesh position={[-0.38, 0.34, -0.08]} castShadow={quality === 'high'}>
            <boxGeometry args={[0.08, 0.2, 0.9]} />
            <meshStandardMaterial color="#20334c" roughness={0.36} metalness={0.52} />
          </mesh>
          <mesh position={[0, 0.33, -0.2]}>
            <boxGeometry args={[0.68, 0.08, 0.24]} />
            <meshStandardMaterial color="#2b3a52" roughness={0.64} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.33, 0.16]}>
            <boxGeometry args={[0.68, 0.08, 0.24]} />
            <meshStandardMaterial color="#2b3a52" roughness={0.64} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.43, 0.08]} rotation={[Math.PI / 2.7, 0, 0]}>
            <torusGeometry args={[0.32, 0.03, 10, 20, Math.PI]} />
            <meshStandardMaterial color="#9fc8f7" emissive={accentColor} emissiveIntensity={0.26} />
          </mesh>
          {index === 0 && (
            <>
              <mesh position={[0, 0.27, 0.24]}>
                <boxGeometry args={[0.62, 0.08, 0.18]} />
                <meshStandardMaterial
                  color="#17304a"
                  emissive={accentColor}
                  emissiveIntensity={0.24}
                  roughness={0.42}
                  metalness={0.38}
                />
              </mesh>
              <mesh position={[0.28, 0.43, 0.18]}>
                <boxGeometry args={[0.04, 0.24, 0.04]} />
                <meshStandardMaterial color="#1f3650" roughness={0.36} metalness={0.54} />
              </mesh>
              <mesh position={[-0.28, 0.43, 0.18]}>
                <boxGeometry args={[0.04, 0.24, 0.04]} />
                <meshStandardMaterial color="#1f3650" roughness={0.36} metalness={0.54} />
              </mesh>
              <mesh position={[0, 0.53, 0.22]}>
                <boxGeometry args={[0.62, 0.04, 0.05]} />
                <meshStandardMaterial
                  color="#264363"
                  emissive={accentColor}
                  emissiveIntensity={0.2}
                  roughness={0.35}
                  metalness={0.48}
                />
              </mesh>
              <mesh position={[0, 0.4, 0.21]}>
                <planeGeometry args={[0.5, 0.16]} />
                <meshStandardMaterial
                  color="#8ee9ff"
                  emissive={accentColor}
                  emissiveIntensity={0.28}
                  transparent
                  opacity={0.16}
                />
              </mesh>
            </>
          )}
          <mesh position={[0, 0.34, 0.72]}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshStandardMaterial
              color="#fef7ee"
              emissive="#fff3dd"
              emissiveIntensity={index === 0 ? 1.6 : 0.82}
            />
          </mesh>
          <mesh position={[0, 0.2, -0.72]}>
            <sphereGeometry args={[0.06, 10, 10]} />
            <meshStandardMaterial color="#ffd6da" emissive="#ff7f8f" emissiveIntensity={0.95} />
          </mesh>
          <mesh position={[0.44, 0.03, 0.36]} rotation={[Math.PI / 2, 0, 0]} castShadow={quality === 'high'}>
            <cylinderGeometry args={[0.07, 0.07, 0.22, 10]} />
            <meshStandardMaterial color="#26374d" roughness={0.34} metalness={0.64} />
          </mesh>
          <mesh position={[-0.44, 0.03, 0.36]} rotation={[Math.PI / 2, 0, 0]} castShadow={quality === 'high'}>
            <cylinderGeometry args={[0.07, 0.07, 0.22, 10]} />
            <meshStandardMaterial color="#26374d" roughness={0.34} metalness={0.64} />
          </mesh>
          <mesh position={[0.44, 0.03, -0.36]} rotation={[Math.PI / 2, 0, 0]} castShadow={quality === 'high'}>
            <cylinderGeometry args={[0.07, 0.07, 0.22, 10]} />
            <meshStandardMaterial color="#26374d" roughness={0.34} metalness={0.64} />
          </mesh>
          <mesh position={[-0.44, 0.03, -0.36]} rotation={[Math.PI / 2, 0, 0]} castShadow={quality === 'high'}>
            <cylinderGeometry args={[0.07, 0.07, 0.22, 10]} />
            <meshStandardMaterial color="#26374d" roughness={0.34} metalness={0.64} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
