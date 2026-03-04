import { PositionedFileHistory } from '../types/repository';

export interface FileRiskProfile {
  path: string;
  risk: number;
  churn: number;
  bugfixRatio: number;
  lowBusFactor: number;
  topAuthor: string;
  topAuthorShare: number;
  recentCommits: number;
}

const bugfixWords = /(fix|bug|hotfix|patch|issue|defect|regression|incident)/i;
const recentWindowMs = 1000 * 60 * 60 * 24 * 90;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function computeFileRiskProfile(
  file: PositionedFileHistory,
  nowTs = Date.now(),
): FileRiskProfile {
  const commits = file.commits;
  if (commits.length === 0) {
    return {
      path: file.path,
      risk: 0,
      churn: 0,
      bugfixRatio: 0,
      lowBusFactor: 0,
      topAuthor: 'Unknown',
      topAuthorShare: 0,
      recentCommits: 0,
    };
  }

  const recentCutoff = nowTs - recentWindowMs;
  const recentCommits = commits.filter(
    (commit) => new Date(commit.date).getTime() >= recentCutoff,
  );
  const recentChanges = recentCommits.reduce((sum, commit) => sum + commit.changes, 0);
  const totalChanges = Math.max(
    1,
    commits.reduce((sum, commit) => sum + commit.changes, 0),
  );

  const churn = clamp(recentChanges / totalChanges);
  const bugfixCount = recentCommits.filter((commit) =>
    bugfixWords.test(commit.message),
  ).length;
  const bugfixRatio = clamp(
    recentCommits.length === 0 ? 0 : bugfixCount / recentCommits.length,
  );

  const authorCount = new Map<string, number>();
  commits.forEach((commit) => {
    authorCount.set(commit.author, (authorCount.get(commit.author) ?? 0) + 1);
  });

  const topEntry = Array.from(authorCount.entries()).sort((a, b) => b[1] - a[1])[0];
  const topAuthor = topEntry?.[0] ?? 'Unknown';
  const topAuthorShare = clamp((topEntry?.[1] ?? 0) / commits.length);
  const lowBusFactor = topAuthorShare;

  const weightedRisk = clamp(churn * bugfixRatio * lowBusFactor * 2.2);

  return {
    path: file.path,
    risk: weightedRisk,
    churn,
    bugfixRatio,
    lowBusFactor,
    topAuthor,
    topAuthorShare,
    recentCommits: recentCommits.length,
  };
}

export function buildFileRiskMap(
  files: PositionedFileHistory[],
  nowTs = Date.now(),
): Map<string, FileRiskProfile> {
  const map = new Map<string, FileRiskProfile>();
  files.forEach((file) => {
    map.set(file.path, computeFileRiskProfile(file, nowTs));
  });
  return map;
}

export function riskBand(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.55) {
    return 'high';
  }
  if (score >= 0.3) {
    return 'medium';
  }
  return 'low';
}
