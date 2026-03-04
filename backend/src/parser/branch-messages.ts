import { CommitDetails } from '../github/github.types';
import { BranchSignal } from './parser.types';

export function normalizeBranchName(rawValue: string): string | null {
  let value = rawValue
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/[),.;:]+$/g, '');

  if (!value) {
    return null;
  }

  value = value
    .replace(/^refs\/heads\//i, '')
    .replace(/^heads\//i, '')
    .replace(/^remotes\/origin\//i, '')
    .replace(/^origin\//i, '')
    .trim();

  if (!value || value.includes(' ')) {
    return null;
  }

  if (value.includes('/')) {
    const parts = value.split('/');
    const tail = parts[parts.length - 1]?.trim();
    if (tail) {
      value = tail;
    }
  }

  const lower = value.toLowerCase();
  if (
    lower === 'main' ||
    lower === 'master' ||
    lower === 'develop' ||
    lower === 'dev' ||
    lower === 'trunk' ||
    lower === 'head'
  ) {
    return null;
  }

  if (/^[0-9a-f]{7,40}$/i.test(value)) {
    return null;
  }

  if (!/^[-a-z0-9._/]+$/i.test(value)) {
    return null;
  }

  if (value.length > 42) {
    return value.slice(0, 42);
  }

  return value;
}

export function extractBranchNamesFromMessage(message: string): string[] {
  if (!message) {
    return [];
  }

  const matches = new Set<string>();
  const add = (rawValue: string) => {
    const normalized = normalizeBranchName(rawValue);
    if (normalized) {
      matches.add(normalized);
    }
  };

  const mergeSourcePattern = /merge pull request #\d+ from [^/\s]+\/([^\s]+)/gi;
  let match = mergeSourcePattern.exec(message);
  while (match) {
    if (match[1]) {
      add(match[1]);
    }
    match = mergeSourcePattern.exec(message);
  }

  const mergeBranchPattern = /merge(?: remote-tracking)? branch ['"]([^'"]+)['"]/gi;
  match = mergeBranchPattern.exec(message);
  while (match) {
    if (match[1]) {
      add(match[1]);
    }
    match = mergeBranchPattern.exec(message);
  }

  const refsPattern = /refs\/heads\/([-a-z0-9._/]+)/gi;
  match = refsPattern.exec(message);
  while (match) {
    if (match[1]) {
      add(match[1]);
    }
    match = refsPattern.exec(message);
  }

  const firstLine = message.split('\n')[0] ?? '';
  if (/^merge\b/i.test(firstLine)) {
    const intoPattern = /\binto\s+([-a-z0-9._/]+)/gi;
    match = intoPattern.exec(firstLine);
    while (match) {
      if (match[1]) {
        add(match[1]);
      }
      match = intoPattern.exec(firstLine);
    }
  }

  return Array.from(matches).slice(0, 5);
}

export function captureBranchSignalsFromCommits(
  branchSignalMap: Map<string, { commits: number; latestTs: number }>,
  commits: CommitDetails[],
): void {
  commits.forEach((commit) => {
    const branchNames = extractBranchNamesFromMessage(commit.message);
    if (branchNames.length === 0) {
      return;
    }

    const commitTs = new Date(commit.date).getTime();
    const normalizedTs = Number.isFinite(commitTs) ? commitTs : Date.now();

    branchNames.forEach((name) => {
      const existing = branchSignalMap.get(name);
      if (!existing) {
        branchSignalMap.set(name, {
          commits: 1,
          latestTs: normalizedTs,
        });
        return;
      }

      existing.commits += 1;
      existing.latestTs = Math.max(existing.latestTs, normalizedTs);
    });
  });
}

export function buildBranchSignals(
  branchSignalMap: Map<string, { commits: number; latestTs: number }>,
): BranchSignal[] {
  if (branchSignalMap.size === 0) {
    return [];
  }

  const totalMentions = Array.from(branchSignalMap.values()).reduce(
    (sum, item) => sum + item.commits,
    0,
  );

  return Array.from(branchSignalMap.entries())
    .map(([name, metrics]) => ({
      name,
      commits: metrics.commits,
      latestDate: new Date(metrics.latestTs || Date.now()).toISOString(),
      share: metrics.commits / Math.max(1, totalMentions),
    }))
    .sort((a, b) => {
      if (b.commits !== a.commits) {
        return b.commits - a.commits;
      }

      const bTime = new Date(b.latestDate).getTime();
      const aTime = new Date(a.latestDate).getTime();
      if (bTime !== aTime) {
        return bTime - aTime;
      }

      return a.name.localeCompare(b.name);
    })
    .slice(0, 10);
}

