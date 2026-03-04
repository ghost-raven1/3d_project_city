import { describe, expect, it } from 'vitest';
import { PositionedFileHistory, RepositoryResult } from '../types/repository';
import { buildSnapshot } from './snapshot';

function baseAnalysis(): RepositoryResult['analysis'] {
  return {
    commitHistory: {
      requestedMode: 'full',
      fetchedCommits: 0,
      pagesFetched: 0,
      totalPagesEstimated: null,
      truncated: false,
      truncatedReason: null,
      skippedDetails: 0,
    },
    imports: {
      candidates: 0,
      scanned: 0,
      roads: 0,
      truncated: false,
      truncatedReason: null,
    },
    stack: {
      candidates: 0,
      scanned: 0,
      truncated: false,
      truncatedReason: null,
    },
    branches: {
      source: 'messages',
      sampledBranches: 0,
      sampledCommits: 0,
    },
    diagnostics: {
      githubRequests: 0,
      stageMs: {},
      generatedAt: '2025-01-01T00:00:00.000Z',
    },
  };
}

function createResult(files: PositionedFileHistory[]): RepositoryResult {
  return {
    repository: {
      owner: 'test',
      repo: 'repo',
      url: 'https://github.com/test/repo',
    },
    generatedAt: '2025-01-30T00:00:00.000Z',
    totalCommits: files.reduce((sum, file) => sum + file.commits.length, 0),
    files,
    imports: [],
    branches: [],
    stack: {
      runtimes: [],
      frameworks: [],
      tooling: [],
      infrastructure: [],
      ci: [],
      databases: [],
      sources: [],
      signals: [],
    },
    analysis: baseAnalysis(),
  };
}

describe('buildSnapshot lifecycle behavior', () => {
  it('removes file from snapshot after terminal removed commit', () => {
    const source = createResult([
      {
        path: 'src/a.ts',
        folder: 'src',
        x: 0,
        z: 0,
        width: 2,
        depth: 2,
        totalAdditions: 12,
        totalDeletions: 7,
        totalChanges: 19,
        commits: [
          {
            sha: '1',
            author: 'dev',
            date: '2025-01-01T00:00:00.000Z',
            additions: 12,
            deletions: 0,
            changes: 12,
            message: 'add file',
            status: 'added',
          },
          {
            sha: '2',
            author: 'dev',
            date: '2025-01-15T00:00:00.000Z',
            additions: 0,
            deletions: 7,
            changes: 7,
            message: 'remove file',
            status: 'removed',
          },
        ],
      },
    ]);

    const beforeRemoval = buildSnapshot(
      source,
      new Date('2025-01-10T00:00:00.000Z').getTime(),
    );
    const afterRemoval = buildSnapshot(
      source,
      new Date('2025-01-20T00:00:00.000Z').getTime(),
    );

    expect(beforeRemoval?.files.map((item) => item.path)).toContain('src/a.ts');
    expect(afterRemoval?.files.map((item) => item.path)).not.toContain('src/a.ts');
  });

  it('hides renamed_from path and keeps renamed_to path after rename date', () => {
    const source = createResult([
      {
        path: 'src/old.ts',
        folder: 'src',
        x: 0,
        z: 0,
        width: 2,
        depth: 2,
        totalAdditions: 8,
        totalDeletions: 2,
        totalChanges: 10,
        commits: [
          {
            sha: '1',
            author: 'dev',
            date: '2025-01-01T00:00:00.000Z',
            additions: 8,
            deletions: 0,
            changes: 8,
            message: 'add old',
            status: 'added',
          },
          {
            sha: '2',
            author: 'dev',
            date: '2025-01-12T00:00:00.000Z',
            additions: 0,
            deletions: 0,
            changes: 0,
            message: 'rename old to new',
            status: 'renamed_from',
            previousPath: 'src/new.ts',
          },
        ],
      },
      {
        path: 'src/new.ts',
        folder: 'src',
        x: 4,
        z: 0,
        width: 2,
        depth: 2,
        totalAdditions: 0,
        totalDeletions: 0,
        totalChanges: 0,
        commits: [
          {
            sha: '2',
            author: 'dev',
            date: '2025-01-12T00:00:00.000Z',
            additions: 0,
            deletions: 0,
            changes: 0,
            message: 'rename old to new',
            status: 'renamed_to',
            previousPath: 'src/old.ts',
          },
        ],
      },
    ]);

    const beforeRename = buildSnapshot(
      source,
      new Date('2025-01-10T00:00:00.000Z').getTime(),
    );
    const afterRename = buildSnapshot(
      source,
      new Date('2025-01-20T00:00:00.000Z').getTime(),
    );

    expect(beforeRename?.files.map((item) => item.path)).toContain('src/old.ts');
    expect(beforeRename?.files.map((item) => item.path)).not.toContain('src/new.ts');

    expect(afterRename?.files.map((item) => item.path)).not.toContain('src/old.ts');
    expect(afterRename?.files.map((item) => item.path)).toContain('src/new.ts');
  });
});
