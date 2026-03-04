import { PositionedFileHistory, RepositoryResult } from '../types/repository';

export type BuildingMood = 'storm' | 'rain' | 'sun';

export interface TimelineBounds {
  min: number;
  max: number;
}

export function folderToDistrictColor(
  folder: string,
  hueOffset = 0,
  saturation = 45,
  lightness = 56,
): string {
  const hash = hashString(folder);
  const hue = (hash + hueOffset) % 360;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function classifyBuildingMood(file: PositionedFileHistory): BuildingMood {
  const total = file.commits.length;
  if (total === 0) {
    return 'sun';
  }

  const recentThreshold = Date.now() - 1000 * 60 * 60 * 24 * 30;
  const recentCommits = file.commits.filter(
    (commit) => new Date(commit.date).getTime() >= recentThreshold,
  );

  const bugfixWords = /(fix|bug|hotfix|patch|issue|defect)/i;
  const bugfixCount = recentCommits.filter((commit) => bugfixWords.test(commit.message)).length;

  if (recentCommits.length >= 3 && bugfixCount >= Math.ceil(recentCommits.length * 0.4)) {
    return 'storm';
  }

  if (recentCommits.length / total >= 0.45) {
    return 'rain';
  }

  return 'sun';
}

export function getTimelineBounds(data: RepositoryResult | null): TimelineBounds | null {
  if (!data) {
    return null;
  }

  const timestamps = data.files.flatMap((file) =>
    file.commits.map((commit) => new Date(commit.date).getTime()),
  );

  if (timestamps.length === 0) {
    return null;
  }

  return {
    min: Math.min(...timestamps),
    max: Math.max(...timestamps),
  };
}

function hashString(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}
