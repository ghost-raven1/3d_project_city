import { describe, expect, it } from 'vitest';
import { inferStackLayer, stackLayerColor } from './stack-layers';

describe('stack layers', () => {
  it('infers typical stack layers from paths', () => {
    expect(inferStackLayer('src/components/App.tsx')).toBe('ui');
    expect(inferStackLayer('src/api/users/controller.ts')).toBe('api');
    expect(inferStackLayer('src/db/migrations/001_init.sql')).toBe('data');
    expect(inferStackLayer('.github/workflows/ci.yml')).toBe('infra');
    expect(inferStackLayer('docs/architecture.md')).toBe('docs');
  });

  it('returns stable layer colors', () => {
    expect(stackLayerColor('ui')).toMatch(/^#/);
    expect(stackLayerColor('infra')).toMatch(/^#/);
  });
});

