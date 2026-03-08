import { CommitFloor } from '../types/repository';

const MAX_VISIBLE_FLOORS = 60;

function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function floorHeight(changes: number): number {
  const normalizedChanges = Math.max(0, finiteNumber(changes, 0));
  return Math.max(0.35, Math.log1p(normalizedChanges) * 0.42);
}

export function compactFloors(
  commits: CommitFloor[],
  maxVisibleFloors = MAX_VISIBLE_FLOORS,
): CommitFloor[] {
  if (commits.length <= maxVisibleFloors) {
    return commits;
  }

  const bucketSize = Math.ceil(commits.length / maxVisibleFloors);
  const compacted: CommitFloor[] = [];

  for (let index = 0; index < commits.length; index += bucketSize) {
    const chunk = commits.slice(index, index + bucketSize);
    const first = chunk[0];

    compacted.push({
      sha: first.sha,
      author: first.author,
      date: first.date,
      message: first.message,
      additions: chunk.reduce((sum, floor) => sum + finiteNumber(floor.additions, 0), 0),
      deletions: chunk.reduce((sum, floor) => sum + finiteNumber(floor.deletions, 0), 0),
      changes: chunk.reduce((sum, floor) => sum + finiteNumber(floor.changes, 0), 0),
      branches: Array.from(
        new Set(chunk.flatMap((floor) => floor.branches ?? [])),
      ),
    });
  }

  return compacted;
}
