import { BranchSignal, RepositoryResult, StackPassport } from '../types/repository';
import { analyzeGraphIntelligence, GraphIntelligence } from './graph-intelligence';
import { getLanguageFromPath } from './language';

export interface LanguageInsight {
  name: string;
  count: number;
  share: number;
}

export interface AuthorInsight {
  name: string;
  commits: number;
}

export interface RepositoryInsights {
  totalFiles: number;
  totalCommits: number;
  fromDate: string;
  toDate: string;
  ageDays: number;
  languages: LanguageInsight[];
  frameworks: string[];
  authors: AuthorInsight[];
  branches: BranchSignal[];
  graph: GraphIntelligence;
  stack: StackPassport;
}

function detectFrameworks(paths: string[], languageNames: string[]): string[] {
  const lower = paths.map((path) => path.toLowerCase());
  const frameworks = new Set<string>();

  const has = (pattern: RegExp) => lower.some((path) => pattern.test(path));
  const hasAny = (parts: string[]) => lower.some((path) => parts.some((part) => path.includes(part)));

  if (
    has(/next\.config\.(js|mjs|ts)$/) ||
    hasAny(['/app/page.', '/pages/_app.', '/pages/api/'])
  ) {
    frameworks.add('Next.js');
  }

  if (
    hasAny(['/components/', '/hooks/', '/contexts/']) &&
    has(/\.(tsx|jsx)$/)
  ) {
    frameworks.add('React');
  }

  if (has(/angular\.json$/) || hasAny(['/src/app/', '.module.ts', '.component.ts'])) {
    frameworks.add('Angular');
  }

  if (has(/\.(vue)$/) || hasAny(['/nuxt.config', '/nuxt/'])) {
    frameworks.add('Vue');
  }

  if (has(/\.(svelte)$/)) {
    frameworks.add('Svelte');
  }

  if (has(/nest-cli\.json$/) || hasAny(['.controller.ts', '.module.ts', '.service.ts'])) {
    frameworks.add('NestJS');
  }

  if (hasAny(['/routes/', '/controllers/', '/middleware/']) && languageNames.includes('JavaScript')) {
    frameworks.add('Express');
  }

  if (has(/manage\.py$/) || hasAny(['/settings.py', '/urls.py', '/wsgi.py'])) {
    frameworks.add('Django');
  }

  if (has(/pom\.xml$/) || has(/build\.gradle/)) {
    frameworks.add('Spring');
  }

  if (has(/go\.mod$/)) {
    frameworks.add('Go modules');
  }

  if (has(/cargo\.toml$/)) {
    frameworks.add('Rust Cargo');
  }

  if (has(/docker-compose\.ya?ml$/) || has(/dockerfile$/)) {
    frameworks.add('Docker');
  }

  return Array.from(frameworks).slice(0, 6);
}

export function analyzeRepositoryInsights(
  data: RepositoryResult | null,
): RepositoryInsights | null {
  if (!data || data.files.length === 0) {
    return null;
  }

  const languageCount = new Map<string, number>();
  const commitBySha = new Map<string, { author: string; date: string }>();
  const paths: string[] = [];

  data.files.forEach((file) => {
    paths.push(file.path);
    const language = getLanguageFromPath(file.path);
    languageCount.set(language, (languageCount.get(language) ?? 0) + 1);

    file.commits.forEach((commit) => {
      if (!commitBySha.has(commit.sha)) {
        commitBySha.set(commit.sha, { author: commit.author, date: commit.date });
      }
    });
  });

  const totalFiles = data.files.length;
  const totalCommits = commitBySha.size;
  const languageEntries = Array.from(languageCount.entries()).sort((a, b) => b[1] - a[1]);
  const languages = languageEntries.slice(0, 6).map(([name, count]) => ({
    name,
    count,
    share: count / Math.max(1, totalFiles),
  }));

  const authorCount = new Map<string, number>();
  const timestamps: number[] = [];
  commitBySha.forEach((commit) => {
    authorCount.set(commit.author, (authorCount.get(commit.author) ?? 0) + 1);
    timestamps.push(new Date(commit.date).getTime());
  });

  const sortedAuthors = Array.from(authorCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, commits]) => ({ name, commits }));

  const minTs = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
  const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
  const ageDays = Math.max(1, Math.round((maxTs - minTs) / (1000 * 60 * 60 * 24)));

  const frameworks = detectFrameworks(
    paths,
    languages.map((language) => language.name),
  );
  const stack = data.stack ?? {
    runtimes: [],
    frameworks: [],
    tooling: [],
    infrastructure: [],
    ci: [],
    databases: [],
    sources: [],
    signals: [],
  };
  const branches = [...(data.branches ?? [])]
    .sort((a, b) => {
      if (b.commits !== a.commits) {
        return b.commits - a.commits;
      }

      return (
        new Date(b.latestDate).getTime() -
        new Date(a.latestDate).getTime()
      );
    })
    .slice(0, 8);
  const graph = analyzeGraphIntelligence(data.files, data.imports ?? []);

  return {
    totalFiles,
    totalCommits,
    fromDate: new Date(minTs).toISOString(),
    toDate: new Date(maxTs).toISOString(),
    ageDays,
    languages,
    frameworks: Array.from(new Set([...stack.frameworks, ...frameworks])).slice(0, 8),
    authors: sortedAuthors,
    branches,
    graph,
    stack,
  };
}
