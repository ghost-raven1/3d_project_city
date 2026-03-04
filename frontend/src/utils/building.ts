import { CommitFloor } from '../types/repository';

const MAX_VISIBLE_FLOORS = 60;

export function floorHeight(changes: number): number {
  return Math.max(0.35, Math.log1p(changes) * 0.42);
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
      additions: chunk.reduce((sum, floor) => sum + floor.additions, 0),
      deletions: chunk.reduce((sum, floor) => sum + floor.deletions, 0),
      changes: chunk.reduce((sum, floor) => sum + floor.changes, 0),
      branches: Array.from(
        new Set(chunk.flatMap((floor) => floor.branches ?? [])),
      ),
    });
  }

  return compacted;
}
