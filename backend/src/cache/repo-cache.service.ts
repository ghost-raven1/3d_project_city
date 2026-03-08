import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { parseGithubRepoUrl } from '../common/utils/github-url';
import { RepositoryResult, StackPassport } from '../parser/parser.types';
import { RepoCacheModel } from './models/repo-cache.model';

interface CacheLookupResult {
  payload: RepositoryResult;
  etag: string | null;
  isFresh: boolean;
}

@Injectable()
export class RepoCacheService {
  private readonly ttlMs = Number(process.env.CACHE_TTL_MS ?? 60 * 60 * 1000);

  constructor(
    @InjectModel(RepoCacheModel)
    private readonly cacheModel: typeof RepoCacheModel,
  ) {}

  async getFresh(url: string): Promise<CacheLookupResult | null> {
    const entry = await this.cacheModel.findOne({ where: { url } });
    if (!entry) {
      return null;
    }

    return this.mapEntry(entry);
  }

  async getAny(url: string): Promise<CacheLookupResult | null> {
    const entry = await this.cacheModel.findOne({ where: { url } });
    if (!entry) {
      return null;
    }

    return this.mapEntry(entry);
  }

  async touch(url: string): Promise<void> {
    await this.cacheModel.update(
      { lastFetched: new Date() },
      {
        where: { url },
      },
    );
  }

  private mapEntry(entry: RepoCacheModel): CacheLookupResult {
    const ageMs = Date.now() - new Date(entry.lastFetched).getTime();
    const parsed = this.parsePayload(entry.data);
    if (!parsed) {
      const fallback = this.createEmptyRepositoryResult(entry.url);
      return {
        payload: fallback,
        etag: entry.etag,
        isFresh: false,
      };
    }
    const hasStackPayload = Boolean((parsed as Partial<RepositoryResult>).stack);
    const hasBranchPayload = Array.isArray(
      (parsed as Partial<RepositoryResult>).branches,
    );
    const hasAnalysisPayload = Boolean((parsed as Partial<RepositoryResult>).analysis);

    if (!Array.isArray((parsed as Partial<RepositoryResult>).imports)) {
      parsed.imports = [];
    }

    if (!Array.isArray((parsed as Partial<RepositoryResult>).branches)) {
      parsed.branches = [];
    }

    if (!parsed.stack) {
      parsed.stack = this.createEmptyStackPassport();
    }
    if (!(parsed as Partial<RepositoryResult>).analysis) {
      (parsed as RepositoryResult).analysis = this.createEmptyAnalysis();
    } else if (!(parsed.analysis as Partial<RepositoryResult['analysis']>).diagnostics) {
      parsed.analysis.diagnostics = {
        githubRequests: 0,
        stageMs: {},
        generatedAt: new Date(0).toISOString(),
      };
    }

    if (
      !parsed.repository ||
      !parsed.repository.owner ||
      !parsed.repository.repo ||
      !parsed.repository.url
    ) {
      const fallbackRepository = this.rebuildRepositoryMeta(entry.url);
      if (fallbackRepository) {
        parsed.repository = fallbackRepository;
      }
    }

    return {
      payload: parsed,
      etag: entry.etag,
      isFresh:
        ageMs <= this.ttlMs &&
        hasStackPayload &&
        hasBranchPayload &&
        hasAnalysisPayload,
    };
  }

  async save(
    url: string,
    payload: RepositoryResult,
    etag: string | null,
  ): Promise<void> {
    const now = new Date();

    await this.cacheModel.upsert(
      {
        url,
        data: payload,
        lastFetched: now,
        etag,
      } as unknown as RepoCacheModel,
    );
  }

  private parsePayload(raw: unknown): RepositoryResult | null {
    if (!raw) {
      return null;
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
          return parsed as RepositoryResult;
        }
      } catch {
        return null;
      }
      return null;
    }

    if (typeof raw === 'object') {
      return raw as RepositoryResult;
    }

    return null;
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

  private createEmptyAnalysis(): RepositoryResult['analysis'] {
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
        generatedAt: new Date(0).toISOString(),
      },
    };
  }

  private createEmptyRepositoryResult(url: string): RepositoryResult {
    const fallbackRepository =
      this.rebuildRepositoryMeta(url) ?? {
        owner: 'unknown',
        repo: 'unknown',
        url,
      };
    return {
      repository: fallbackRepository,
      totalCommits: 0,
      files: [],
      imports: [],
      generatedAt: new Date(0).toISOString(),
      branches: [],
      stack: this.createEmptyStackPassport(),
      analysis: this.createEmptyAnalysis(),
    };
  }

  private rebuildRepositoryMeta(url: string):
    | { owner: string; repo: string; url: string }
    | null {
    try {
      const parsed = parseGithubRepoUrl(url);
      return {
        owner: parsed.owner,
        repo: parsed.repo,
        url: parsed.normalizedUrl,
      };
    } catch {
      return null;
    }
  }
}
