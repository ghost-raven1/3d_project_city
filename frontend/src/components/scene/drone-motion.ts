import { TourPoint } from './types';

export interface DronePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export function dronePoseAt(
  points: TourPoint[],
  index: number,
  elapsedTime: number,
  speed: number,
): DronePose | null {
  if (points.length === 0) {
    return null;
  }

  const anchor = points[index % points.length];
  if (!anchor) {
    return null;
  }

  const t = elapsedTime * speed + index * 1.2;
  return {
    x: anchor.x + Math.sin(t) * 1.6,
    y: anchor.y + 2.4 + Math.sin(t * 2.4) * 0.45,
    z: anchor.z + Math.cos(t) * 1.6,
    yaw: t + Math.PI / 2,
  };
}
