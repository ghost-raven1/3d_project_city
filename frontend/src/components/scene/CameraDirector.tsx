import { RefObject, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { TourPoint } from './types';

interface CameraDirectorProps {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  selectedPoint: TourPoint | null;
  tourPoints: TourPoint[];
  autoTour: boolean;
}

export function CameraDirector({
  controlsRef,
  selectedPoint,
  tourPoints,
  autoTour,
}: CameraDirectorProps) {
  const { camera, clock } = useThree();
  const targetVector = useMemo(() => new Vector3(), []);
  const cameraVector = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    let focusPoint: TourPoint | null = selectedPoint;

    if (!focusPoint && autoTour && tourPoints.length > 0) {
      const index = Math.floor(clock.getElapsedTime() / 6) % tourPoints.length;
      focusPoint = tourPoints[index];
    }

    if (!focusPoint) {
      return;
    }

    targetVector.set(focusPoint.x, focusPoint.y, focusPoint.z);
    controls.target.lerp(targetVector, 0.06);

    cameraVector.set(
      focusPoint.x + focusPoint.cameraOffset[0],
      focusPoint.y + focusPoint.cameraOffset[1],
      focusPoint.z + focusPoint.cameraOffset[2],
    );

    camera.position.lerp(cameraVector, 0.035);
    controls.update();
  });

  return null;
}
