export type StackLayer =
  | 'ui'
  | 'api'
  | 'domain'
  | 'data'
  | 'infra'
  | 'tests'
  | 'docs'
  | 'misc';

export function inferStackLayer(filePath: string): StackLayer {
  const lower = filePath.toLowerCase();

  if (
    lower.includes('/test/') ||
    lower.includes('/tests/') ||
    lower.includes('/__tests__/') ||
    lower.endsWith('.spec.ts') ||
    lower.endsWith('.test.ts') ||
    lower.endsWith('.spec.tsx') ||
    lower.endsWith('.test.tsx')
  ) {
    return 'tests';
  }

  if (
    lower.startsWith('docs/') ||
    lower.includes('/docs/') ||
    lower.endsWith('.md') ||
    lower.endsWith('.mdx') ||
    lower.endsWith('.rst')
  ) {
    return 'docs';
  }

  if (
    lower.includes('/infra/') ||
    lower.includes('/ops/') ||
    lower.includes('/k8s/') ||
    lower.includes('/helm/') ||
    lower.includes('/docker/') ||
    lower.includes('.github/workflows/') ||
    lower.endsWith('dockerfile') ||
    lower.endsWith('.yml') ||
    lower.endsWith('.yaml') ||
    lower.endsWith('.toml')
  ) {
    return 'infra';
  }

  if (
    lower.includes('/db/') ||
    lower.includes('/database/') ||
    lower.includes('/migrations/') ||
    lower.includes('/models/') ||
    lower.includes('/entities/') ||
    lower.includes('/repositories/')
  ) {
    return 'data';
  }

  if (
    lower.includes('/api/') ||
    lower.includes('/routes/') ||
    lower.includes('/controllers/') ||
    lower.includes('/handlers/') ||
    lower.includes('/gateway/') ||
    lower.includes('/http/')
  ) {
    return 'api';
  }

  if (
    lower.includes('/components/') ||
    lower.includes('/views/') ||
    lower.includes('/pages/') ||
    lower.includes('/ui/') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.css') ||
    lower.endsWith('.scss')
  ) {
    return 'ui';
  }

  if (
    lower.includes('/services/') ||
    lower.includes('/domain/') ||
    lower.includes('/core/') ||
    lower.includes('/usecases/') ||
    lower.includes('/application/')
  ) {
    return 'domain';
  }

  return 'misc';
}

export function stackLayerColor(layer: StackLayer): string {
  if (layer === 'ui') {
    return '#64b5ff';
  }
  if (layer === 'api') {
    return '#6de8c9';
  }
  if (layer === 'domain') {
    return '#ffe082';
  }
  if (layer === 'data') {
    return '#ffab91';
  }
  if (layer === 'infra') {
    return '#b39ddb';
  }
  if (layer === 'tests') {
    return '#aed581';
  }
  if (layer === 'docs') {
    return '#90caf9';
  }
  return '#c9d6ea';
}

