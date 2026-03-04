import { PositionedFileHistory, RepositoryResult } from '../types/repository';

export type CityLayout = 'grid' | 'radial' | 'ribbon' | 'islands';
export type CityArchitecture = 'cyberpunk' | 'industrial' | 'monolith' | 'organic';
export type RoofStyle = 'flat' | 'spire' | 'dome' | 'terrace';

export interface CityPalette {
  sky: string;
  fog: string;
  ground: string;
  gridCell: string;
  gridSection: string;
  sun: string;
  accent: string;
  districtSaturation: number;
  districtLightness: number;
}

export interface CityDNA {
  seed: number;
  layout: CityLayout;
  architecture: CityArchitecture;
  palette: CityPalette;
  metrics: CityMetrics;
  cloudiness: number;
  starDensity: number;
  droneSpeed: number;
  roadCurvature: number;
  wetness: number;
  skylineBoost: number;
}

export interface BuildingStyle {
  roofStyle: RoofStyle;
  widthScale: number;
  depthScale: number;
  glowBias: number;
}

export interface CityMetrics {
  primaryLanguage: string;
  churn: number;
  importDensity: number;
  ageDays: number;
}

const layouts: CityLayout[] = ['grid', 'radial', 'ribbon', 'islands'];
const architectures: CityArchitecture[] = ['cyberpunk', 'industrial', 'monolith', 'organic'];

const palettes: CityPalette[] = [
  {
    sky: '#d6ecff',
    fog: '#c8e3ff',
    ground: '#deebff',
    gridCell: '#9cbce8',
    gridSection: '#78a5e2',
    sun: '#ff8ecb',
    accent: '#2ec8ff',
    districtSaturation: 56,
    districtLightness: 62,
  },
  {
    sky: '#f4e8ff',
    fog: '#ecdafc',
    ground: '#efe2ff',
    gridCell: '#c3a8eb',
    gridSection: '#a98ada',
    sun: '#ff97d8',
    accent: '#e279ff',
    districtSaturation: 50,
    districtLightness: 63,
  },
  {
    sky: '#d9fff6',
    fog: '#caf5ea',
    ground: '#dcfff6',
    gridCell: '#8ecdc1',
    gridSection: '#69bdb2',
    sun: '#a9fff2',
    accent: '#24e9c3',
    districtSaturation: 52,
    districtLightness: 60,
  },
  {
    sky: '#ffe9dd',
    fog: '#f7dccf',
    ground: '#fff0e8',
    gridCell: '#e2ae92',
    gridSection: '#cf8f72',
    sun: '#ffb991',
    accent: '#ff8b50',
    districtSaturation: 58,
    districtLightness: 61,
  },
  {
    sky: '#e7f2f5',
    fog: '#d9eaf0',
    ground: '#e7f1f4',
    gridCell: '#9eb8c3',
    gridSection: '#7fa4b4',
    sun: '#9de9ff',
    accent: '#6a9fff',
    districtSaturation: 42,
    districtLightness: 62,
  },
];

const roofStyles: RoofStyle[] = ['flat', 'spire', 'dome', 'terrace'];

export function createCityDNA(data: RepositoryResult | null): CityDNA | null {
  if (!data) {
    return null;
  }

  const metrics = computeCityMetrics(data);
  const base = `${data.repository.owner}/${data.repository.repo}`;
  const changeVolume = data.files.reduce((sum, file) => sum + file.totalChanges, 0);
  const seed = hashString(
    `${base}:${data.totalCommits}:${changeVolume}:${metrics.primaryLanguage}:${metrics.importDensity.toFixed(3)}:${metrics.churn.toFixed(3)}:${metrics.ageDays}`,
  );
  const rand = mulberry32(seed);
  const architecture = pickArchitecture(metrics.primaryLanguage, rand);
  const layout = pickLayout(metrics, rand);
  const palette = pickPalette(metrics, seed, architecture);
  const wetness = clamp(metrics.churn * 0.42 + metrics.importDensity * 0.34, 0.12, 0.96);

  return {
    seed,
    layout,
    architecture,
    palette,
    metrics,
    cloudiness: clamp(0.22 + metrics.churn * 0.35 + rand() * 0.24, 0.2, 0.88),
    starDensity: 900 + Math.floor((1 + Math.log1p(metrics.ageDays)) * 420 + rand() * 1200),
    droneSpeed: clamp(0.58 + metrics.importDensity * 0.95 + rand() * 0.32, 0.55, 1.8),
    roadCurvature: clamp(0.75 + metrics.importDensity * 0.8 + rand() * 0.2, 0.7, 1.8),
    wetness,
    skylineBoost: clamp(0.85 + metrics.importDensity * 0.46 + metrics.churn * 0.38, 0.82, 1.85),
  };
}

export function buildCityLayout(
  files: PositionedFileHistory[],
  dna: CityDNA | null,
): PositionedFileHistory[] {
  if (!dna || files.length === 0) {
    return files;
  }

  const centerX = average(files.map((file) => file.x));
  const centerZ = average(files.map((file) => file.z));

  if (dna.layout === 'grid') {
    const positioned = files.map((file) => ({
      ...file,
      ...applyBuildingScale(file, dna.seed),
    }));
    return resolveBuildingOverlaps(positioned, dna.seed);
  }

  if (dna.layout === 'radial') {
    const positioned = files.map((file) => {
      const dx = file.x - centerX;
      const dz = file.z - centerZ;
      const radius = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx) + radius * 0.024 + (dna.seed % 13) * 0.03;
      const spiral = radius * 1.08;

      return {
        ...file,
        x: centerX + Math.cos(angle) * spiral,
        z: centerZ + Math.sin(angle) * spiral,
        ...applyBuildingScale(file, dna.seed),
      };
    });
    return resolveBuildingOverlaps(positioned, dna.seed);
  }

  if (dna.layout === 'ribbon') {
    const drift = ((dna.seed % 23) / 23) * Math.PI * 2;

    const positioned = files.map((file) => {
      const dx = file.x - centerX;
      const dz = file.z - centerZ;

      return {
        ...file,
        x: centerX + dx * 1.18,
        z: centerZ + Math.sin(dx * 0.16 + drift) * 10 + dz * 0.42,
        ...applyBuildingScale(file, dna.seed),
      };
    });
    return resolveBuildingOverlaps(positioned, dna.seed);
  }

  const grouped = new Map<string, PositionedFileHistory[]>();
  files.forEach((file) => {
    const list = grouped.get(file.folder) ?? [];
    list.push(file);
    grouped.set(file.folder, list);
  });

  const folderCenters = new Map<string, { x: number; z: number }>();
  const groupEntries = Array.from(grouped.entries());
  const clusterRadius = 18 + Math.min(26, groupEntries.length * 1.4);

  groupEntries.forEach(([folder], index) => {
    const folderHash = hashString(`${folder}:${dna.seed}`);
    const angle = (index / Math.max(1, groupEntries.length)) * Math.PI * 2 + (folderHash % 97) * 0.01;
    const radius = clusterRadius + (folderHash % 9);

    folderCenters.set(folder, {
      x: centerX + Math.cos(angle) * radius,
      z: centerZ + Math.sin(angle) * radius,
    });
  });

  const positioned = groupEntries.flatMap(([folder, folderFiles]) => {
    const target = folderCenters.get(folder) ?? { x: centerX, z: centerZ };
    const localCenter = {
      x: average(folderFiles.map((file) => file.x)),
      z: average(folderFiles.map((file) => file.z)),
    };

    return folderFiles.map((file) => {
      const localX = file.x - localCenter.x;
      const localZ = file.z - localCenter.z;

      return {
        ...file,
        x: target.x + localX * 0.8,
        z: target.z + localZ * 0.8,
        ...applyBuildingScale(file, dna.seed),
      };
    });
  });

  return resolveBuildingOverlaps(positioned, dna.seed);
}

export function getBuildingStyle(path: string, dna: CityDNA | null): BuildingStyle {
  if (!dna) {
    return {
      roofStyle: 'flat',
      widthScale: 1,
      depthScale: 1,
      glowBias: 0.12,
    };
  }

  const mix = hashString(`${path}:${dna.seed}`);
  const unitA = (mix % 997) / 997;
  const unitB = (Math.floor(mix / 997) % 997) / 997;

  return {
    roofStyle: roofStyles[Math.floor(unitA * roofStyles.length) % roofStyles.length],
    widthScale: 0.94 + unitA * 0.14,
    depthScale: 0.94 + unitB * 0.14,
    glowBias: 0.08 + unitA * 0.18,
  };
}

function applyBuildingScale(
  file: PositionedFileHistory,
  seed: number,
): Pick<PositionedFileHistory, 'width' | 'depth'> {
  const mix = hashString(`${file.path}:${seed}`);
  const unitA = (mix % 1009) / 1009;
  const unitB = (Math.floor(mix / 1009) % 1009) / 1009;

  return {
    width: clamp(file.width * (0.86 + unitA * 0.3), 1.25, 2.9),
    depth: clamp(file.depth * (0.86 + unitB * 0.3), 1.25, 2.9),
  };
}

function resolveBuildingOverlaps(
  files: PositionedFileHistory[],
  seed: number,
): PositionedFileHistory[] {
  if (files.length <= 1) {
    return files.map((file) => ({ ...file }));
  }

  const padding = 0.28;
  const maxDimension = Math.max(2.9, ...files.map((file) => Math.max(file.width, file.depth)));
  const cellSize = maxDimension + padding * 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const maxAttempts = Math.min(640, 120 + Math.ceil(Math.sqrt(files.length) * 54));
  const searchStep = 0.46;
  const centerX = average(files.map((file) => file.x));
  const centerZ = average(files.map((file) => file.z));

  const ordered = [...files]
    .map((file) => ({ ...file }))
    .sort((a, b) => {
      const da = Math.hypot(a.x - centerX, a.z - centerZ);
      const db = Math.hypot(b.x - centerX, b.z - centerZ);

      if (da !== db) {
        return da - db;
      }

      return a.path.localeCompare(b.path);
    });

  const placed: PositionedFileHistory[] = [];
  const cellIndex = new Map<string, number[]>();

  ordered.forEach((file) => {
    const phase = ((hashString(`${file.path}:${seed}`) % 1024) / 1024) * Math.PI * 2;
    let best = { x: file.x, z: file.z };
    let bestPenalty = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const radius = attempt === 0 ? 0 : Math.sqrt(attempt) * searchStep;
      const angle = phase + attempt * goldenAngle;
      const candidate = {
        x: file.x + Math.cos(angle) * radius,
        z: file.z + Math.sin(angle) * radius,
      };

      const penalty = overlapPenalty(candidate, file, placed, cellIndex, cellSize, padding);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        best = candidate;
      }

      if (penalty === 0) {
        break;
      }
    }

    const normalized: PositionedFileHistory = {
      ...file,
      x: best.x,
      z: best.z,
    };
    const placedIndex = placed.push(normalized) - 1;

    collectCells(best.x, best.z, file.width, file.depth, padding, cellSize).forEach((key) => {
      const bucket = cellIndex.get(key);
      if (bucket) {
        bucket.push(placedIndex);
        return;
      }

      cellIndex.set(key, [placedIndex]);
    });
  });

  return placed;
}

function overlapPenalty(
  point: { x: number; z: number },
  file: PositionedFileHistory,
  placed: PositionedFileHistory[],
  cellIndex: Map<string, number[]>,
  cellSize: number,
  padding: number,
): number {
  const neighborIndices = new Set<number>();
  collectCells(point.x, point.z, file.width, file.depth, padding, cellSize).forEach((key) => {
    const bucket = cellIndex.get(key);
    if (!bucket) {
      return;
    }

    bucket.forEach((index) => {
      neighborIndices.add(index);
    });
  });

  let penalty = 0;
  neighborIndices.forEach((index) => {
    const other = placed[index];
    if (!other) {
      return;
    }

    const overlapX = (file.width + other.width) / 2 + padding - Math.abs(point.x - other.x);
    const overlapZ = (file.depth + other.depth) / 2 + padding - Math.abs(point.z - other.z);

    if (overlapX <= 0 || overlapZ <= 0) {
      return;
    }

    penalty += overlapX * overlapZ;
  });

  return penalty;
}

function collectCells(
  x: number,
  z: number,
  width: number,
  depth: number,
  padding: number,
  cellSize: number,
): string[] {
  const halfWidth = width / 2 + padding;
  const halfDepth = depth / 2 + padding;
  const minCellX = Math.floor((x - halfWidth) / cellSize);
  const maxCellX = Math.floor((x + halfWidth) / cellSize);
  const minCellZ = Math.floor((z - halfDepth) / cellSize);
  const maxCellZ = Math.floor((z + halfDepth) / cellSize);
  const result: string[] = [];

  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cz = minCellZ; cz <= maxCellZ; cz += 1) {
      result.push(`${cx}:${cz}`);
    }
  }

  return result;
}

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)] ?? list[0];
}

function pickArchitecture(
  primaryLanguage: string,
  rand: () => number,
): CityArchitecture {
  const lang = primaryLanguage.toLowerCase();

  if (lang.includes('typescript') || lang.includes('javascript')) {
    return 'cyberpunk';
  }

  if (
    lang.includes('docker') ||
    lang.includes('shell') ||
    lang.includes('yaml') ||
    lang.includes('toml')
  ) {
    return 'industrial';
  }

  if (lang.includes('markdown') || lang.includes('rst') || lang.includes('asciidoc')) {
    return 'organic';
  }

  if (lang.includes('go') || lang.includes('rust') || lang.includes('c') || lang.includes('cpp')) {
    return rand() > 0.45 ? 'monolith' : 'industrial';
  }

  return pick(architectures, rand);
}

function pickLayout(metrics: CityMetrics, rand: () => number): CityLayout {
  if (metrics.importDensity > 0.58) {
    return metrics.churn > 0.52 ? 'radial' : 'islands';
  }

  if (metrics.churn > 0.68) {
    return 'ribbon';
  }

  if (metrics.importDensity < 0.18 && rand() > 0.5) {
    return 'grid';
  }

  return pick(layouts, rand);
}

function pickPalette(
  metrics: CityMetrics,
  seed: number,
  architecture: CityArchitecture,
): CityPalette {
  const primary = metrics.primaryLanguage.toLowerCase();
  const candidates = palettes.filter((palette, index) => {
    if (architecture === 'cyberpunk') {
      return index === 0 || index === 1 || index === 2;
    }

    if (architecture === 'industrial') {
      return index === 3 || index === 4;
    }

    if (architecture === 'organic') {
      return index === 2 || index === 4;
    }

    return true;
  });

  const languageBias =
    primary.includes('python')
      ? 2
      : primary.includes('go')
        ? 4
        : primary.includes('rust')
          ? 3
          : primary.includes('java')
            ? 1
            : 0;

  const index = (seed + languageBias) % Math.max(1, candidates.length);
  return candidates[index] ?? palettes[0];
}

function computeCityMetrics(data: RepositoryResult): CityMetrics {
  const languageWeight = new Map<string, number>();
  let totalChanges = 0;
  let commitCount = 0;
  const timestamps: number[] = [];

  data.files.forEach((file) => {
    const extension = getFileExtension(file.path);
    const language = extensionToLanguage(extension);
    const fileWeight = Math.max(1, file.totalChanges || file.commits.length);
    languageWeight.set(language, (languageWeight.get(language) ?? 0) + fileWeight);

    file.commits.forEach((commit) => {
      totalChanges += commit.changes;
      commitCount += 1;
      timestamps.push(new Date(commit.date).getTime());
    });
  });

  const sortedLanguages = Array.from(languageWeight.entries()).sort((a, b) => b[1] - a[1]);
  const primaryLanguage = sortedLanguages[0]?.[0] ?? 'Unknown';
  const churn = clamp(
    Math.log1p(totalChanges / Math.max(1, commitCount)) / Math.log(240),
    0.05,
    1,
  );
  const importDensity = clamp(data.imports.length / Math.max(1, data.files.length * 1.35), 0, 1);

  const minTs = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
  const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
  const ageDays = Math.max(1, Math.round((maxTs - minTs) / (1000 * 60 * 60 * 24)));

  return {
    primaryLanguage,
    churn,
    importDensity,
    ageDays,
  };
}

function getFileExtension(path: string): string {
  const fileName = path.split('/').pop()?.toLowerCase() ?? '';
  if (fileName === 'dockerfile') {
    return 'dockerfile';
  }

  if (fileName === 'makefile') {
    return 'makefile';
  }

  const index = path.lastIndexOf('.');
  if (index < 0) {
    return '';
  }

  return path.slice(index + 1).toLowerCase();
}

function extensionToLanguage(ext: string): string {
  const extension = ext.toLowerCase();
  const map: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    mjs: 'JavaScript',
    cjs: 'JavaScript',
    py: 'Python',
    go: 'Go',
    rs: 'Rust',
    java: 'Java',
    kt: 'Kotlin',
    swift: 'Swift',
    cs: 'C#',
    cpp: 'C++',
    cc: 'C++',
    c: 'C',
    h: 'C/C++ Header',
    rb: 'Ruby',
    php: 'PHP',
    md: 'Markdown',
    rst: 'RST',
    adoc: 'AsciiDoc',
    yaml: 'YAML',
    yml: 'YAML',
    json: 'JSON',
    toml: 'TOML',
    makefile: 'Make',
    sh: 'Shell',
    bash: 'Shell',
    zsh: 'Shell',
    dockerfile: 'Docker',
    css: 'CSS',
    scss: 'SCSS',
    less: 'LESS',
    html: 'HTML',
    vue: 'Vue',
    svelte: 'Svelte',
    sql: 'SQL',
  };

  return map[extension] ?? (extension ? extension.toUpperCase() : 'Unknown');
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hashString(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function mulberry32(seed: number): () => number {
  let state = seed;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
