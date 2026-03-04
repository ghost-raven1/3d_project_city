import { describe, expect, it } from 'vitest';
import { deriveBranchSignals, fileMatchesBranch } from './branches';
import { PositionedFileHistory } from '../types/repository';

function buildFile(path: string, branches: string[]): PositionedFileHistory {
  return {
    path,
    folder: 'src',
    x: 0,
    z: 0,
    width: 2,
    depth: 2,
    totalAdditions: 10,
    totalDeletions: 3,
    totalChanges: 13,
    commits: [
      {
        sha: `${path}-sha`,
        author: 'dev',
        date: '2025-01-01T00:00:00.000Z',
        additions: 10,
        deletions: 3,
        changes: 13,
        message: 'work',
        branches,
      },
    ],
  };
}

describe('branches utils', () => {
  it('matches branch from explicit commit branches', () => {
    const file = buildFile('src/a.ts', ['feature-login']);
    expect(fileMatchesBranch(file, 'feature-login')).toBe(true);
    expect(fileMatchesBranch(file, 'feature-profile')).toBe(false);
  });

  it('derives branch signals from commit branches', () => {
    const files = [buildFile('src/a.ts', ['feature-login']), buildFile('src/b.ts', ['feature-login'])];
    const signals = deriveBranchSignals(files);
    expect(signals.length).toBe(1);
    expect(signals[0]?.name).toBe('feature-login');
    expect(signals[0]?.commits).toBe(2);
  });
});

