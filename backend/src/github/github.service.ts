import {
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Octokit } from 'octokit';
import {
  BranchCommitSummary,
  BranchHead,
  CommitDetails,
  CommitListResult,
  FileContentResult,
} from './github.types';

interface FetchCommitOptions {
  maxPages?: number;
  maxDurationMs?: number;
  shouldContinue?: () => boolean;
}

@Injectable()
export class GithubService {
  private readonly defaultOctokit: Octokit;
  private readonly defaultToken: string;
  private currentTokenClient: { token: string; octokit: Octokit } | null = null;
  private requestCount = 0;
  private readonly maxFileBytes = Number(
    process.env.GITHUB_CONTENT_MAX_BYTES ?? 350000,
  );
  private readonly requestTimeoutMs = Number(
    process.env.GITHUB_REQUEST_TIMEOUT_MS ?? 120000,
  );
  private readonly requestRetries = Number(process.env.GITHUB_REQUEST_RETRIES ?? 2);
  private readonly retryBaseDelayMs = Number(
    process.env.GITHUB_RETRY_BASE_DELAY_MS ?? 1200,
  );

  constructor() {
    this.defaultToken = (process.env.GITHUB_TOKEN ?? '').trim();
    this.defaultOctokit = this.createOctokit(
      this.defaultToken.length > 0 ? this.defaultToken : undefined,
    );
  }

  private createOctokit(authToken?: string): Octokit {
    return new Octokit({
      auth: authToken,
      userAgent: 'repo-city-mvp/0.1.0',
      throttle: {
        // Do not block parser for long GitHub reset windows.
        onRateLimit: (
          retryAfter: number,
          options: { method?: string; url?: string },
        ) => {
          const method = String(options.method ?? 'GET').toUpperCase();
          const endpoint = options.url ?? 'unknown endpoint';
          console.warn(
            `GitHub rate limit hit for ${method} ${endpoint}. Retry after ${retryAfter}s.`,
          );

          return false;
        },
        onSecondaryRateLimit: (
          retryAfter: number,
          options: { method?: string; url?: string },
        ) => {
          const method = String(options.method ?? 'GET').toUpperCase();
          const endpoint = options.url ?? 'unknown endpoint';
          console.warn(
            `GitHub secondary rate limit hit for ${method} ${endpoint}. Retry after ${retryAfter}s.`,
          );

          return false;
        },
      },
    });
  }

  private resolveOctokit(githubToken?: string): Octokit {
    const normalized = (githubToken ?? '').trim();
    if (!normalized) {
      return this.defaultOctokit;
    }

    if (normalized === this.defaultToken) {
      return this.defaultOctokit;
    }

    if (this.currentTokenClient?.token === normalized) {
      return this.currentTokenClient.octokit;
    }

    const octokit = this.createOctokit(normalized);
    this.currentTokenClient = {
      token: normalized,
      octokit,
    };

    return octokit;
  }

  async fetchCommits(
    owner: string,
    repo: string,
    limit: number,
    etag?: string | null,
    onProgress?: (progress: {
      page: number;
      totalPages: number | null;
      fetchedCommits: number;
    }) => void,
    onPage?: (payload: {
      page: number;
      totalPages: number | null;
      fetchedCommits: number;
      pageCommits: Array<{ sha: string }>;
    }) => Promise<void> | void,
    options?: FetchCommitOptions,
    githubToken?: string,
  ): Promise<CommitListResult> {
    const octokit = this.resolveOctokit(githubToken);
    const effectiveLimit = this.resolveCommitLimit(limit);
    const commits: Array<{ sha: string }> = [];
    const perPage = 100;
    const startedAt = Date.now();
    const maxPages = Math.max(0, Number(options?.maxPages ?? 0));
    const maxDurationMs = Math.max(0, Number(options?.maxDurationMs ?? 0));

    let page = 1;
    let totalPages: number | null = null;
    let responseEtag: string | null = null;
    let pagesFetched = 0;
    let warning: string | undefined;
    let truncated = false;
    let truncatedReason: CommitListResult['truncatedReason'];

    try {
      while (commits.length < effectiveLimit) {
        if (options?.shouldContinue && !options.shouldContinue()) {
          truncated = true;
          truncatedReason = 'cancelled';
          warning = 'Commit history loading cancelled by a newer parse request.';
          break;
        }

        if (maxPages > 0 && page > maxPages) {
          truncated = true;
          truncatedReason = 'page_budget';
          warning = `Commit history was truncated by page budget (${maxPages}).`;
          break;
        }

        if (maxDurationMs > 0 && Date.now() - startedAt >= maxDurationMs) {
          truncated = true;
          truncatedReason = 'budget_timeout';
          warning = `Commit history was truncated by time budget (${maxDurationMs}ms).`;
          break;
        }

        const remaining =
          effectiveLimit === Number.POSITIVE_INFINITY
            ? perPage
            : Math.max(0, effectiveLimit - commits.length);

        if (remaining === 0) {
          break;
        }

        const pageSize = Math.min(perPage, remaining);
        const response = (await this.requestWithRetry(() =>
          octokit.request('GET /repos/{owner}/{repo}/commits', {
            owner,
            repo,
            per_page: pageSize,
            page,
            headers: page === 1 && etag ? { 'if-none-match': etag } : undefined,
          }),
        )) as any;

        if (page === 1) {
          responseEtag = response.headers.etag ?? null;
          totalPages = this.extractLastPage(response.headers.link);
        }

        const pageCommits = (response.data as Array<{ sha: string }>).map((item) => ({
          sha: item.sha,
        }));

        if (pageCommits.length === 0) {
          break;
        }

        commits.push(...pageCommits);
        pagesFetched = page;
        onProgress?.({
          page,
          totalPages,
          fetchedCommits: commits.length,
        });
        await onPage?.({
          page,
          totalPages,
          fetchedCommits: commits.length,
          pageCommits,
        });

        if (pageCommits.length < pageSize) {
          break;
        }

        if (totalPages && page >= totalPages) {
          break;
        }

        page += 1;
      }
    } catch (error: any) {
      if (error?.status === 304) {
        return {
          commits: [],
          etag: etag ?? null,
          notModified: true,
          pagesFetched,
          totalPagesEstimated: totalPages,
        };
      }

      if (commits.length > 0 && this.isRateLimitError(error)) {
        const resetAt = this.resolveRateLimitReset(error);
        const resetHint = resetAt ? ` Expected reset at ${resetAt}.` : '';

        return {
          commits,
          etag: responseEtag ?? etag ?? null,
          notModified: false,
          truncated: true,
          warning: `Commit history was truncated because GitHub API quota was exhausted.${resetHint}`,
          pagesFetched,
          totalPagesEstimated: totalPages,
          truncatedReason: 'rate_limit',
        };
      }

      this.throwMappedGithubError(error);
      throw error;
    }

    return {
      commits,
      etag: responseEtag,
      notModified: false,
      truncated: truncated || undefined,
      warning,
      pagesFetched,
      totalPagesEstimated: totalPages,
      truncatedReason,
    };
  }

  async fetchBranches(
    owner: string,
    repo: string,
    limit = 30,
    githubToken?: string,
  ): Promise<BranchHead[]> {
    const octokit = this.resolveOctokit(githubToken);
    const perPage = 100;
    const target = Math.max(1, limit);
    const branches: BranchHead[] = [];
    let page = 1;

    while (branches.length < target) {
      try {
        const remaining = Math.max(0, target - branches.length);
        if (remaining === 0) {
          break;
        }

        const response = (await this.requestWithRetry(() =>
          octokit.request('GET /repos/{owner}/{repo}/branches', {
            owner,
            repo,
            per_page: Math.min(perPage, remaining),
            page,
          }),
        )) as any;

        const payload = response.data as Array<{ name: string; commit?: { sha?: string } }>;
        if (payload.length === 0) {
          break;
        }

        payload.forEach((item) => {
          if (!item?.name || !item?.commit?.sha) {
            return;
          }

          branches.push({
            name: item.name,
            sha: item.commit.sha,
          });
        });

        if (payload.length < perPage) {
          break;
        }
        page += 1;
      } catch {
        return branches;
      }
    }

    return branches.slice(0, target);
  }

  async fetchBranchCommits(
    owner: string,
    repo: string,
    branch: string,
    limit = 60,
    githubToken?: string,
  ): Promise<BranchCommitSummary[]> {
    const octokit = this.resolveOctokit(githubToken);
    const perPage = 100;
    const target = Math.max(1, limit);
    const commits: BranchCommitSummary[] = [];
    let page = 1;

    while (commits.length < target) {
      try {
        const remaining = Math.max(0, target - commits.length);
        if (remaining === 0) {
          break;
        }

        const response = (await this.requestWithRetry(() =>
          octokit.request('GET /repos/{owner}/{repo}/commits', {
            owner,
            repo,
            sha: branch,
            per_page: Math.min(perPage, remaining),
            page,
          }),
        )) as any;

        const payload = response.data as Array<{
          sha: string;
          commit?: { author?: { date?: string } };
        }>;
        if (payload.length === 0) {
          break;
        }

        payload.forEach((item) => {
          if (!item?.sha) {
            return;
          }

          commits.push({
            sha: item.sha,
            date: item.commit?.author?.date ?? new Date().toISOString(),
          });
        });

        if (payload.length < perPage) {
          break;
        }
        page += 1;
      } catch {
        return commits;
      }
    }

    return commits.slice(0, target);
  }

  async fetchCommitDetails(
    owner: string,
    repo: string,
    sha: string,
    githubToken?: string,
  ): Promise<CommitDetails> {
    const octokit = this.resolveOctokit(githubToken);
    try {
      const response = (await this.requestWithRetry(() =>
        octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
          owner,
          repo,
          ref: sha,
        }),
      )) as any;

      const authorLogin = response.data.author?.login;
      const authorName = response.data.commit.author?.name;

      return {
        sha: response.data.sha,
        author: authorLogin ?? authorName ?? 'Unknown',
        date: response.data.commit.author?.date ?? new Date().toISOString(),
        message: response.data.commit.message,
        files: (response.data.files ?? []).map(
          (file: {
            filename: string;
            additions: number;
            deletions: number;
            changes: number;
            status?: string;
            previous_filename?: string;
          }) => ({
          filename: file.filename,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          status: file.status,
          previousFilename: file.previous_filename,
          }),
        ),
      };
    } catch (error: any) {
      this.throwMappedGithubError(error);
      throw error;
    }
  }

  async fetchFileContent(
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
    githubToken?: string,
  ): Promise<FileContentResult | null> {
    const octokit = this.resolveOctokit(githubToken);
    try {
      const response = (await this.requestWithRetry(() =>
        octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
          owner,
          repo,
          path: filePath,
          ref,
        }),
      )) as any;

      const data = response.data as
        | {
            type: string;
            content?: string;
            encoding?: string;
            path?: string;
            size?: number;
          }
        | Array<unknown>;

      if (Array.isArray(data) || data.type !== 'file' || !data.content) {
        return null;
      }

      if (typeof data.size === 'number' && data.size > this.maxFileBytes) {
        return null;
      }

      const decoded =
        data.encoding === 'base64'
          ? Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
          : data.content;

      return {
        path: data.path ?? filePath,
        content: decoded,
      };
    } catch (error: any) {
      if (error?.status === 404 || error?.status === 403 || error?.status === 422) {
        return null;
      }

      this.throwMappedGithubError(error);
      return null;
    }
  }

  getTotalRequestCount(): number {
    return this.requestCount;
  }

  private async requestWithRetry<T>(requestFn: () => Promise<T>): Promise<T> {
    const retries = Math.max(0, this.requestRetries);
    let attempt = 0;

    while (true) {
      try {
        this.requestCount += 1;
        return await this.requestWithTimeout(requestFn);
      } catch (error: any) {
        if (!this.isRetriableError(error) || attempt >= retries) {
          throw error;
        }

        const delayMs = this.resolveRetryDelayMs(error, attempt);
        await this.sleep(delayMs);
        attempt += 1;
      }
    }
  }

  private async requestWithTimeout<T>(requestFn: () => Promise<T>): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new GatewayTimeoutException(
            `GitHub API request timed out after ${this.requestTimeoutMs}ms.`,
          ),
        );
      }, this.requestTimeoutMs);
    });

    try {
      return await Promise.race([requestFn(), timeout]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private throwMappedGithubError(error: any): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (this.isRateLimitError(error)) {
      const resetAt = this.resolveRateLimitReset(error);
      const suffix = resetAt ? ` Retry after ${resetAt}.` : '';
      throw new HttpException(
        `GitHub API quota exceeded. Add GITHUB_TOKEN or try later.${suffix}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (error?.status === 404) {
      throw new ServiceUnavailableException('Repository not found or unavailable.');
    }

    if (error?.status && error?.message) {
      throw new ServiceUnavailableException(`GitHub API error: ${error.message}`);
    }

    throw new ServiceUnavailableException('Unexpected GitHub API error.');
  }

  private resolveCommitLimit(limit: number): number {
    if (!Number.isFinite(limit)) {
      return Number.POSITIVE_INFINITY;
    }

    const normalized = Math.trunc(limit);
    if (normalized <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    return normalized;
  }

  private extractLastPage(linkHeader: unknown): number | null {
    if (typeof linkHeader !== 'string' || linkHeader.length === 0) {
      return null;
    }

    const match = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>\s*;\s*rel="last"/i);
    if (!match) {
      return null;
    }

    const value = Number(match[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private resolveRateLimitReset(error: any): string | null {
    const rawValue =
      error?.response?.headers?.['x-ratelimit-reset'] ??
      error?.headers?.['x-ratelimit-reset'];

    if (!rawValue) {
      return null;
    }

    const seconds = Number(rawValue);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }

    return new Date(seconds * 1000).toISOString();
  }

  private isRateLimitError(error: any): boolean {
    const status = Number(
      error?.status ??
      (typeof error?.getStatus === 'function' ? error.getStatus() : NaN),
    );
    const message = String(error?.message ?? '').toLowerCase();

    return (
      (status === 403 || status === 429) &&
      (message.includes('rate limit') ||
        message.includes('quota exhausted') ||
        message.includes('secondary rate limit'))
    );
  }

  private isRetriableError(error: any): boolean {
    const status = Number(
      error?.status ??
      (typeof error?.getStatus === 'function' ? error.getStatus() : NaN),
    );
    const message = String(error?.message ?? '').toLowerCase();

    if (
      message.includes('timed out') ||
      message.includes('econnreset') ||
      message.includes('socket hang up') ||
      message.includes('network error')
    ) {
      return true;
    }

    if (status >= 500 && status <= 599) {
      return true;
    }

    return (
      status === 403 &&
      (message.includes('secondary rate limit') || message.includes('abuse detection'))
    );
  }

  private resolveRetryDelayMs(error: any, attempt: number): number {
    const retryAfterHeader =
      error?.response?.headers?.['retry-after'] ?? error?.headers?.['retry-after'];
    const retryAfterSeconds = Number(retryAfterHeader);

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(120000, retryAfterSeconds * 1000);
    }

    return Math.min(120000, this.retryBaseDelayMs * 2 ** attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
