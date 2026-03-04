import { BranchSignal, PositionedFileHistory } from '../types/repository';

function normalizeBranchName(rawValue: string): string | null {
  let value = rawValue
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/[),.;:]+$/g, '');

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
    value = parts[parts.length - 1] ?? value;
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

  return value.length > 42 ? value.slice(0, 42) : value;
}

export function extractBranchNamesFromMessage(message: string): string[] {
  if (!message) {
    return [];
  }

  const branches = new Set<string>();
  const add = (candidate: string) => {
    const normalized = normalizeBranchName(candidate);
    if (normalized) {
      branches.add(normalized);
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

  return Array.from(branches).slice(0, 5);
}

export function deriveBranchSignals(files: PositionedFileHistory[]): BranchSignal[] {
  if (files.length === 0) {
    return [];
  }

  const commitsBySha = new Map<string, { message: string; date: string; branches: string[] }>();
  files.forEach((file) => {
    file.commits.forEach((commit) => {
      if (!commitsBySha.has(commit.sha)) {
        commitsBySha.set(commit.sha, {
          message: commit.message,
          date: commit.date,
          branches: commit.branches ?? [],
        });
      }
    });
  });

  const branchMap = new Map<string, { commits: number; latestTs: number }>();
  commitsBySha.forEach((commit) => {
    const branchNames =
      commit.branches.length > 0
        ? commit.branches
        : extractBranchNamesFromMessage(commit.message);
    if (branchNames.length === 0) {
      return;
    }

    const ts = new Date(commit.date).getTime();
    const normalizedTs = Number.isFinite(ts) ? ts : Date.now();

    branchNames.forEach((branchName) => {
      const existing = branchMap.get(branchName);
      if (!existing) {
        branchMap.set(branchName, {
          commits: 1,
          latestTs: normalizedTs,
        });
        return;
      }

      existing.commits += 1;
      existing.latestTs = Math.max(existing.latestTs, normalizedTs);
    });
  });

  if (branchMap.size === 0) {
    return [];
  }

  const totalMentions = Array.from(branchMap.values()).reduce(
    (sum, value) => sum + value.commits,
    0,
  );

  return Array.from(branchMap.entries())
    .map(([name, value]) => ({
      name,
      commits: value.commits,
      latestDate: new Date(value.latestTs || Date.now()).toISOString(),
      share: value.commits / Math.max(1, totalMentions),
    }))
    .sort((a, b) => {
      if (b.commits !== a.commits) {
        return b.commits - a.commits;
      }

      return (
        new Date(b.latestDate).getTime() -
        new Date(a.latestDate).getTime()
      );
    })
    .slice(0, 10);
}

export function fileMatchesBranch(
  file: PositionedFileHistory,
  branchName: string,
): boolean {
  const normalizedTarget = normalizeBranchName(branchName);
  if (!normalizedTarget) {
    return false;
  }

  return file.commits.some((commit) =>
    (commit.branches && commit.branches.length > 0
      ? commit.branches
      : extractBranchNamesFromMessage(commit.message)
    ).some((candidate) => candidate.toLowerCase() === normalizedTarget.toLowerCase()),
  );
}
