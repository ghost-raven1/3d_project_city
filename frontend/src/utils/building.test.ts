import { describe, expect, it } from 'vitest';
import { floorHeight } from './building';

describe('building utils', () => {
  it('clamps invalid changes to finite floor heights', () => {
    expect(floorHeight(Number.NaN)).toBeGreaterThan(0);
    expect(floorHeight(-10)).toBeGreaterThan(0);
    expect(Number.isFinite(floorHeight(Number.POSITIVE_INFINITY))).toBe(true);
  });
});
