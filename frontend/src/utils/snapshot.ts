import { deriveBranchSignals } from './branches';
import { PositionedFileHistory, RepositoryResult } from '../types/repository';

function isTerminalLifecycleStatus(
  status: string | undefined,
): boolean {
  return status === 'removed' || status === 'renamed_from';
}

export function buildSnapshot(
  source: RepositoryResult | null,
  ts: number | null,
): RepositoryResult | null {
  if (!source || ts === null) {
    return source;
  }

  const filteredFiles = source.files
    .map((file) => {
      const commits = file.commits
        .filter((commit) => new Date(commit.date).getTime() <= ts)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (commits.length === 0) {
        return null;
      }

      const latest = commits[commits.length - 1];
      if (latest && isTerminalLifecycleStatus(latest.status)) {
        return null;
      }

      return {
        ...file,
        commits,
        totalAdditions: commits.reduce((sum, commit) => sum + commit.additions, 0),
        totalDeletions: commits.reduce((sum, commit) => sum + commit.deletions, 0),
        totalChanges: commits.reduce((sum, commit) => sum + commit.changes, 0),
      } satisfies PositionedFileHistory;
    })
    .filter((file): file is PositionedFileHistory => file !== null);

  const visiblePaths = new Set(filteredFiles.map((file) => file.path));
  const filteredImports = (source.imports ?? []).filter(
    (road) => visiblePaths.has(road.from) && visiblePaths.has(road.to),
  );
  const sourceBranches =
    (source.branches ?? []).length > 0 ? source.branches : deriveBranchSignals(source.files);
  const filteredBranches = sourceBranches.filter(
    (branch) => new Date(branch.latestDate).getTime() <= ts,
  );

  return {
    ...source,
    files: filteredFiles,
    imports: filteredImports,
    branches: filteredBranches,
  };
}
