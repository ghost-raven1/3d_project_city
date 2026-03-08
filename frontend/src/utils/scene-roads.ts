import { ImportRoad, PositionedFileHistory } from '../types/repository';
import { CityDNA } from './city-dna';
import { buildNaturalRoadPath, hashRoadSeed } from './road-layout';
import { ImportRoadSegment } from '../components/scene/types';

interface CityCenter {
  centerX: number;
  centerZ: number;
  size: number;
}

interface BundledRoad {
  from: string;
  to: string;
  count: number;
}

type RoadTier = 'highway' | 'arterial' | 'local';

interface RoadStyle {
  width: number;
  glowWidth: number;
  glowOpacity: number;
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

function styleByTier(tier: RoadTier): RoadStyle {
  if (tier === 'highway') {
    return {
      width: 0.24,
      glowWidth: 0.085,
      glowOpacity: 0.3,
    };
  }

  if (tier === 'arterial') {
    return {
      width: 0.18,
      glowWidth: 0.06,
      glowOpacity: 0.22,
    };
  }

  return {
    width: 0.12,
    glowWidth: 0.04,
    glowOpacity: 0.14,
  };
}

function pointAt(
  centerX: number,
  centerZ: number,
  radius: number,
  angle: number,
): { x: number; z: number } {
  return {
    x: centerX + Math.cos(angle) * radius,
    z: centerZ + Math.sin(angle) * radius,
  };
}

function createRoadSegmentFromPoints(
  id: string,
  label: string,
  points: Array<{ x: number; z: number }>,
  tier: RoadTier,
  trafficBias: number,
): ImportRoadSegment | null {
  if (points.length < 2) {
    return null;
  }

  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) {
      continue;
    }
    length += Math.hypot(to.x - from.x, to.z - from.z);
  }

  if (length <= 0.2) {
    return null;
  }

  const first = points[0];
  const second = points[1] ?? first;
  const last = points[points.length - 1] ?? first;
  const previewDx = second.x - first.x;
  const previewDz = second.z - first.z;
  const style = styleByTier(tier);

  return {
    id,
    label,
    tier,
    points,
    trafficBias,
    x: (first.x + last.x) / 2,
    z: (first.z + last.z) / 2,
    length,
    angle: Math.atan2(previewDz, previewDx),
    width: style.width,
    glowWidth: style.glowWidth,
    glowOpacity: style.glowOpacity,
    fromX: first.x,
    fromZ: first.z,
    toX: last.x,
    toZ: last.z,
    violationScore: 0,
    cycleScore: 0,
  };
}

function buildScaffoldRoads(
  cityBounds: CityCenter,
  layout: CityDNA['layout'],
  dna: CityDNA | null,
  seed: number,
): ImportRoadSegment[] {
  const centerX = cityBounds.centerX;
  const centerZ = cityBounds.centerZ;
  const outerRadius = Math.max(12, cityBounds.size * 0.42);
  const innerRadius = outerRadius * 0.62;
  const ringOffset = ((seed % 360) * Math.PI) / 180;
  const ringCount = layout === 'radial' ? 12 : layout === 'islands' ? 10 : 8;
  const roadCurvature = (dna?.roadCurvature ?? 1) * 0.92;

  const connectors: Array<{
    id: string;
    label: string;
    tier: RoadTier;
    bias: number;
    start: { x: number; z: number };
    end: { x: number; z: number };
  }> = [
    {
      id: 'scaffold-spine-ew',
      label: 'Core Spine E-W',
      tier: 'highway',
      bias: 1.2,
      start: { x: centerX - outerRadius, z: centerZ },
      end: { x: centerX + outerRadius, z: centerZ },
    },
    {
      id: 'scaffold-spine-ns',
      label: 'Core Spine N-S',
      tier: 'highway',
      bias: 1.18,
      start: { x: centerX, z: centerZ - outerRadius },
      end: { x: centerX, z: centerZ + outerRadius },
    },
  ];

  if (layout === 'grid') {
    const laneShift = outerRadius * 0.36;
    connectors.push(
      {
        id: 'scaffold-grid-east',
        label: 'District Lane East',
        tier: 'arterial',
        bias: 0.92,
        start: { x: centerX + laneShift, z: centerZ - outerRadius * 0.88 },
        end: { x: centerX + laneShift, z: centerZ + outerRadius * 0.88 },
      },
      {
        id: 'scaffold-grid-west',
        label: 'District Lane West',
        tier: 'arterial',
        bias: 0.92,
        start: { x: centerX - laneShift, z: centerZ - outerRadius * 0.88 },
        end: { x: centerX - laneShift, z: centerZ + outerRadius * 0.88 },
      },
      {
        id: 'scaffold-grid-north',
        label: 'District Lane North',
        tier: 'arterial',
        bias: 0.88,
        start: { x: centerX - outerRadius * 0.9, z: centerZ - laneShift },
        end: { x: centerX + outerRadius * 0.9, z: centerZ - laneShift },
      },
      {
        id: 'scaffold-grid-south',
        label: 'District Lane South',
        tier: 'arterial',
        bias: 0.88,
        start: { x: centerX - outerRadius * 0.9, z: centerZ + laneShift },
        end: { x: centerX + outerRadius * 0.9, z: centerZ + laneShift },
      },
    );
  } else if (layout === 'radial') {
    const diagonalRadius = outerRadius * 0.88;
    connectors.push(
      {
        id: 'scaffold-radial-ne-sw',
        label: 'Orbit Link NE-SW',
        tier: 'arterial',
        bias: 0.96,
        start: pointAt(centerX, centerZ, diagonalRadius, ringOffset + Math.PI * 0.25),
        end: pointAt(centerX, centerZ, diagonalRadius, ringOffset + Math.PI * 1.25),
      },
      {
        id: 'scaffold-radial-nw-se',
        label: 'Orbit Link NW-SE',
        tier: 'arterial',
        bias: 0.96,
        start: pointAt(centerX, centerZ, diagonalRadius, ringOffset + Math.PI * 0.75),
        end: pointAt(centerX, centerZ, diagonalRadius, ringOffset + Math.PI * 1.75),
      },
    );
  } else if (layout === 'ribbon') {
    const ribbonShift = outerRadius * 0.32;
    connectors.push(
      {
        id: 'scaffold-ribbon-upper',
        label: 'Ribbon Upper',
        tier: 'arterial',
        bias: 0.9,
        start: { x: centerX - outerRadius, z: centerZ - ribbonShift },
        end: { x: centerX + outerRadius, z: centerZ + ribbonShift * 0.6 },
      },
      {
        id: 'scaffold-ribbon-lower',
        label: 'Ribbon Lower',
        tier: 'arterial',
        bias: 0.86,
        start: { x: centerX - outerRadius, z: centerZ + ribbonShift * 0.9 },
        end: { x: centerX + outerRadius, z: centerZ - ribbonShift * 0.5 },
      },
    );
  } else {
    const islandRadiusA = outerRadius * 0.62;
    const islandRadiusB = outerRadius * 0.78;
    connectors.push(
      {
        id: 'scaffold-island-link-a',
        label: 'Harbor Link A',
        tier: 'arterial',
        bias: 0.92,
        start: pointAt(centerX, centerZ, islandRadiusA, ringOffset + Math.PI * 0.1),
        end: pointAt(centerX, centerZ, islandRadiusB, ringOffset + Math.PI * 1.02),
      },
      {
        id: 'scaffold-island-link-b',
        label: 'Harbor Link B',
        tier: 'arterial',
        bias: 0.92,
        start: pointAt(centerX, centerZ, islandRadiusA, ringOffset + Math.PI * 0.66),
        end: pointAt(centerX, centerZ, islandRadiusB, ringOffset + Math.PI * 1.58),
      },
      {
        id: 'scaffold-island-link-c',
        label: 'Harbor Link C',
        tier: 'arterial',
        bias: 0.9,
        start: pointAt(centerX, centerZ, islandRadiusA, ringOffset + Math.PI * 1.22),
        end: pointAt(centerX, centerZ, islandRadiusB, ringOffset + Math.PI * 0.22),
      },
    );
  }

  const scaffoldRoads = connectors
    .map((road, index) => {
      const roadSeed = hashRoadSeed(`${road.id}:${seed}:${index}`);
      const points = buildNaturalRoadPath(
        road.start,
        road.end,
        roadSeed,
        layout,
        { x: centerX, z: centerZ },
        roadCurvature,
      );
      return createRoadSegmentFromPoints(
        road.id,
        road.label,
        points.length >= 2 ? points : [road.start, road.end],
        road.tier,
        road.bias * (0.9 + (roadSeed % 9) * 0.03),
      );
    })
    .filter((segment): segment is ImportRoadSegment => segment !== null);

  for (let index = 0; index < ringCount; index += 1) {
    const angleA = ringOffset + (index / ringCount) * Math.PI * 2;
    const angleB = ringOffset + ((index + 1) / ringCount) * Math.PI * 2;
    const radiusA = innerRadius * (0.95 + (index % 2) * 0.08);
    const radiusB = innerRadius * (0.95 + ((index + 1) % 2) * 0.08);
    const from = pointAt(centerX, centerZ, radiusA, angleA);
    const to = pointAt(centerX, centerZ, radiusB, angleB);
    const ringTier: RoadTier =
      layout === 'grid' && index % 2 === 0 ? 'local' : 'arterial';
    const ringRoad = createRoadSegmentFromPoints(
      `scaffold-ring-${index}`,
      `Orbit Ring ${index + 1}`,
      [from, to],
      ringTier,
      ringTier === 'arterial' ? 0.78 : 0.62,
    );
    if (ringRoad) {
      scaffoldRoads.push(ringRoad);
    }
  }

  return scaffoldRoads.slice(0, 42);
}

function bundleImportRoads(
  imports: ImportRoad[],
  fileMap: Map<string, PositionedFileHistory>,
): BundledRoad[] {
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

function createSegmentFromRoad(
  road: BundledRoad,
  fileMap: Map<string, PositionedFileHistory>,
  maxCount: number,
  layout: CityDNA['layout'],
  cityBounds: CityCenter,
  dna: CityDNA | null,
  seed: number,
  edgeSignals: Map<string, { violation: number; cycle: number }> | undefined,
  options: {
    minLength: number;
    allowLocalCull: boolean;
  },
): ImportRoadSegment | null {
  const from = fileMap.get(road.from);
  const to = fileMap.get(road.to);

  if (!from || !to) {
    return null;
  }

  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < options.minLength) {
    return null;
  }

  const dirX = dx / Math.max(0.0001, length);
  const dirZ = dz / Math.max(0.0001, length);
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

  const weight = road.count / Math.max(1, maxCount);
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
    options.allowLocalCull &&
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
}

function buildFallbackRoads(
  sceneFiles: PositionedFileHistory[],
  cityBounds: CityCenter,
  layout: CityDNA['layout'],
  dna: CityDNA | null,
  seed: number,
): ImportRoadSegment[] {
  if (sceneFiles.length < 2) {
    return [];
  }

  const candidates = [...sceneFiles]
    .sort(
      (a, b) =>
        b.totalChanges - a.totalChanges || b.commits.length - a.commits.length,
    )
    .slice(0, 140);
  const links = new Map<
    string,
    {
      from: PositionedFileHistory;
      to: PositionedFileHistory;
      distance: number;
    }
  >();

  for (let index = 0; index < candidates.length; index += 1) {
    const file = candidates[index];
    if (!file) {
      continue;
    }

    let best: { file: PositionedFileHistory; distance: number } | null = null;
    for (let inner = 0; inner < candidates.length; inner += 1) {
      if (inner === index) {
        continue;
      }
      const target = candidates[inner];
      if (!target) {
        continue;
      }

      const distance = Math.hypot(target.x - file.x, target.z - file.z);
      if (distance < 1 || distance > cityBounds.size * 0.86) {
        continue;
      }

      const folderBias =
        topLevelFolder(file.folder) === topLevelFolder(target.folder) ? 0.9 : 1.05;
      const score = distance * folderBias;
      if (!best || score < best.distance) {
        best = { file: target, distance };
      }
    }

    if (!best) {
      continue;
    }

    const [a, b] =
      file.path < best.file.path ? [file.path, best.file.path] : [best.file.path, file.path];
    const key = `${a}|${b}`;
    if (!links.has(key)) {
      links.set(key, {
        from: file,
        to: best.file,
        distance: best.distance,
      });
    }
  }

  return Array.from(links.values())
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 220)
    .map((link, index) => {
      const dx = link.to.x - link.from.x;
      const dz = link.to.z - link.from.z;
      const length = Math.hypot(dx, dz);
      const dirX = dx / Math.max(0.0001, length);
      const dirZ = dz / Math.max(0.0001, length);
      const leaveOffset = Math.min(
        1.7,
        0.32 + Math.max(link.from.width, link.from.depth) * 0.4,
      );
      const arriveOffset = Math.min(
        1.7,
        0.32 + Math.max(link.to.width, link.to.depth) * 0.4,
      );
      const start = {
        x: link.from.x + dirX * leaveOffset,
        z: link.from.z + dirZ * leaveOffset,
      };
      const end = {
        x: link.to.x - dirX * arriveOffset,
        z: link.to.z - dirZ * arriveOffset,
      };
      const roadSeed = hashRoadSeed(`fallback:${link.from.path}:${link.to.path}:${seed}:${index}`);
      const points = buildNaturalRoadPath(
        start,
        end,
        roadSeed,
        layout,
        { x: cityBounds.centerX, z: cityBounds.centerZ },
        dna?.roadCurvature ?? 1,
      );
      const first = points[0] ?? start;
      const second = points[1] ?? end;
      const last = points[points.length - 1] ?? end;
      const previewDx = second.x - first.x;
      const previewDz = second.z - first.z;
      const tier: 'highway' | 'arterial' | 'local' =
        link.distance > cityBounds.size * 0.38 ? 'arterial' : 'local';
      const weight = tier === 'arterial' ? 0.58 : 0.42;

      return {
        id: `fallback-${link.from.path}-${link.to.path}`,
        label: roadLabel(link.from.path, link.to.path, tier),
        tier,
        points,
        trafficBias:
          weight *
          (tier === 'arterial' ? 1.12 : 0.84) *
          (0.88 + (roadSeed % 7) * 0.05),
        x: (first.x + last.x) / 2,
        z: (first.z + last.z) / 2,
        length: link.distance,
        angle: Math.atan2(previewDz, previewDx),
        width: tier === 'arterial' ? 0.18 : 0.12,
        glowWidth: tier === 'arterial' ? 0.06 : 0.04,
        glowOpacity: tier === 'arterial' ? 0.2 : 0.13,
        fromX: first.x,
        fromZ: first.z,
        toX: last.x,
        toZ: last.z,
        violationScore: 0,
        cycleScore: 0,
      };
    });
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

  const importCandidates = bundledImports.slice(0, 760);
  let rawSegments = importCandidates
    .map((road) =>
      createSegmentFromRoad(
        road,
        fileMap,
        maxCount,
        layout,
        cityBounds,
        dna,
        seed,
        edgeSignals,
        {
          minLength: 1.2,
          allowLocalCull: true,
        },
      ),
    )
    .filter((segment): segment is ImportRoadSegment => segment !== null);

  if (rawSegments.length === 0 && importCandidates.length > 0) {
    rawSegments = importCandidates
      .slice(0, 240)
      .map((road) =>
        createSegmentFromRoad(
          road,
          fileMap,
          maxCount,
          layout,
          cityBounds,
          dna,
          seed,
          edgeSignals,
          {
            minLength: 0.6,
            allowLocalCull: false,
          },
        ),
      )
      .filter((segment): segment is ImportRoadSegment => segment !== null);
  }

  if (rawSegments.length === 0) {
    rawSegments = buildFallbackRoads(sceneFiles, cityBounds, layout, dna, seed);
  }

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

  const result = [...byTier.highway, ...byTier.arterial, ...byTier.local];
  const scaffold = buildScaffoldRoads(cityBounds, layout, dna, seed);

  if (result.length > 0) {
    if (result.length >= 8) {
      return result;
    }

    const usedIds = new Set(result.map((segment) => segment.id));
    const supplement = scaffold.filter((segment) => !usedIds.has(segment.id)).slice(
      0,
      Math.max(0, 10 - result.length),
    );
    return [...result, ...supplement];
  }

  if (scaffold.length > 0) {
    return scaffold;
  }

  return buildFallbackRoads(sceneFiles, cityBounds, layout, dna, seed).slice(0, 220);
}
