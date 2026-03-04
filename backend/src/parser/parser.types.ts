export type CommitFileStatus =
  | 'added'
  | 'modified'
  | 'removed'
  | 'renamed'
  | 'renamed_from'
  | 'renamed_to'
  | string;

export interface CommitFloor {
  sha: string;
  author: string;
  date: string;
  additions: number;
  deletions: number;
  changes: number;
  message: string;
  branches?: string[];
  status?: CommitFileStatus;
  previousPath?: string;
}

export interface FileHistory {
  path: string;
  folder: string;
  commits: CommitFloor[];
  totalChanges: number;
  totalAdditions: number;
  totalDeletions: number;
}

export interface PositionedFileHistory extends FileHistory {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface ImportRoad {
  from: string;
  to: string;
  count: number;
}

export interface BranchSignal {
  name: string;
  commits: number;
  latestDate: string;
  share: number;
}

export type StackCategory =
  | 'runtime'
  | 'framework'
  | 'tooling'
  | 'infrastructure'
  | 'ci'
  | 'database';

export interface StackSignal {
  category: StackCategory;
  name: string;
  source: string;
  confidence: number;
}

export interface StackPassport {
  runtimes: string[];
  frameworks: string[];
  tooling: string[];
  infrastructure: string[];
  ci: string[];
  databases: string[];
  sources: string[];
  signals: StackSignal[];
}

export interface CommitHistoryAnalysis {
  requestedMode: 'full' | 'limited';
  fetchedCommits: number;
  pagesFetched: number;
  totalPagesEstimated: number | null;
  truncated: boolean;
  truncatedReason: string | null;
  skippedDetails: number;
}

export interface ImportRoadAnalysis {
  candidates: number;
  scanned: number;
  roads: number;
  truncated: boolean;
  truncatedReason: string | null;
}

export interface StackAnalysis {
  candidates: number;
  scanned: number;
  truncated: boolean;
  truncatedReason: string | null;
}

export interface BranchAnalysis {
  source: 'refs' | 'messages' | 'mixed';
  sampledBranches: number;
  sampledCommits: number;
}

export interface RepositoryAnalysis {
  commitHistory: CommitHistoryAnalysis;
  imports: ImportRoadAnalysis;
  stack: StackAnalysis;
  branches: BranchAnalysis;
  diagnostics: {
    githubRequests: number;
    stageMs: Record<string, number>;
    generatedAt: string;
  };
}

export interface RepositoryResult {
  repository: {
    owner: string;
    repo: string;
    url: string;
  };
  generatedAt: string;
  totalCommits: number;
  files: PositionedFileHistory[];
  imports: ImportRoad[];
  branches: BranchSignal[];
  stack: StackPassport;
  analysis: RepositoryAnalysis;
}

export interface RepositoryPartialResult extends RepositoryResult {
  processedCommits: number;
  final: boolean;
}

export type ParseStage =
  | 'validating'
  | 'checking_cache'
  | 'fetching_commits'
  | 'fetching_commit_details'
  | 'building_structure'
  | 'analyzing_branches'
  | 'analyzing_stack'
  | 'analyzing_imports'
  | 'layouting'
  | 'done';

export interface ParseProgress {
  stage: ParseStage;
  message: string;
  percent: number;
}

export interface ParsedRepoCoordinates {
  owner: string;
  repo: string;
  normalizedUrl: string;
}
