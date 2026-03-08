import { RefObject, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { dronePoseAt } from './drone-motion';
import {
  BuildingFootprint,
  ImportRoadSegment,
  SceneViewMode,
  TourMode,
  TourPoint,
} from './types';

interface CameraDirectorProps {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  selectedPoint: TourPoint | null;
  tourPoints: TourPoint[];
  roadSegments: ImportRoadSegment[];
  buildingFootprints: BuildingFootprint[];
  mode: SceneViewMode;
  tourMode: TourMode;
  followDroneIndex: number;
  droneSpeed: number;
  autoTour: boolean;
  baseFov: number;
  orbitFocusLerp: number;
  orbitCameraLerp: number;
  autoTourCadenceSec: number;
  onWalkBuildingChange?: (path: string | null) => void;
}

interface RoadLine {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
}

interface OrbitCollisionPosition {
  x: number;
  y: number;
  z: number;
}

function distancePointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lengthSq = vx * vx + vz * vz;
  if (lengthSq < 0.0001) {
    return Math.hypot(px - ax, pz - az);
  }

  const projection = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lengthSq));
  const closestX = ax + vx * projection;
  const closestZ = az + vz * projection;
  return Math.hypot(px - closestX, pz - closestZ);
}

function projectPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number } {
  const vx = bx - ax;
  const vz = bz - az;
  const lengthSq = vx * vx + vz * vz;
  if (lengthSq < 0.0001) {
    return { x: ax, z: az };
  }

  const wx = px - ax;
  const wz = pz - az;
  const projection = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lengthSq));
  return {
    x: ax + vx * projection,
    z: az + vz * projection,
  };
}

function insideFootprint(
  x: number,
  z: number,
  footprint: BuildingFootprint,
  margin: number,
): boolean {
  return (
    x >= footprint.x - footprint.width * 0.5 - margin &&
    x <= footprint.x + footprint.width * 0.5 + margin &&
    z >= footprint.z - footprint.depth * 0.5 - margin &&
    z <= footprint.z + footprint.depth * 0.5 + margin
  );
}

function nearestFootprint(
  x: number,
  z: number,
  buildingFootprints: BuildingFootprint[],
): BuildingFootprint | null {
  let best: BuildingFootprint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  buildingFootprints.forEach((footprint) => {
    const distance = Math.hypot(x - footprint.x, z - footprint.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = footprint;
    }
  });

  return best;
}

function pushOutsideFootprint(
  x: number,
  z: number,
  footprint: BuildingFootprint,
  margin: number,
): { x: number; z: number } {
  const minX = footprint.x - footprint.width * 0.5 - margin;
  const maxX = footprint.x + footprint.width * 0.5 + margin;
  const minZ = footprint.z - footprint.depth * 0.5 - margin;
  const maxZ = footprint.z + footprint.depth * 0.5 + margin;

  const toLeft = Math.abs(x - minX);
  const toRight = Math.abs(maxX - x);
  const toBottom = Math.abs(z - minZ);
  const toTop = Math.abs(maxZ - z);

  if (toLeft <= toRight && toLeft <= toBottom && toLeft <= toTop) {
    return { x: minX, z };
  }
  if (toRight <= toBottom && toRight <= toTop) {
    return { x: maxX, z };
  }
  if (toBottom <= toTop) {
    return { x, z: minZ };
  }
  return { x, z: maxZ };
}

function resolveOrbitCollision(
  focus: Vector3,
  desired: OrbitCollisionPosition,
  buildingFootprints: BuildingFootprint[],
  margin: number,
): OrbitCollisionPosition {
  if (buildingFootprints.length === 0) {
    return desired;
  }

  const segmentMinX = Math.min(focus.x, desired.x) - margin * 2.2;
  const segmentMaxX = Math.max(focus.x, desired.x) + margin * 2.2;
  const segmentMinZ = Math.min(focus.z, desired.z) - margin * 2.2;
  const segmentMaxZ = Math.max(focus.z, desired.z) + margin * 2.2;
  const segmentDx = desired.x - focus.x;
  const segmentDy = desired.y - focus.y;
  const segmentDz = desired.z - focus.z;

  let resolvedX = desired.x;
  let resolvedY = desired.y;
  let resolvedZ = desired.z;
  let collisionTop = Number.NEGATIVE_INFINITY;
  let pushX = 0;
  let pushZ = 0;

  for (let footprintIndex = 0; footprintIndex < buildingFootprints.length; footprintIndex += 1) {
    const footprint = buildingFootprints[footprintIndex];
    if (!footprint) {
      continue;
    }

    const minX = footprint.x - footprint.width * 0.5 - margin;
    const maxX = footprint.x + footprint.width * 0.5 + margin;
    const minZ = footprint.z - footprint.depth * 0.5 - margin;
    const maxZ = footprint.z + footprint.depth * 0.5 + margin;
    if (maxX < segmentMinX || minX > segmentMaxX || maxZ < segmentMinZ || minZ > segmentMaxZ) {
      continue;
    }

    for (let step = 1; step <= 8; step += 1) {
      const t = step / 8;
      const sampleX = focus.x + segmentDx * t;
      const sampleY = focus.y + segmentDy * t;
      const sampleZ = focus.z + segmentDz * t;
      if (!insideFootprint(sampleX, sampleZ, footprint, margin)) {
        continue;
      }
      if (sampleY > footprint.topY + 1.2) {
        continue;
      }

      collisionTop = Math.max(collisionTop, footprint.topY);
      const awayX = sampleX - footprint.x;
      const awayZ = sampleZ - footprint.z;
      const awayLen = Math.hypot(awayX, awayZ);
      if (awayLen > 0.0001) {
        pushX += awayX / awayLen;
        pushZ += awayZ / awayLen;
      } else {
        pushX += segmentDx >= 0 ? 1 : -1;
      }
      break;
    }
  }

  if (collisionTop > Number.NEGATIVE_INFINITY) {
    const pushLen = Math.hypot(pushX, pushZ);
    if (pushLen > 0.0001) {
      const detour = margin * 1.9;
      resolvedX += (pushX / pushLen) * detour;
      resolvedZ += (pushZ / pushLen) * detour;
    }
    resolvedY = Math.max(resolvedY, collisionTop + 1.45);
  }

  for (let pass = 0; pass < 2; pass += 1) {
    for (let footprintIndex = 0; footprintIndex < buildingFootprints.length; footprintIndex += 1) {
      const footprint = buildingFootprints[footprintIndex];
      if (!footprint) {
        continue;
      }

      if (!insideFootprint(resolvedX, resolvedZ, footprint, margin)) {
        continue;
      }
      if (resolvedY > footprint.topY + 1.15) {
        continue;
      }
      const pushed = pushOutsideFootprint(resolvedX, resolvedZ, footprint, margin + 0.1);
      resolvedX = pushed.x;
      resolvedZ = pushed.z;
      resolvedY = Math.max(resolvedY, footprint.topY + 1.35);
    }
  }

  return {
    x: resolvedX,
    y: resolvedY,
    z: resolvedZ,
  };
}

export function CameraDirector({
  controlsRef,
  selectedPoint,
  tourPoints,
  roadSegments,
  buildingFootprints,
  mode,
  tourMode,
  followDroneIndex,
  droneSpeed,
  autoTour,
  baseFov,
  orbitFocusLerp,
  orbitCameraLerp,
  autoTourCadenceSec,
  onWalkBuildingChange,
}: CameraDirectorProps) {
  const { camera, clock, gl } = useThree();
  const targetVector = useMemo(() => new Vector3(), []);
  const cameraVector = useMemo(() => new Vector3(), []);
  const modeRef = useRef<TourMode>(tourMode);
  const walkPositionRef = useRef(new Vector3(0, 1.72, 0));
  const walkYawRef = useRef(0);
  const walkPitchRef = useRef(-0.03);
  const pointerLockedRef = useRef(false);
  const keyStateRef = useRef<Record<string, boolean>>({});
  const enterRequestedRef = useRef(false);
  const exitRequestedRef = useRef(false);
  const currentBuildingRef = useRef<string | null>(null);
  const lastDronePositionRef = useRef(new Vector3(0, 1.8, 0));
  const orbitYawRef = useRef(0);
  const orbitRadiusRef = useRef(11);
  const orbitHeightRef = useRef(5.4);

  const roadLines = useMemo<RoadLine[]>(() => {
    return roadSegments.flatMap((segment) => {
      const lines: RoadLine[] = [];
      for (let index = 0; index < segment.points.length - 1; index += 1) {
        const from = segment.points[index];
        const to = segment.points[index + 1];
        if (!from || !to) {
          continue;
        }

        lines.push({
          x1: from.x,
          z1: from.z,
          x2: to.x,
          z2: to.z,
          width: segment.width,
        });
      }
      return lines;
    });
  }, [roadSegments]);

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
      keyStateRef.current[key] = true;
      if (key === 'e') {
        enterRequestedRef.current = true;
      }
      if (key === 'q' || key === 'escape') {
        exitRequestedRef.current = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keyStateRef.current[event.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerLockChange = () => {
      pointerLockedRef.current = document.pointerLockElement === canvas;
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || modeRef.current !== 'walk') {
        return;
      }

      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!pointerLockedRef.current || modeRef.current !== 'walk') {
        return;
      }

      walkYawRef.current -= event.movementX * 0.0022;
      walkPitchRef.current = Math.max(
        -0.55,
        Math.min(0.55, walkPitchRef.current - event.movementY * 0.0017),
      );
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [gl.domElement]);

  const projectToNearestRoad = (x: number, z: number): { x: number; z: number } => {
    if (roadLines.length === 0) {
      return { x, z };
    }

    let bestDistance = Number.POSITIVE_INFINITY;
    let bestPoint = { x, z };
    roadLines.forEach((line) => {
      const candidate = projectPointOnSegment(
        x,
        z,
        line.x1,
        line.z1,
        line.x2,
        line.z2,
      );
      const distance = Math.hypot(x - candidate.x, z - candidate.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint = candidate;
      }
    });

    return bestPoint;
  };

  const isOnRoad = (x: number, z: number): boolean => {
    if (roadLines.length === 0) {
      return true;
    }

    return roadLines.some((line) => {
      const threshold = Math.max(0.28, line.width * 1.85);
      return (
        distancePointToSegment(x, z, line.x1, line.z1, line.x2, line.z2) <= threshold
      );
    });
  };

  const updateBuildingState = (path: string | null) => {
    if (currentBuildingRef.current === path) {
      return;
    }

    currentBuildingRef.current = path;
    onWalkBuildingChange?.(path);
  };

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    if ('fov' in camera) {
      const perspectiveCamera = camera as typeof camera & {
        fov: number;
        updateProjectionMatrix: () => void;
      };
      const targetFov =
        tourMode === 'walk'
          ? Math.max(58, baseFov + 7)
          : tourMode === 'drone'
            ? Math.max(50, baseFov + 4)
            : baseFov;
      const blend = 1 - Math.exp(-delta * 4.6);
      perspectiveCamera.fov += (targetFov - perspectiveCamera.fov) * blend;
      perspectiveCamera.updateProjectionMatrix();
    }

    if (modeRef.current !== tourMode) {
      if (tourMode === 'walk') {
        const fallback = tourPoints[0];
        const baseX = selectedPoint?.x ?? fallback?.x ?? lastDronePositionRef.current.x;
        const baseZ = selectedPoint?.z ?? fallback?.z ?? lastDronePositionRef.current.z;
        const spawn = projectToNearestRoad(
          baseX,
          baseZ,
        );
        walkPositionRef.current.set(spawn.x, 1.72, spawn.z);
        walkYawRef.current = controls.getAzimuthalAngle();
        walkPitchRef.current = -0.03;
      } else {
        if (document.pointerLockElement === gl.domElement) {
          document.exitPointerLock();
        }
        updateBuildingState(null);
        if (tourMode === 'orbit') {
          const dx = camera.position.x - controls.target.x;
          const dz = camera.position.z - controls.target.z;
          orbitYawRef.current = Math.atan2(dz, dx);
          orbitRadiusRef.current = Math.max(5.8, Math.hypot(dx, dz));
          orbitHeightRef.current = Math.max(2.8, camera.position.y - controls.target.y);
        }
      }

      modeRef.current = tourMode;
    }

    if (tourMode === 'drone') {
      if (tourPoints.length === 0) {
        return;
      }

      const droneIndex = Math.max(0, Math.min(tourPoints.length - 1, followDroneIndex));
      const pose = dronePoseAt(
        tourPoints,
        droneIndex,
        clock.getElapsedTime(),
        droneSpeed,
      );
      if (!pose) {
        return;
      }

      lastDronePositionRef.current.set(pose.x, pose.y, pose.z);

      const forwardX = Math.sin(pose.yaw - Math.PI / 2);
      const forwardZ = Math.cos(pose.yaw - Math.PI / 2);
      targetVector.set(
        pose.x + forwardX * 4.5,
        Math.max(1.25, pose.y - 0.3),
        pose.z + forwardZ * 4.5,
      );
      controls.target.lerp(
        targetVector,
        Math.min(0.26, orbitFocusLerp * (mode === 'risk' ? 2.5 : 2.3)),
      );

      cameraVector.set(
        pose.x - forwardX * 2.6,
        pose.y + 0.95,
        pose.z - forwardZ * 2.6,
      );
      camera.position.lerp(
        cameraVector,
        Math.min(0.28, orbitCameraLerp * (mode === 'risk' ? 4.7 : 4.2)),
      );
      controls.update();
      return;
    }

    if (tourMode === 'walk') {
      const keys = keyStateRef.current;
      const turnLeft = keys['arrowleft'] ? 1 : 0;
      const turnRight = keys['arrowright'] ? 1 : 0;
      walkYawRef.current += (turnRight - turnLeft) * delta * 1.8;

      const forwardAxis =
        (keys['w'] || keys['arrowup'] ? 1 : 0) -
        (keys['s'] || keys['arrowdown'] ? 1 : 0);
      const strafeAxis = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
      const movingInput = Math.abs(forwardAxis) + Math.abs(strafeAxis) > 0;
      const speed = keys['shift'] ? 4.2 : 2.8;
      const sin = Math.sin(walkYawRef.current);
      const cos = Math.cos(walkYawRef.current);
      const nextX =
        walkPositionRef.current.x +
        (cos * forwardAxis + sin * strafeAxis) * speed * delta;
      const nextZ =
        walkPositionRef.current.z +
        (sin * forwardAxis - cos * strafeAxis) * speed * delta;

      const insideBuildingPath = currentBuildingRef.current;
      const insideBuilding = insideBuildingPath
        ? buildingFootprints.find((item) => item.path === insideBuildingPath) ?? null
        : null;

      if (exitRequestedRef.current) {
        exitRequestedRef.current = false;
        if (insideBuilding) {
          const projected = projectToNearestRoad(
            insideBuilding.x + insideBuilding.width * 0.52,
            insideBuilding.z,
          );
          walkPositionRef.current.x = projected.x;
          walkPositionRef.current.z = projected.z;
          updateBuildingState(null);
        }
      }

      if (enterRequestedRef.current) {
        enterRequestedRef.current = false;
        if (!insideBuilding) {
          const candidate = nearestFootprint(
            walkPositionRef.current.x,
            walkPositionRef.current.z,
            buildingFootprints,
          );
          if (candidate) {
            const threshold =
              Math.max(candidate.width, candidate.depth) * 0.55 + 1.2;
            if (
              Math.hypot(
                walkPositionRef.current.x - candidate.x,
                walkPositionRef.current.z - candidate.z,
              ) <= threshold
            ) {
              walkPositionRef.current.x = candidate.x;
              walkPositionRef.current.z = candidate.z;
              updateBuildingState(candidate.path);
            }
          }
        }
      }

      if (insideBuilding) {
        const margin = 0.5;
        walkPositionRef.current.x = Math.max(
          insideBuilding.x - insideBuilding.width * 0.5 + margin,
          Math.min(insideBuilding.x + insideBuilding.width * 0.5 - margin, nextX),
        );
        walkPositionRef.current.z = Math.max(
          insideBuilding.z - insideBuilding.depth * 0.5 + margin,
          Math.min(insideBuilding.z + insideBuilding.depth * 0.5 - margin, nextZ),
        );
      } else {
        const canOccupy = (x: number, z: number) => {
          const collidesBuilding = buildingFootprints.some((footprint) =>
            insideFootprint(x, z, footprint, 0.35),
          );
          return !collidesBuilding && isOnRoad(x, z);
        };

        if (canOccupy(nextX, nextZ)) {
          walkPositionRef.current.x = nextX;
          walkPositionRef.current.z = nextZ;
        } else {
          let moved = false;
          if (canOccupy(nextX, walkPositionRef.current.z)) {
            walkPositionRef.current.x = nextX;
            moved = true;
          }
          if (canOccupy(walkPositionRef.current.x, nextZ)) {
            walkPositionRef.current.z = nextZ;
            moved = true;
          }

          if (!moved && movingInput) {
            const projected = projectToNearestRoad(nextX, nextZ);
            if (canOccupy(projected.x, projected.z)) {
              walkPositionRef.current.x = projected.x;
              walkPositionRef.current.z = projected.z;
            }
          }
        }
      }

      const bob = movingInput ? Math.sin(clock.getElapsedTime() * 8.2) * 0.025 : 0;
      const walkY = insideBuilding ? 1.52 : 1.72;
      const lookDistance = 3;
      const lookCos = Math.cos(walkPitchRef.current);

      cameraVector.set(
        walkPositionRef.current.x,
        walkY + bob,
        walkPositionRef.current.z,
      );
      camera.position.lerp(cameraVector, 0.36);
      targetVector.set(
        walkPositionRef.current.x + Math.cos(walkYawRef.current) * lookCos * lookDistance,
        walkY + 0.04 + Math.sin(walkPitchRef.current) * lookDistance * 0.78,
        walkPositionRef.current.z + Math.sin(walkYawRef.current) * lookCos * lookDistance,
      );
      controls.target.lerp(targetVector, 0.42);
      controls.update();
      return;
    }

    let focusPoint: TourPoint | null = selectedPoint;

    if (!focusPoint && autoTour && tourPoints.length > 0) {
      const index =
        Math.floor(
          clock.getElapsedTime() / Math.max(2.4, autoTourCadenceSec),
        ) % tourPoints.length;
      focusPoint = tourPoints[index];
    }

    if (!focusPoint) {
      return;
    }

    lastDronePositionRef.current.set(focusPoint.x, focusPoint.y, focusPoint.z);

    targetVector.set(focusPoint.x, focusPoint.y, focusPoint.z);
    const orbitFocus = selectedPoint
      ? Math.min(0.14, orbitFocusLerp * 1.5)
      : orbitFocusLerp;
    controls.target.lerp(targetVector, orbitFocus);
    const manualOrbit = !autoTour && !selectedPoint;

    if (manualOrbit) {
      controls.update();
      const safeManualPosition = resolveOrbitCollision(
        controls.target,
        {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
        buildingFootprints,
        0.55,
      );
      camera.position.lerp(
        cameraVector.set(
          safeManualPosition.x,
          safeManualPosition.y,
          safeManualPosition.z,
        ),
        0.52,
      );
      controls.update();
      return;
    }

    const elapsed = clock.getElapsedTime();
    const orbitSpeed =
      selectedPoint
        ? 0.46
        : mode === 'risk'
          ? 0.64
          : mode === 'architecture'
            ? 0.58
            : mode === 'stack'
              ? 0.42
              : 0.5;
    const yawSway = Math.sin(elapsed * 0.27 + followDroneIndex * 0.73) * 0.085;
    orbitYawRef.current += delta * (orbitSpeed + yawSway);

    const baseOffsetRadius = Math.hypot(
      focusPoint.cameraOffset[0],
      focusPoint.cameraOffset[2],
    );
    const targetRadius = selectedPoint
      ? Math.max(5.8, Math.min(11.4, baseOffsetRadius))
      : Math.max(8.5, Math.min(17.5, baseOffsetRadius + 2.6));
    const targetHeight = selectedPoint
      ? Math.max(3.1, focusPoint.cameraOffset[1] * 0.72)
      : Math.max(4.2, focusPoint.cameraOffset[1] * 0.88);
    const orbitBlend = 1 - Math.exp(-delta * 2.6);
    orbitRadiusRef.current += (targetRadius - orbitRadiusRef.current) * orbitBlend;
    orbitHeightRef.current += (targetHeight - orbitHeightRef.current) * orbitBlend;

    const bob = Math.sin(elapsed * 1.35) * 0.24 + Math.sin(elapsed * 0.44 + 0.8) * 0.16;
    const desiredOrbit = {
      x: controls.target.x + Math.cos(orbitYawRef.current) * orbitRadiusRef.current,
      y: controls.target.y + orbitHeightRef.current + bob,
      z: controls.target.z + Math.sin(orbitYawRef.current) * orbitRadiusRef.current,
    };
    const safeOrbit = resolveOrbitCollision(
      controls.target,
      desiredOrbit,
      buildingFootprints,
      0.52,
    );
    cameraVector.set(safeOrbit.x, safeOrbit.y, safeOrbit.z);

    const orbitCamera = selectedPoint
      ? Math.min(0.15, orbitCameraLerp * 2.2)
      : Math.min(0.12, orbitCameraLerp * 1.95);
    camera.position.lerp(cameraVector, orbitCamera);
    controls.update();
  });

  return null;
}
