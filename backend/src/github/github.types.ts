export interface CommitSummary {
  sha: string;
}

export type CommitFileStatus =
  | 'added'
  | 'modified'
  | 'removed'
  | 'renamed'
  | string;

export interface CommitFileChange {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status?: CommitFileStatus;
  previousFilename?: string;
}

export interface CommitDetails {
  sha: string;
  author: string;
  date: string;
  message: string;
  files: CommitFileChange[];
}

export interface CommitListResult {
  commits: CommitSummary[];
  etag: string | null;
  notModified: boolean;
  truncated?: boolean;
  warning?: string;
  pagesFetched?: number;
  totalPagesEstimated?: number | null;
  truncatedReason?: 'rate_limit' | 'budget_timeout' | 'page_budget' | 'cancelled';
}

export interface FileContentResult {
  path: string;
  content: string;
}

export interface BranchHead {
  name: string;
  sha: string;
}

export interface BranchCommitSummary {
  sha: string;
  date: string;
}
