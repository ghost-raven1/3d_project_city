import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'node:path';
import { RepoCacheService } from '../cache/repo-cache.service';
import { parseGithubRepoUrl } from '../common/utils/github-url';
import { CommitDetails } from '../github/github.types';
import { GithubService } from '../github/github.service';
import { LayoutService } from '../layout/layout.service';
import {
  buildBranchSignals,
  captureBranchSignalsFromCommits,
  extractBranchNamesFromMessage,
  normalizeBranchName,
} from './branch-messages';
import {
  BranchSignal,
  CommitFloor,
  FileHistory,
  ImportRoad,
  RepositoryAnalysis,
  RepositoryPartialResult,
  ParseProgress,
  RepositoryResult,
  StackCategory,
  StackPassport,
} from './parser.types';

type StackBucketName =
  | 'runtimes'
  | 'frameworks'
  | 'tooling'
  | 'infrastructure'
  | 'ci'
  | 'databases';

type ManifestKind =
  | 'package_json'
  | 'requirements'
  | 'pyproject'
  | 'pom_xml'
  | 'go_mod'
  | 'cargo_toml'
  | 'dockerfile'
  | 'ci'
  | 'compose'
  | 'generic';

interface StackPassportBuildResult {
  passport: StackPassport;
  candidates: number;
  scanned: number;
  truncated: boolean;
  truncatedReason: string | null;
}

interface ImportRoadBuildResult {
  roads: ImportRoad[];
  candidates: number;
  scanned: number;
  truncated: boolean;
  truncatedReason: string | null;
}

interface BranchReferenceBuildResult {
  signals: Map<string, { commits: number; latestTs: number }>;
  bySha: Map<string, string[]>;
  sampledBranches: number;
  sampledCommits: number;
}

export class ParseCancelledError extends Error {
  constructor(message = 'Parse cancelled by a newer request.') {
    super(message);
    this.name = 'ParseCancelledError';
  }
}

@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);
  private readonly maxCommits = Number(process.env.MAX_COMMITS ?? 0);
  private readonly concurrency = Number(process.env.GITHUB_CONCURRENCY ?? 5);
  private readonly fullHistoryMaxPages = Number(
    process.env.HISTORY_FETCH_MAX_PAGES ?? 90,
  );
  private readonly fullHistoryMaxMs = Number(
    process.env.HISTORY_FETCH_MAX_MS ?? 240000,
  );
  private readonly importScanLimit = Number(process.env.IMPORT_SCAN_LIMIT ?? 220);
  private readonly importConcurrency = Number(process.env.IMPORT_CONCURRENCY ?? 4);
  private readonly importRequestTimeoutMs = Number(
    process.env.IMPORT_REQUEST_TIMEOUT_MS ?? 8000,
  );
  private readonly importAnalysisTimeoutMs = Number(
    process.env.IMPORT_ANALYSIS_TIMEOUT_MS ?? 45000,
  );
  private readonly importSourceCharLimit = Number(
    process.env.IMPORT_SOURCE_CHAR_LIMIT ?? 300000,
  );
  private readonly stackProbeLimit = Number(process.env.STACK_PROBE_LIMIT ?? 30);
  private readonly stackProbeConcurrency = Number(
    process.env.STACK_PROBE_CONCURRENCY ?? 4,
  );
  private readonly stackProbeTimeoutMs = Number(
    process.env.STACK_PROBE_TIMEOUT_MS ?? 9000,
  );
  private readonly branchProbeLimit = Number(process.env.BRANCH_PROBE_LIMIT ?? 22);
  private readonly branchCommitProbeLimit = Number(
    process.env.BRANCH_COMMIT_PROBE_LIMIT ?? 90,
  );
  private readonly branchProbeConcurrency = Number(
    process.env.BRANCH_PROBE_CONCURRENCY ?? 4,
  );
  private readonly importableExtensions = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.vue',
    '.svelte',
  ]);
  private readonly ignoredImportFolders = new Set([
    'node_modules',
    'vendor',
    'vendors',
    'third_party',
    'third-party',
    'dist',
    'build',
    'out',
    'coverage',
    'public',
    'static',
    'generated',
    '__generated__',
    'lib',
    'libs',
  ]);
  private readonly resolveExtensions = [
    '',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '/index.ts',
    '/index.tsx',
    '/index.js',
    '/index.jsx',
    '/index.mjs',
    '/index.cjs',
  ];

  constructor(
    private readonly githubService: GithubService,
    private readonly cacheService: RepoCacheService,
    private readonly layoutService: LayoutService,
  ) {}

  async parseRepository(
    repoUrl: string,
    emitProgress: (progress: ParseProgress) => void,
    emitPartial?: (partial: RepositoryPartialResult) => void,
    shouldContinue?: () => boolean,
    githubToken?: string,
  ): Promise<RepositoryResult> {
    const parseStartedAt = Date.now();
    const githubRequestsBefore = this.githubService.getTotalRequestCount();
    const stageMs: Record<string, number> = {};
    const markStage = (name: string, startedAt: number) => {
      stageMs[name] = Date.now() - startedAt;
    };
    const assertActive = () => {
      if (shouldContinue && !shouldContinue()) {
        throw new ParseCancelledError();
      }
    };

    assertActive();
    emitProgress({
      stage: 'validating',
      message: 'Validating repository URL',
      percent: 2,
    });

    const { owner, repo, normalizedUrl } = parseGithubRepoUrl(repoUrl);
    const repositoryMeta = {
      owner,
      repo,
      url: normalizedUrl,
    };
    const requestedMode = this.maxCommits > 0 ? 'limited' : 'full';

    assertActive();
    emitProgress({
      stage: 'checking_cache',
      message: 'Checking cache',
      percent: 5,
    });

    const cached = await this.cacheService.getAny(normalizedUrl);
    if (cached?.isFresh) {
      emitProgress({
        stage: 'done',
        message: 'Loaded from cache',
        percent: 100,
      });

      return cached.payload;
    }

    assertActive();
    emitProgress({
      stage: 'fetching_commits',
      message: this.maxCommits > 0
        ? `Fetching commits (limit ${this.maxCommits})`
        : 'Fetching full commit history',
      percent: 12,
    });

    const filesMap = new Map<string, FileHistory>();
    const messageBranchSignalMap = new Map<string, { commits: number; latestTs: number }>();
    const detailsConcurrency = Math.max(1, this.concurrency);
    let processedCommits = 0;
    let skippedCommits = 0;
    let estimatedTotalCommits = 0;
    let detailStageStarted = false;
    let lastCommitFetchPercent = -1;

    let commitList;
    const commitStageStartedAt = Date.now();
    try {
      commitList = await this.githubService.fetchCommits(
        owner,
        repo,
        this.maxCommits,
        cached?.etag,
        ({ page, totalPages, fetchedCommits }) => {
          assertActive();
          const percent = this.resolveCommitFetchPercent(page, totalPages);
          const shouldEmit = page === 1 || percent > lastCommitFetchPercent;
          if (!shouldEmit) {
            return;
          }

          lastCommitFetchPercent = percent;
          emitProgress({
            stage: 'fetching_commits',
            message: this.buildCommitFetchMessage(page, totalPages, fetchedCommits),
            percent,
          });
        },
        async ({ page, totalPages, fetchedCommits, pageCommits }) => {
          assertActive();
          if (!detailStageStarted) {
            detailStageStarted = true;
            emitProgress({
              stage: 'fetching_commit_details',
              message: 'Streaming commit details (0)',
              percent: 20,
            });
          }

          estimatedTotalCommits = this.resolveEstimatedTotalCommits(
            fetchedCommits,
            totalPages,
            pageCommits.length,
          );

          const pageChunks = this.chunk(
            pageCommits.map((item) => item.sha),
            detailsConcurrency,
          );

          for (const chunk of pageChunks) {
            assertActive();
            const settled = await Promise.allSettled(
              chunk.map((sha) =>
                this.githubService.fetchCommitDetails(owner, repo, sha, githubToken),
              ),
            );
            const detailsChunk: CommitDetails[] = [];
            settled.forEach((result) => {
              if (result.status === 'fulfilled') {
                detailsChunk.push(result.value);
                return;
              }

              if (this.isRateLimitError(result.reason)) {
                throw result.reason;
              }

              skippedCommits += 1;
            });

            if (detailsChunk.length > 0) {
              captureBranchSignalsFromCommits(messageBranchSignalMap, detailsChunk);
              this.mergeCommitDetails(filesMap, detailsChunk);
            }

            processedCommits += chunk.length;
          }

          emitProgress({
            stage: 'fetching_commit_details',
            message: this.buildCommitDetailsMessage(
              page,
              totalPages,
              processedCommits,
              estimatedTotalCommits,
              skippedCommits,
            ),
            percent: this.resolveCommitDetailsPercent(
              processedCommits,
              estimatedTotalCommits,
            ),
          });

          if (emitPartial && filesMap.size > 0) {
            emitPartial(
              this.buildPartialRepositoryResult(
                repositoryMeta,
                estimatedTotalCommits,
                processedCommits,
                filesMap,
                buildBranchSignals(messageBranchSignalMap),
              ),
            );
          }
        },
        {
          maxPages: this.maxCommits > 0 ? 0 : this.fullHistoryMaxPages,
          maxDurationMs: this.maxCommits > 0 ? 0 : this.fullHistoryMaxMs,
          shouldContinue,
        },
        githubToken,
      );
    } catch (error) {
      if (error instanceof ParseCancelledError) {
        throw error;
      }

      if (cached?.payload) {
        emitProgress({
          stage: 'done',
          message: 'GitHub API unavailable, using stale cache',
          percent: 100,
        });

        return cached.payload;
      }

      throw error;
    } finally {
      markStage('commit_history', commitStageStartedAt);
    }

    assertActive();
    if (commitList.notModified && cached) {
      await this.cacheService.touch(normalizedUrl);

      emitProgress({
        stage: 'done',
        message: 'No changes since last fetch (ETag)',
        percent: 100,
      });

      return cached.payload;
    }

    assertActive();
    if (commitList.commits.length === 0) {
      throw new NotFoundException('No commits found for this repository.');
    }

    if (commitList.truncated && commitList.warning) {
      this.logger.warn(commitList.warning);
      emitProgress({
        stage: 'fetching_commit_details',
        message: commitList.warning,
        percent: Math.max(
          80,
          this.resolveCommitDetailsPercent(
            processedCommits,
            Math.max(estimatedTotalCommits, commitList.commits.length),
          ),
        ),
      });
    }

    const commitsSet = new Set(commitList.commits.map((item) => item.sha));

    const branchStageStartedAt = Date.now();
    emitProgress({
      stage: 'analyzing_branches',
      message: 'Indexing branch references',
      percent: 89,
    });
    const branchReferenceResult = await this.buildBranchReferences(
      owner,
      repo,
      commitsSet,
      assertActive,
      (done, total) => {
        const ratio = total === 0 ? 1 : done / total;
        emitProgress({
          stage: 'analyzing_branches',
          message: `Indexing branches (${done}/${total})`,
          percent: 89 + Math.floor(ratio),
        });
      },
      githubToken,
    );
    markStage('branches', branchStageStartedAt);
    this.applyBranchReferences(filesMap, branchReferenceResult.bySha);
    const branchSignalMap = this.mergeBranchSignalMaps(
      messageBranchSignalMap,
      branchReferenceResult.signals,
    );

    assertActive();
    emitProgress({
      stage: 'building_structure',
      message: 'Building file history',
      percent: 90,
    });

    const fileHistories = this.mapFileHistories(filesMap, true);
    const refSha = commitList.commits[0]?.sha;

    const stackStageStartedAt = Date.now();
    assertActive();
    emitProgress({
      stage: 'analyzing_stack',
      message: 'Analyzing stack passport (0%)',
      percent: 91,
    });

    const stackResult = await this.buildStackPassport(
      owner,
      repo,
      refSha,
      fileHistories,
      assertActive,
      (done, total) => {
        const ratio = total === 0 ? 1 : done / total;
        emitProgress({
          stage: 'analyzing_stack',
          message: `Analyzing stack passport (${done}/${total})`,
          percent: 91 + Math.floor(ratio * 2),
        });
      },
      githubToken,
    );
    markStage('stack', stackStageStartedAt);

    const importsStageStartedAt = Date.now();
    assertActive();
    emitProgress({
      stage: 'analyzing_imports',
      message: 'Analyzing import roads (0%)',
      percent: 93,
    });

    const importRoadResult = await this.buildImportRoads(
      owner,
      repo,
      refSha,
      fileHistories,
      assertActive,
      (done, total) => {
        const ratio = total === 0 ? 1 : done / total;
        emitProgress({
          stage: 'analyzing_imports',
          message: `Analyzing import roads (${done}/${total})`,
          percent: 93 + Math.floor(ratio * 3),
        });
      },
      githubToken,
    );
    if (importRoadResult.truncated) {
      this.logger.warn(importRoadResult.truncatedReason ?? 'Import analysis truncated.');
      emitProgress({
        stage: 'analyzing_imports',
        message:
          importRoadResult.truncatedReason ??
          `Import analysis truncated (${importRoadResult.scanned}/${importRoadResult.candidates})`,
        percent: 95,
      });
    }
    markStage('imports', importsStageStartedAt);

    const layoutStageStartedAt = Date.now();
    assertActive();
    emitProgress({
      stage: 'layouting',
      message: 'Calculating city layout',
      percent: 96,
    });

    const positionedFiles = this.layoutService.positionFiles(fileHistories);
    markStage('layout', layoutStageStartedAt);
    const branchSignals = buildBranchSignals(branchSignalMap);
    const githubRequestsAfter = this.githubService.getTotalRequestCount();
    markStage('total', parseStartedAt);
    const analysis: RepositoryAnalysis = {
      commitHistory: {
        requestedMode,
        fetchedCommits: commitList.commits.length,
        pagesFetched: commitList.pagesFetched ?? 0,
        totalPagesEstimated: commitList.totalPagesEstimated ?? null,
        truncated: Boolean(commitList.truncated),
        truncatedReason: commitList.truncatedReason ?? null,
        skippedDetails: skippedCommits,
      },
      imports: {
        candidates: importRoadResult.candidates,
        scanned: importRoadResult.scanned,
        roads: importRoadResult.roads.length,
        truncated: importRoadResult.truncated,
        truncatedReason: importRoadResult.truncatedReason,
      },
      stack: {
        candidates: stackResult.candidates,
        scanned: stackResult.scanned,
        truncated: stackResult.truncated,
        truncatedReason: stackResult.truncatedReason,
      },
      branches: {
        source:
          branchReferenceResult.signals.size > 0 && messageBranchSignalMap.size > 0
            ? 'mixed'
            : branchReferenceResult.signals.size > 0
              ? 'refs'
              : 'messages',
        sampledBranches: branchReferenceResult.sampledBranches,
        sampledCommits: branchReferenceResult.sampledCommits,
      },
      diagnostics: {
        githubRequests: Math.max(0, githubRequestsAfter - githubRequestsBefore),
        stageMs,
        generatedAt: new Date().toISOString(),
      },
    };

    const result: RepositoryResult = {
      repository: repositoryMeta,
      generatedAt: new Date().toISOString(),
      totalCommits: commitList.commits.length,
      files: positionedFiles,
      imports: importRoadResult.roads,
      branches: branchSignals,
      stack: stackResult.passport,
      analysis,
    };

    await this.cacheService.save(normalizedUrl, result, commitList.etag);

    emitProgress({
      stage: 'done',
      message: 'City is ready',
      percent: 100,
    });

    return result;
  }

  private buildPartialRepositoryResult(
    repository: { owner: string; repo: string; url: string },
    totalCommits: number,
    processedCommits: number,
    filesMap: Map<string, FileHistory>,
    branchSignals: BranchSignal[],
  ): RepositoryPartialResult {
    const previewFiles = this.layoutService.positionFiles(
      this.mapFileHistories(filesMap, false),
    );

    return {
      repository,
      generatedAt: new Date().toISOString(),
      totalCommits,
      processedCommits,
      final: false,
      files: previewFiles,
      imports: [],
      branches: branchSignals,
      stack: this.createEmptyStackPassport(),
      analysis: this.createEmptyAnalysis(),
    };
  }

  private mapFileHistories(
    filesMap: Map<string, FileHistory>,
    sortCommits: boolean,
  ): FileHistory[] {
    return Array.from(filesMap.values()).map((file) => ({
      ...file,
      commits: sortCommits
        ? [...file.commits].sort((a, b) => +new Date(a.date) - +new Date(b.date))
        : file.commits,
    }));
  }

  private isRateLimitError(error: any): boolean {
    const status = Number(
      error?.status ??
      (typeof error?.getStatus === 'function' ? error.getStatus() : NaN),
    );
    const message = String(error?.message ?? '').toLowerCase();

    if (status === 429) {
      return true;
    }

    return (
      status === 403 &&
      (message.includes('rate limit') || message.includes('quota exceeded'))
    );
  }

  private buildCommitFetchMessage(
    page: number,
    totalPages: number | null,
    fetchedCommits: number,
  ): string {
    const targetPages = this.resolveFetchTargetPages(totalPages);

    if (totalPages && targetPages && targetPages < totalPages) {
      return `Fetching commit pages (${page}/${totalPages}, target ${targetPages}), loaded ${fetchedCommits}`;
    }

    if (totalPages) {
      return `Fetching commit pages (${page}/${totalPages}), loaded ${fetchedCommits}`;
    }

    if (targetPages) {
      return `Fetching commit pages (${page}/~${targetPages}), loaded ${fetchedCommits}`;
    }

    return `Fetching commit pages (${page}), loaded ${fetchedCommits}`;
  }

  private resolveCommitFetchPercent(
    page: number,
    totalPages: number | null,
  ): number {
    const targetPages = this.resolveFetchTargetPages(totalPages);
    if (targetPages && targetPages > 0) {
      const ratio = Math.min(1, page / targetPages);
      return 12 + Math.floor(Math.sqrt(ratio) * 7);
    }

    if (totalPages && totalPages > 0) {
      const ratio = Math.min(1, page / totalPages);
      return 12 + Math.floor(Math.sqrt(ratio) * 7);
    }

    return Math.min(19, 12 + Math.floor(Math.log2(page + 1) * 1.8));
  }

  private resolveFetchTargetPages(totalPages: number | null): number | null {
    if (this.maxCommits > 0) {
      return totalPages;
    }

    if (this.fullHistoryMaxPages > 0) {
      if (totalPages && totalPages > 0) {
        return Math.min(totalPages, this.fullHistoryMaxPages);
      }

      return this.fullHistoryMaxPages;
    }

    return totalPages;
  }

  private resolveEstimatedTotalCommits(
    fetchedCommits: number,
    totalPages: number | null,
    pageSize: number,
  ): number {
    if (totalPages && totalPages > 0) {
      let cappedPages = totalPages;
      if (this.maxCommits > 0) {
        cappedPages = Math.min(totalPages, Math.max(1, Math.ceil(this.maxCommits / 100)));
      } else if (this.fullHistoryMaxPages > 0) {
        cappedPages = Math.min(totalPages, this.fullHistoryMaxPages);
      }

      const estimatedUpperBound = cappedPages * 100;
      // If we already know we're on the last page, tighten the estimate.
      if (pageSize < 100 && cappedPages === totalPages) {
        return Math.max(
          fetchedCommits,
          (totalPages - 1) * 100 + pageSize,
        );
      }

      return Math.max(fetchedCommits, estimatedUpperBound);
    }

    return Math.max(fetchedCommits, this.maxCommits > 0 ? this.maxCommits : fetchedCommits);
  }

  private resolveCommitDetailsPercent(
    processedCommits: number,
    totalCommits: number,
  ): number {
    if (totalCommits <= 0) {
      return 20;
    }

    const ratio = Math.min(1, processedCommits / totalCommits);
    return Math.min(85, 20 + Math.floor(ratio * 65));
  }

  private buildCommitDetailsMessage(
    page: number,
    totalPages: number | null,
    processedCommits: number,
    totalCommits: number,
    skippedCommits: number,
  ): string {
    const pageToken = totalPages
      ? `page ${page}/${totalPages}`
      : `page ${page}`;

    const detailToken = totalCommits > 0
      ? `${processedCommits}/${totalCommits}`
      : `${processedCommits}`;

    if (skippedCommits > 0) {
      return `Streaming commit details (${pageToken}, ${detailToken}, skipped ${skippedCommits})`;
    }

    return `Streaming commit details (${pageToken}, ${detailToken})`;
  }

  private mergeBranchSignalMaps(
    messageSignals: Map<string, { commits: number; latestTs: number }>,
    refSignals: Map<string, { commits: number; latestTs: number }>,
  ): Map<string, { commits: number; latestTs: number }> {
    const merged = new Map<string, { commits: number; latestTs: number }>();

    const mergeOne = (source: Map<string, { commits: number; latestTs: number }>) => {
      source.forEach((value, key) => {
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, {
            commits: value.commits,
            latestTs: value.latestTs,
          });
          return;
        }

        existing.commits += value.commits;
        existing.latestTs = Math.max(existing.latestTs, value.latestTs);
      });
    };

    mergeOne(messageSignals);
    mergeOne(refSignals);

    return merged;
  }

  private async buildBranchReferences(
    owner: string,
    repo: string,
    commitSet: Set<string>,
    assertActive: () => void,
    onProgress: (done: number, total: number) => void,
    githubToken?: string,
  ): Promise<BranchReferenceBuildResult> {
    const empty: BranchReferenceBuildResult = {
      signals: new Map<string, { commits: number; latestTs: number }>(),
      bySha: new Map<string, string[]>(),
      sampledBranches: 0,
      sampledCommits: 0,
    };

    if (commitSet.size === 0 || this.branchProbeLimit <= 0) {
      onProgress(0, 0);
      return empty;
    }

    assertActive();
    const heads = await this.githubService.fetchBranches(
      owner,
      repo,
      this.branchProbeLimit,
      githubToken,
    );
    if (heads.length === 0) {
      onProgress(0, 0);
      return empty;
    }

    const byShaSet = new Map<string, Set<string>>();
    const signalMap = new Map<string, { commits: number; latestTs: number }>();
    const chunks = this.chunk(heads, Math.max(1, this.branchProbeConcurrency));
    let done = 0;
    let sampledCommits = 0;

    for (const chunk of chunks) {
      assertActive();
      const histories = await Promise.all(
        chunk.map((branch) =>
          this.withTimeout(
            this.githubService.fetchBranchCommits(
              owner,
              repo,
              branch.name,
              this.branchCommitProbeLimit,
              githubToken,
            ),
            this.importRequestTimeoutMs,
            [],
          ),
        ),
      );

      histories.forEach((history, index) => {
        done += 1;
        const branch = chunk[index];
        if (!branch) {
          return;
        }

        history.forEach((entry) => {
          sampledCommits += 1;
          if (!commitSet.has(entry.sha)) {
            return;
          }

          const branchName = normalizeBranchName(branch.name);
          if (!branchName) {
            return;
          }

          const existingSignal = signalMap.get(branchName);
          const ts = new Date(entry.date).getTime();
          const normalizedTs = Number.isFinite(ts) ? ts : Date.now();
          if (!existingSignal) {
            signalMap.set(branchName, {
              commits: 1,
              latestTs: normalizedTs,
            });
          } else {
            existingSignal.commits += 1;
            existingSignal.latestTs = Math.max(existingSignal.latestTs, normalizedTs);
          }

          const existingSha = byShaSet.get(entry.sha) ?? new Set<string>();
          existingSha.add(branchName);
          byShaSet.set(entry.sha, existingSha);
        });
      });

      onProgress(done, heads.length);
    }

    const bySha = new Map<string, string[]>();
    byShaSet.forEach((value, key) => {
      bySha.set(key, Array.from(value).sort());
    });

    return {
      signals: signalMap,
      bySha,
      sampledBranches: heads.length,
      sampledCommits,
    };
  }

  private applyBranchReferences(
    filesMap: Map<string, FileHistory>,
    bySha: Map<string, string[]>,
  ): void {
    filesMap.forEach((file) => {
      file.commits.forEach((floor) => {
        const fromRefs = bySha.get(floor.sha) ?? [];
        if (fromRefs.length > 0) {
          floor.branches = fromRefs;
          return;
        }

        const fromMessage = extractBranchNamesFromMessage(floor.message);
        if (fromMessage.length > 0) {
          floor.branches = fromMessage;
        }
      });
    });
  }

  private mergeCommitDetails(
    filesMap: Map<string, FileHistory>,
    commits: CommitDetails[],
  ): void {
    commits.forEach((commit) => {
      const branches = extractBranchNamesFromMessage(commit.message);

      commit.files.forEach((file) => {
        const status = this.normalizeFileStatus(file.status);
        const changes = file.additions + file.deletions;
        const isLifecycleEvent = status === 'removed' || status === 'renamed';
        if (changes === 0 && !isLifecycleEvent) {
          return;
        }

        const baseFloor: Omit<CommitFloor, 'additions' | 'deletions' | 'changes' | 'status' | 'previousPath'> = {
          sha: commit.sha,
          author: commit.author,
          date: commit.date,
          message: commit.message,
          branches,
        };

        if (
          status === 'renamed' &&
          file.previousFilename &&
          file.previousFilename !== file.filename
        ) {
          this.upsertFileFloor(filesMap, file.previousFilename, {
            ...baseFloor,
            additions: 0,
            deletions: 0,
            changes: 0,
            status: 'renamed_from',
            previousPath: file.filename,
          });
        }

        this.upsertFileFloor(filesMap, file.filename, {
          ...baseFloor,
          additions: file.additions,
          deletions: file.deletions,
          changes,
          status: status === 'renamed' ? 'renamed_to' : status,
          previousPath: file.previousFilename,
        });
      });
    });
  }

  private normalizeFileStatus(
    status: string | undefined,
  ): CommitFloor['status'] {
    const normalized = (status ?? '').trim().toLowerCase();
    if (!normalized) {
      return 'modified';
    }

    return normalized;
  }

  private upsertFileFloor(
    filesMap: Map<string, FileHistory>,
    filePath: string,
    floor: CommitFloor,
  ): void {
    const existing = filesMap.get(filePath);

    if (!existing) {
      const folder = path.posix.dirname(filePath);
      filesMap.set(filePath, {
        path: filePath,
        folder: folder === '.' ? 'root' : folder,
        commits: [floor],
        totalChanges: floor.changes,
        totalAdditions: floor.additions,
        totalDeletions: floor.deletions,
      });
      return;
    }

    existing.commits.push(floor);
    existing.totalChanges += floor.changes;
    existing.totalAdditions += floor.additions;
    existing.totalDeletions += floor.deletions;
  }

  private createEmptyStackPassport(): StackPassport {
    return {
      runtimes: [],
      frameworks: [],
      tooling: [],
      infrastructure: [],
      ci: [],
      databases: [],
      sources: [],
      signals: [],
    };
  }

  private createEmptyAnalysis(): RepositoryAnalysis {
    return {
      commitHistory: {
        requestedMode: this.maxCommits > 0 ? 'limited' : 'full',
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
        generatedAt: new Date(0).toISOString(),
      },
    };
  }

  private async buildStackPassport(
    owner: string,
    repo: string,
    ref: string | undefined,
    files: FileHistory[],
    assertActive: () => void,
    onProgress: (done: number, total: number) => void,
    githubToken?: string,
  ): Promise<StackPassportBuildResult> {
    const passport = this.createEmptyStackPassport();
    const candidates = this.collectStackManifestCandidates(files);

    if (!ref || candidates.length === 0) {
      onProgress(0, 0);
      return {
        passport,
        candidates: candidates.length,
        scanned: 0,
        truncated: false,
        truncatedReason: null,
      };
    }

    const bucketScores: Record<StackBucketName, Map<string, number>> = {
      runtimes: new Map<string, number>(),
      frameworks: new Map<string, number>(),
      tooling: new Map<string, number>(),
      infrastructure: new Map<string, number>(),
      ci: new Map<string, number>(),
      databases: new Map<string, number>(),
    };
    const signalScores = new Map<
      string,
      {
        category: StackCategory;
        name: string;
        source: string;
        confidence: number;
      }
    >();
    const sourceSet = new Set<string>();

    const addSignal = (
      category: StackCategory,
      name: string,
      source: string,
      confidence = 0.75,
    ) => {
      this.addStackSignal(
        bucketScores,
        signalScores,
        sourceSet,
        category,
        name,
        source,
        confidence,
      );
    };

    const chunks = this.chunk(
      candidates,
      Math.max(1, this.stackProbeConcurrency),
    );
    let done = 0;
    let truncated = false;
    let truncatedReason: string | null = null;

    for (const chunk of chunks) {
      assertActive();
      const contentChunk = await Promise.all(
        chunk.map((item) =>
          this.withTimeout(
            this.githubService.fetchFileContent(owner, repo, item.path, ref, githubToken),
            this.stackProbeTimeoutMs,
            null,
          ),
        ),
      );

      contentChunk.forEach((result, index) => {
        done += 1;
        const candidate = chunk[index];
        if (!candidate || !result?.content) {
          return;
        }

        const content = result.content.slice(0, this.importSourceCharLimit);
        sourceSet.add(candidate.path);
        this.parseManifestSignals(candidate.kind, candidate.path, content, addSignal);
      });

      onProgress(done, candidates.length);
    }

    if (done < candidates.length) {
      truncated = true;
      truncatedReason = `Stack analysis truncated (${done}/${candidates.length})`;
    }

    passport.runtimes = this.finalizeStackBucket(bucketScores.runtimes, 8);
    passport.frameworks = this.finalizeStackBucket(bucketScores.frameworks, 10);
    passport.tooling = this.finalizeStackBucket(bucketScores.tooling, 10);
    passport.infrastructure = this.finalizeStackBucket(
      bucketScores.infrastructure,
      8,
    );
    passport.ci = this.finalizeStackBucket(bucketScores.ci, 5);
    passport.databases = this.finalizeStackBucket(bucketScores.databases, 8);
    passport.sources = Array.from(sourceSet).sort().slice(0, 40);
    passport.signals = Array.from(signalScores.values())
      .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
      .slice(0, 90);

    return {
      passport,
      candidates: candidates.length,
      scanned: done,
      truncated,
      truncatedReason,
    };
  }

  private collectStackManifestCandidates(
    files: FileHistory[],
  ): Array<{ path: string; kind: ManifestKind; weight: number }> {
    const candidates = files
      .map((file) => {
        const kind = this.detectManifestKind(file.path);
        if (!kind) {
          return null;
        }

        const depth = file.path.split('/').length;
        const rootBonus = depth <= 2 ? 30 : Math.max(0, 14 - depth);
        const commitWeight = Math.min(24, file.commits.length * 1.5);
        const kindWeight =
          kind === 'package_json'
            ? 130
            : kind === 'requirements' || kind === 'pyproject'
              ? 124
              : kind === 'pom_xml' || kind === 'go_mod' || kind === 'cargo_toml'
                ? 120
                : kind === 'dockerfile'
                  ? 116
                  : kind === 'compose'
                    ? 110
                    : kind === 'ci'
                      ? 106
                      : 90;

        return {
          path: file.path,
          kind,
          weight: kindWeight + rootBonus + commitWeight,
        };
      })
      .filter((item): item is { path: string; kind: ManifestKind; weight: number } => item !== null)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, this.stackProbeLimit);

    return candidates;
  }

  private detectManifestKind(filePath: string): ManifestKind | null {
    const lower = filePath.toLowerCase();
    const basename = path.posix.basename(lower);

    if (basename === 'package.json') {
      return 'package_json';
    }

    if (
      basename === 'requirements.txt' ||
      (basename.startsWith('requirements') && basename.endsWith('.txt'))
    ) {
      return 'requirements';
    }

    if (basename === 'pyproject.toml') {
      return 'pyproject';
    }

    if (basename === 'pom.xml') {
      return 'pom_xml';
    }

    if (basename === 'go.mod') {
      return 'go_mod';
    }

    if (basename === 'cargo.toml') {
      return 'cargo_toml';
    }

    if (basename === 'dockerfile' || basename.startsWith('dockerfile.')) {
      return 'dockerfile';
    }

    if (
      basename === 'docker-compose.yml' ||
      basename === 'docker-compose.yaml' ||
      basename === 'compose.yml' ||
      basename === 'compose.yaml'
    ) {
      return 'compose';
    }

    if (
      lower.includes('/.github/workflows/') &&
      (basename.endsWith('.yml') || basename.endsWith('.yaml'))
    ) {
      return 'ci';
    }

    if (
      basename === '.gitlab-ci.yml' ||
      lower.includes('/.circleci/config.yml') ||
      lower.includes('/.azure-pipelines.yml')
    ) {
      return 'ci';
    }

    if (
      lower.includes('/k8s/') ||
      lower.includes('/kubernetes/') ||
      lower.includes('/helm/') ||
      basename === 'chart.yaml'
    ) {
      return 'generic';
    }

    return null;
  }

  private parseManifestSignals(
    kind: ManifestKind,
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    if (kind === 'package_json') {
      this.parsePackageJsonManifest(filePath, content, addSignal);
      return;
    }

    if (kind === 'requirements') {
      this.parseRequirementsManifest(filePath, content, addSignal);
      return;
    }

    if (kind === 'pyproject') {
      this.parsePyProjectManifest(filePath, content, addSignal);
      return;
    }

    if (kind === 'pom_xml') {
      this.parsePomManifest(filePath, content, addSignal);
      return;
    }

    if (kind === 'go_mod') {
      this.parseGoModManifest(filePath, content, addSignal);
      return;
    }

    if (kind === 'cargo_toml') {
      this.parseCargoManifest(filePath, content, addSignal);
      return;
    }

    if (kind === 'dockerfile') {
      this.parseDockerfileManifest(filePath, content, addSignal);
      return;
    }

    if (kind === 'compose') {
      this.parseComposeManifest(filePath, content, addSignal);
      return;
    }

    if (kind === 'ci') {
      this.parseCiManifest(filePath, content, addSignal);
      return;
    }

    this.parseGenericInfrastructureManifest(filePath, content, addSignal);
  }

  private parsePackageJsonManifest(
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return;
    }

    addSignal('runtime', 'Node.js', filePath, 0.95);

    const dependencySets = [
      parsed?.dependencies,
      parsed?.devDependencies,
      parsed?.peerDependencies,
      parsed?.optionalDependencies,
    ]
      .filter((deps) => deps && typeof deps === 'object')
      .flatMap((deps) => Object.keys(deps as Record<string, string>))
      .map((name) => name.toLowerCase());
    const dependencySet = new Set(dependencySets);

    const addByDependency = (
      depName: string,
      category: StackCategory,
      label: string,
      confidence = 0.82,
    ) => {
      if (dependencySet.has(depName)) {
        addSignal(category, label, filePath, confidence);
      }
    };

    addByDependency('react', 'framework', 'React');
    addByDependency('next', 'framework', 'Next.js');
    addByDependency('vue', 'framework', 'Vue');
    addByDependency('@angular/core', 'framework', 'Angular');
    addByDependency('svelte', 'framework', 'Svelte');
    addByDependency('@nestjs/core', 'framework', 'NestJS');
    addByDependency('nestjs', 'framework', 'NestJS');
    addByDependency('express', 'framework', 'Express');
    addByDependency('fastify', 'framework', 'Fastify');
    addByDependency('koa', 'framework', 'Koa');
    addByDependency('nuxt', 'framework', 'Nuxt');
    addByDependency('remix', 'framework', 'Remix');

    addByDependency('typescript', 'tooling', 'TypeScript');
    addByDependency('vite', 'tooling', 'Vite');
    addByDependency('webpack', 'tooling', 'Webpack');
    addByDependency('rollup', 'tooling', 'Rollup');
    addByDependency('@babel/core', 'tooling', 'Babel');
    addByDependency('eslint', 'tooling', 'ESLint');
    addByDependency('prettier', 'tooling', 'Prettier');
    addByDependency('jest', 'tooling', 'Jest');
    addByDependency('vitest', 'tooling', 'Vitest');
    addByDependency('turbo', 'tooling', 'Turborepo');
    addByDependency('nx', 'tooling', 'Nx');

    addByDependency('prisma', 'database', 'Prisma');
    addByDependency('sequelize', 'database', 'Sequelize');
    addByDependency('typeorm', 'database', 'TypeORM');
    addByDependency('mongoose', 'database', 'MongoDB');
    addByDependency('redis', 'database', 'Redis');
    addByDependency('pg', 'database', 'PostgreSQL');
    addByDependency('mysql2', 'database', 'MySQL');
    addByDependency('drizzle-orm', 'database', 'Drizzle ORM');

    const packageManager = String(parsed?.packageManager ?? '').toLowerCase();
    if (packageManager.includes('pnpm')) {
      addSignal('tooling', 'pnpm', filePath, 0.84);
    } else if (packageManager.includes('yarn')) {
      addSignal('tooling', 'Yarn', filePath, 0.84);
    } else if (packageManager.includes('npm')) {
      addSignal('tooling', 'npm', filePath, 0.8);
    }

    const scripts = Object.keys(parsed?.scripts ?? {})
      .map((value) => value.toLowerCase())
      .join(' ');
    if (scripts.includes('vite')) {
      addSignal('tooling', 'Vite', filePath, 0.7);
    }
    if (scripts.includes('webpack')) {
      addSignal('tooling', 'Webpack', filePath, 0.7);
    }
    if (scripts.includes('test')) {
      addSignal('tooling', 'Test scripts', filePath, 0.55);
    }
  }

  private parseRequirementsManifest(
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    addSignal('runtime', 'Python', filePath, 0.95);
    const normalized = content
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => line.split(/(?:[<>=!~]|\[)/)[0]?.trim() ?? '')
      .filter((line) => line.length > 0);
    const deps = new Set(normalized);

    const addIf = (
      dep: string,
      category: StackCategory,
      label: string,
      confidence = 0.82,
    ) => {
      if (deps.has(dep)) {
        addSignal(category, label, filePath, confidence);
      }
    };

    addIf('django', 'framework', 'Django');
    addIf('flask', 'framework', 'Flask');
    addIf('fastapi', 'framework', 'FastAPI');
    addIf('pytest', 'tooling', 'Pytest');
    addIf('black', 'tooling', 'Black');
    addIf('ruff', 'tooling', 'Ruff');
    addIf('mypy', 'tooling', 'mypy');
    addIf('sqlalchemy', 'database', 'SQLAlchemy');
    addIf('psycopg2', 'database', 'PostgreSQL');
    addIf('asyncpg', 'database', 'PostgreSQL');
    addIf('pymongo', 'database', 'MongoDB');
    addIf('redis', 'database', 'Redis');
  }

  private parsePyProjectManifest(
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    const lower = content.toLowerCase();
    addSignal('runtime', 'Python', filePath, 0.93);

    if (lower.includes('[tool.poetry]')) {
      addSignal('tooling', 'Poetry', filePath, 0.88);
    }

    if (lower.includes('fastapi')) {
      addSignal('framework', 'FastAPI', filePath, 0.85);
    }
    if (lower.includes('django')) {
      addSignal('framework', 'Django', filePath, 0.85);
    }
    if (lower.includes('flask')) {
      addSignal('framework', 'Flask', filePath, 0.85);
    }
    if (lower.includes('pytest')) {
      addSignal('tooling', 'Pytest', filePath, 0.82);
    }
    if (lower.includes('sqlalchemy')) {
      addSignal('database', 'SQLAlchemy', filePath, 0.8);
    }
  }

  private parsePomManifest(
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    const lower = content.toLowerCase();
    addSignal('runtime', 'Java', filePath, 0.94);
    addSignal('tooling', 'Maven', filePath, 0.9);

    if (lower.includes('spring-boot') || lower.includes('org.springframework')) {
      addSignal('framework', 'Spring', filePath, 0.88);
    }
    if (lower.includes('quarkus')) {
      addSignal('framework', 'Quarkus', filePath, 0.84);
    }
    if (lower.includes('micronaut')) {
      addSignal('framework', 'Micronaut', filePath, 0.84);
    }
    if (lower.includes('junit')) {
      addSignal('tooling', 'JUnit', filePath, 0.78);
    }
    if (lower.includes('hibernate')) {
      addSignal('database', 'Hibernate', filePath, 0.76);
    }
    if (lower.includes('postgresql')) {
      addSignal('database', 'PostgreSQL', filePath, 0.75);
    }
    if (lower.includes('mysql')) {
      addSignal('database', 'MySQL', filePath, 0.75);
    }
  }

  private parseGoModManifest(
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    const lower = content.toLowerCase();
    addSignal('runtime', 'Go', filePath, 0.95);
    addSignal('tooling', 'Go modules', filePath, 0.88);

    if (lower.includes('gin-gonic/gin')) {
      addSignal('framework', 'Gin', filePath, 0.86);
    }
    if (lower.includes('labstack/echo')) {
      addSignal('framework', 'Echo', filePath, 0.86);
    }
    if (lower.includes('gofiber/fiber')) {
      addSignal('framework', 'Fiber', filePath, 0.86);
    }
    if (lower.includes('gorm.io/gorm')) {
      addSignal('database', 'GORM', filePath, 0.82);
    }
    if (lower.includes('jackc/pgx')) {
      addSignal('database', 'PostgreSQL', filePath, 0.8);
    }
    if (lower.includes('go-redis/redis')) {
      addSignal('database', 'Redis', filePath, 0.78);
    }
  }

  private parseCargoManifest(
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    const lower = content.toLowerCase();
    addSignal('runtime', 'Rust', filePath, 0.95);
    addSignal('tooling', 'Cargo', filePath, 0.9);

    if (lower.includes('actix-web')) {
      addSignal('framework', 'Actix', filePath, 0.86);
    }
    if (lower.includes('rocket')) {
      addSignal('framework', 'Rocket', filePath, 0.84);
    }
    if (lower.includes('axum')) {
      addSignal('framework', 'Axum', filePath, 0.84);
    }
    if (lower.includes('warp')) {
      addSignal('framework', 'Warp', filePath, 0.84);
    }
    if (lower.includes('sqlx')) {
      addSignal('database', 'SQLx', filePath, 0.8);
    }
    if (lower.includes('diesel')) {
      addSignal('database', 'Diesel', filePath, 0.8);
    }
    if (lower.includes('mongodb')) {
      addSignal('database', 'MongoDB', filePath, 0.76);
    }
  }

  private parseDockerfileManifest(
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    const lower = content.toLowerCase();
    addSignal('infrastructure', 'Docker', filePath, 0.96);

    for (const line of lower.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('from ')) {
        continue;
      }

      if (trimmed.includes('node')) {
        addSignal('runtime', 'Node.js', filePath, 0.8);
      } else if (trimmed.includes('python')) {
        addSignal('runtime', 'Python', filePath, 0.8);
      } else if (trimmed.includes('golang')) {
        addSignal('runtime', 'Go', filePath, 0.8);
      } else if (trimmed.includes('openjdk') || trimmed.includes('eclipse-temurin')) {
        addSignal('runtime', 'Java', filePath, 0.8);
      } else if (trimmed.includes('rust')) {
        addSignal('runtime', 'Rust', filePath, 0.8);
      }

      if (trimmed.includes('nginx')) {
        addSignal('infrastructure', 'Nginx', filePath, 0.72);
      }
    }
  }

  private parseComposeManifest(
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    const lower = content.toLowerCase();
    addSignal('infrastructure', 'Docker Compose', filePath, 0.92);
    if (lower.includes('postgres')) {
      addSignal('database', 'PostgreSQL', filePath, 0.8);
    }
    if (lower.includes('redis')) {
      addSignal('database', 'Redis', filePath, 0.8);
    }
    if (lower.includes('mysql')) {
      addSignal('database', 'MySQL', filePath, 0.8);
    }
    if (lower.includes('mongo')) {
      addSignal('database', 'MongoDB', filePath, 0.8);
    }
  }

  private parseCiManifest(
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    const lowerPath = filePath.toLowerCase();
    const lower = content.toLowerCase();

    if (lowerPath.includes('.github/workflows/')) {
      addSignal('ci', 'GitHub Actions', filePath, 0.94);
    } else if (lowerPath.includes('.gitlab-ci.yml')) {
      addSignal('ci', 'GitLab CI', filePath, 0.94);
    } else if (lowerPath.includes('.circleci/')) {
      addSignal('ci', 'CircleCI', filePath, 0.94);
    } else {
      addSignal('ci', 'CI pipeline', filePath, 0.8);
    }

    if (lower.includes('actions/setup-node') || lower.includes('node-version')) {
      addSignal('runtime', 'Node.js', filePath, 0.74);
    }
    if (lower.includes('actions/setup-python') || lower.includes('python-version')) {
      addSignal('runtime', 'Python', filePath, 0.74);
    }
    if (lower.includes('actions/setup-go') || lower.includes('go-version')) {
      addSignal('runtime', 'Go', filePath, 0.74);
    }
    if (lower.includes('actions/setup-java') || lower.includes('java-version')) {
      addSignal('runtime', 'Java', filePath, 0.74);
    }
    if (lower.includes('docker/build-push-action') || lower.includes('docker build')) {
      addSignal('infrastructure', 'Docker', filePath, 0.7);
    }
  }

  private parseGenericInfrastructureManifest(
    filePath: string,
    content: string,
    addSignal: (
      category: StackCategory,
      name: string,
      source: string,
      confidence?: number,
    ) => void,
  ): void {
    const lower = content.toLowerCase();
    const lowerPath = filePath.toLowerCase();

    if (
      lowerPath.includes('/k8s/') ||
      lowerPath.includes('/kubernetes/') ||
      lowerPath.includes('/helm/') ||
      lower.includes('kind: deployment') ||
      lower.includes('apiVersion: apps/v1'.toLowerCase())
    ) {
      addSignal('infrastructure', 'Kubernetes', filePath, 0.84);
    }
  }

  private addStackSignal(
    bucketScores: Record<StackBucketName, Map<string, number>>,
    signalScores: Map<
      string,
      {
        category: StackCategory;
        name: string;
        source: string;
        confidence: number;
      }
    >,
    sourceSet: Set<string>,
    category: StackCategory,
    rawName: string,
    source: string,
    confidence = 0.75,
  ): void {
    const name = rawName.trim();
    if (!name) {
      return;
    }

    const cappedConfidence = Math.max(0.1, Math.min(1, confidence));
    const bucket = this.stackBucketFromCategory(category);
    bucketScores[bucket].set(
      name,
      (bucketScores[bucket].get(name) ?? 0) + cappedConfidence,
    );

    const signalKey = `${category}:${name}:${source}`;
    const existing = signalScores.get(signalKey);
    if (!existing || existing.confidence < cappedConfidence) {
      signalScores.set(signalKey, {
        category,
        name,
        source,
        confidence: cappedConfidence,
      });
    }

    sourceSet.add(source);
  }

  private stackBucketFromCategory(category: StackCategory): StackBucketName {
    if (category === 'runtime') {
      return 'runtimes';
    }
    if (category === 'framework') {
      return 'frameworks';
    }
    if (category === 'tooling') {
      return 'tooling';
    }
    if (category === 'infrastructure') {
      return 'infrastructure';
    }
    if (category === 'ci') {
      return 'ci';
    }
    return 'databases';
  }

  private finalizeStackBucket(scores: Map<string, number>, limit: number): string[] {
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([name]) => name);
  }

  private chunk<T>(input: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < input.length; index += size) {
      chunks.push(input.slice(index, index + size));
    }
    return chunks;
  }

  private async buildImportRoads(
    owner: string,
    repo: string,
    ref: string | undefined,
    files: FileHistory[],
    assertActive: () => void,
    onProgress: (done: number, total: number) => void,
    githubToken?: string,
  ): Promise<ImportRoadBuildResult> {
    const roadEligibleFiles = files.filter(
      (file) =>
        this.isImportableFile(file.path) &&
        !this.isIgnoredForImportRoads(file.path),
    );
    const fileSet = new Set(roadEligibleFiles.map((item) => item.path));
    const candidates = roadEligibleFiles
      .sort((a, b) => b.commits.length - a.commits.length)
      .slice(0, this.importScanLimit);

    if (!ref || candidates.length === 0) {
      onProgress(0, 0);
      return {
        roads: [],
        candidates: candidates.length,
        scanned: 0,
        truncated: false,
        truncatedReason: null,
      };
    }

    const edgeWeights = new Map<string, number>();
    const chunks = this.chunk(candidates, this.importConcurrency);
    const startedAt = Date.now();

    let done = 0;
    let truncated = false;
    let truncatedReason: string | null = null;
    for (const chunk of chunks) {
      assertActive();
      if (Date.now() - startedAt > this.importAnalysisTimeoutMs) {
        truncated = true;
        truncatedReason = `Import analysis truncated by time budget (${done}/${candidates.length})`;
        break;
      }

      const contentChunk = await Promise.all(
        chunk.map((file) =>
          this.withTimeout(
            this.githubService.fetchFileContent(
              owner,
              repo,
              file.path,
              ref,
              githubToken,
            ),
            this.importRequestTimeoutMs,
            null,
          ),
        ),
      );

      contentChunk.forEach((result, index) => {
        done += 1;
        const sourcePath = chunk[index].path;

        if (!result?.content) {
          return;
        }

        const source = result.content.slice(0, this.importSourceCharLimit);
        const imports = this.extractImportSpecifiers(source);
        imports.forEach((specifier) => {
          const target = this.resolveRelativeImportTarget(sourcePath, specifier, fileSet);
          if (!target || target === sourcePath) {
            return;
          }

          const key = `${sourcePath}=>${target}`;
          edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
        });
      });

      onProgress(done, candidates.length);
    }

    const roads = Array.from(edgeWeights.entries())
      .map(([key, count]) => {
        const [from, to] = key.split('=>');
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 600);

    return {
      roads,
      candidates: candidates.length,
      scanned: done,
      truncated,
      truncatedReason,
    };
  }

  private isImportableFile(filePath: string): boolean {
    const extension = path.posix.extname(filePath).toLowerCase();
    return this.importableExtensions.has(extension);
  }

  private isIgnoredForImportRoads(filePath: string): boolean {
    const parts = filePath.split('/').map((part) => part.toLowerCase());
    return parts.some((part) => this.ignoredImportFolders.has(part));
  }

  private extractImportSpecifiers(source: string): string[] {
    const specifiers = new Set<string>();
    const patterns = [
      /import\s+[^'"`]*?from\s*['"]([^'"`]+)['"]/g,
      /export\s+[^'"`]*?from\s*['"]([^'"`]+)['"]/g,
      /require\(\s*['"]([^'"`]+)['"]\s*\)/g,
      /import\(\s*['"]([^'"`]+)['"]\s*\)/g,
    ];

    patterns.forEach((pattern) => {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1]?.trim();
        if (specifier) {
          specifiers.add(specifier);
        }
      }
    });

    return Array.from(specifiers);
  }

  private resolveRelativeImportTarget(
    fromPath: string,
    specifier: string,
    fileSet: Set<string>,
  ): string | null {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
      return null;
    }

    const baseDir = path.posix.dirname(fromPath);
    const resolvedBase = path.posix.normalize(path.posix.join(baseDir, specifier));

    for (const suffix of this.resolveExtensions) {
      const candidate = path.posix.normalize(`${resolvedBase}${suffix}`);
      if (fileSet.has(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T,
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    const guarded = promise.catch(() => fallback);
    const timeout = new Promise<T>((resolve) => {
      timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
    });

    const result = await Promise.race([guarded, timeout]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return result;
  }
}
