import { ImportRoad, PositionedFileHistory } from '../types/repository';
import { CityDNA } from './city-dna';
import { buildNaturalRoadPath, hashRoadSeed } from './road-layout';
import { ImportRoadSegment } from '../components/scene/types';

interface CityCenter {
  centerX: number;
  centerZ: number;
  size: number;
}

function topLevelFolder(path: string): string {
  if (!path || path === 'root') {
    return 'root';
  }

  const normalized = path.replace(/^\/+|\/+$/g, '');
  if (!normalized) {
    return 'root';
  }

  return normalized.split('/')[0] ?? 'root';
}

function roadLabel(
  fromPath: string,
  toPath: string,
  tier: 'highway' | 'arterial' | 'local',
): string {
  const fromTop = topLevelFolder(fromPath);
  const toTop = topLevelFolder(toPath);
  const fromName = fromTop === 'root' ? 'root' : fromTop;
  const toName = toTop === 'root' ? 'root' : toTop;

  if (tier === 'highway') {
    return `${fromName} ↔ ${toName}`;
  }

  if (fromName === toName) {
    return fromName;
  }

  return `${fromName} → ${toName}`;
}

function quantize(value: number, step: number): number {
  return Math.round(value / step);
}

function bundleImportRoads(
  imports: ImportRoad[],
  fileMap: Map<string, PositionedFileHistory>,
): ImportRoad[] {
  const bundles = new Map<
    string,
    { from: string; to: string; count: number; representativeScore: number }
  >();
  const quantStep = 6;

  imports.forEach((road) => {
    const from = fileMap.get(road.from);
    const to = fileMap.get(road.to);
    if (!from || !to) {
      return;
    }

    const fromTop = topLevelFolder(from.folder);
    const toTop = topLevelFolder(to.folder);
    const key = [
      fromTop,
      toTop,
      quantize(from.x, quantStep),
      quantize(from.z, quantStep),
      quantize(to.x, quantStep),
      quantize(to.z, quantStep),
    ].join(':');
    const score =
      road.count +
      Math.hypot(to.x - from.x, to.z - from.z) * 0.02 +
      (fromTop === toTop ? 0.15 : 0.3);
    const existing = bundles.get(key);
    if (!existing) {
      bundles.set(key, {
        from: road.from,
        to: road.to,
        count: road.count,
        representativeScore: score,
      });
      return;
    }

    existing.count += road.count;
    if (score > existing.representativeScore) {
      existing.from = road.from;
      existing.to = road.to;
      existing.representativeScore = score;
    }
  });

  return Array.from(bundles.values())
    .sort((a, b) => b.count - a.count)
    .map((item) => ({
      from: item.from,
      to: item.to,
      count: item.count,
    }))
    .slice(0, 700);
}

export function buildRoadSegments(
  sceneFiles: PositionedFileHistory[],
  imports: ImportRoad[],
  dna: CityDNA | null,
  cityBounds: CityCenter,
  edgeSignals?: Map<string, { violation: number; cycle: number }>,
): ImportRoadSegment[] {
  const fileMap = new Map(sceneFiles.map((file) => [file.path, file]));
  const bundledImports = bundleImportRoads(imports, fileMap);
  const maxCount = Math.max(1, ...bundledImports.map((road) => road.count));
  const layout = dna?.layout ?? 'grid';
  const seed = dna?.seed ?? 42;

  const rawSegments = bundledImports
    .slice(0, 760)
    .map((road) => {
      const from = fileMap.get(road.from);
      const to = fileMap.get(road.to);

      if (!from || !to) {
        return null;
      }

      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const length = Math.hypot(dx, dz);
      if (length < 1.2) {
        return null;
      }

      const dirX = dx / length;
      const dirZ = dz / length;
      const leaveOffset = Math.min(1.8, 0.35 + Math.max(from.width, from.depth) * 0.44);
      const arriveOffset = Math.min(1.8, 0.35 + Math.max(to.width, to.depth) * 0.44);
      const start = {
        x: from.x + dirX * leaveOffset,
        z: from.z + dirZ * leaveOffset,
      };
      const end = {
        x: to.x - dirX * arriveOffset,
        z: to.z - dirZ * arriveOffset,
      };

      const roadSeed = hashRoadSeed(`${road.from}|${road.to}|${seed}`);
      const points = buildNaturalRoadPath(
        start,
        end,
        roadSeed,
        layout,
        { x: cityBounds.centerX, z: cityBounds.centerZ },
        dna?.roadCurvature ?? 1,
      );
      if (points.length < 2) {
        return null;
      }

      const first = points[0] ?? start;
      const second = points[1] ?? end;
      const last = points[points.length - 1] ?? end;
      const previewDx = second.x - first.x;
      const previewDz = second.z - first.z;

      const weight = road.count / maxCount;
      const sameFolder = from.folder === to.folder;
      const sameTopLevel = topLevelFolder(from.folder) === topLevelFolder(to.folder);
      const crossCityDistance = length / Math.max(1, cityBounds.size);

      let tier: 'highway' | 'arterial' | 'local' = 'local';
      if (weight >= 0.52 || road.count >= Math.max(3, Math.floor(maxCount * 0.68))) {
        tier = 'highway';
      } else if (weight >= 0.22 || sameTopLevel) {
        tier = 'arterial';
      }

      if (
        tier === 'local' &&
        !sameFolder &&
        (!sameTopLevel || crossCityDistance > 0.33)
      ) {
        const visibilityHash = hashRoadSeed(`${road.from}|${road.to}|${seed}|local`);
        if (visibilityHash % 4 !== 0) {
          return null;
        }
      }

      const width =
        tier === 'highway'
          ? 0.26 + weight * 0.5
          : tier === 'arterial'
            ? 0.16 + weight * 0.32
            : 0.1 + weight * 0.22;
      const glowWidth =
        tier === 'highway'
          ? 0.08 + weight * 0.16
          : tier === 'arterial'
            ? 0.05 + weight * 0.1
            : 0.03 + weight * 0.06;
      const glowOpacity =
        tier === 'highway'
          ? 0.24 + weight * 0.3
          : tier === 'arterial'
            ? 0.14 + weight * 0.22
            : 0.08 + weight * 0.16;
      const edgeSignal = edgeSignals?.get(`${road.from}=>${road.to}`);
      const violationScore = Math.min(
        1,
        (edgeSignal?.violation ?? 0) / Math.max(1, road.count),
      );
      const cycleScore = Math.min(
        1,
        (edgeSignal?.cycle ?? 0) / Math.max(1, road.count),
      );

      return {
        id: `${road.from}-${road.to}`,
        label: roadLabel(from.path, to.path, tier),
        tier,
        points,
        trafficBias:
          weight *
          (tier === 'highway' ? 1.55 : tier === 'arterial' ? 1.18 : 0.82) *
          (0.9 + (roadSeed % 9) * 0.04),
        x: (first.x + last.x) / 2,
        z: (first.z + last.z) / 2,
        length,
        angle: Math.atan2(previewDz, previewDx),
        width,
        glowWidth,
        glowOpacity,
        fromX: first.x,
        fromZ: first.z,
        toX: last.x,
        toZ: last.z,
        violationScore,
        cycleScore,
      };
    })
    .filter((segment): segment is ImportRoadSegment => segment !== null);

  const byTier = {
    highway: rawSegments
      .filter((segment) => segment.tier === 'highway')
      .sort((a, b) => b.trafficBias - a.trafficBias)
      .slice(0, 90),
    arterial: rawSegments
      .filter((segment) => segment.tier === 'arterial')
      .sort((a, b) => b.trafficBias - a.trafficBias)
      .slice(0, 220),
    local: rawSegments
      .filter((segment) => segment.tier === 'local')
      .sort((a, b) => b.trafficBias - a.trafficBias)
      .slice(0, 180),
  };

  return [...byTier.highway, ...byTier.arterial, ...byTier.local];
}
