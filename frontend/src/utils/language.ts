const extensionMap: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  cs: 'C#',
  cpp: 'C++',
  cc: 'C++',
  c: 'C',
  h: 'C/C++ Header',
  rb: 'Ruby',
  php: 'PHP',
  md: 'Markdown',
  rst: 'RST',
  adoc: 'AsciiDoc',
  yaml: 'YAML',
  yml: 'YAML',
  json: 'JSON',
  toml: 'TOML',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  css: 'CSS',
  scss: 'SCSS',
  less: 'LESS',
  html: 'HTML',
  vue: 'Vue',
  svelte: 'Svelte',
  sql: 'SQL',
};

export function getLanguageFromPath(path: string): string {
  const fileName = path.split('/').pop()?.toLowerCase() ?? '';
  if (fileName === 'dockerfile') {
    return 'Docker';
  }

  if (fileName === 'makefile') {
    return 'Make';
  }

  const index = fileName.lastIndexOf('.');
  if (index < 0) {
    return 'Other';
  }

  const ext = fileName.slice(index + 1);
  return extensionMap[ext] ?? ext.toUpperCase();
}

