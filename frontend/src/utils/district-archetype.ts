export type DistrictArchetype =
  | 'downtown'
  | 'techpark'
  | 'quiet'
  | 'industrial'
  | 'commons';

export interface ArchetypeVisual {
  label: string;
  accent: string;
  glow: number;
}

const srcMatchers = ['src', 'app', 'core', 'engine', 'frontend', 'client', 'server'];
const testMatchers = ['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'qa'];
const docsMatchers = ['docs', 'doc', 'guides', 'guide', 'wiki', 'examples', 'story'];
const configMatchers = ['config', 'configs', 'build', 'scripts', 'infra', '.github', 'ci'];

function containsAny(haystack: string, words: string[]): boolean {
  return words.some((word) => haystack.includes(word));
}

export function detectDistrictArchetype(folder: string): DistrictArchetype {
  const normalized = folder.toLowerCase();

  if (normalized === 'root') {
    return 'commons';
  }

  if (containsAny(normalized, srcMatchers)) {
    return 'downtown';
  }

  if (containsAny(normalized, testMatchers)) {
    return 'techpark';
  }

  if (containsAny(normalized, docsMatchers)) {
    return 'quiet';
  }

  if (containsAny(normalized, configMatchers)) {
    return 'industrial';
  }

  return 'commons';
}

export function getArchetypeVisual(archetype: DistrictArchetype): ArchetypeVisual {
  switch (archetype) {
    case 'downtown':
      return {
        label: 'Neon Downtown',
        accent: '#3ce8ff',
        glow: 1.2,
      };
    case 'techpark':
      return {
        label: 'Tech Park',
        accent: '#85ffcc',
        glow: 1.05,
      };
    case 'quiet':
      return {
        label: 'Quiet Zone',
        accent: '#a8b9ff',
        glow: 0.82,
      };
    case 'industrial':
      return {
        label: 'Industrial Grid',
        accent: '#ff9b66',
        glow: 0.92,
      };
    default:
      return {
        label: 'Commons',
        accent: '#8ec0ff',
        glow: 0.9,
      };
  }
}
