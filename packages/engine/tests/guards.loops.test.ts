import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = join(root, '..', '..');
const web = join(repo, 'apps', 'web', 'src');

const ALLOWED_FILES = [
  'packages/engine/src/engine/steps/each.ts',
  'packages/engine/src/engine/steps/index.ts',
  'apps/web/src/screens/constructor/factory.ts',
];
const ALLOWED_DIRS = ['apps/web/src/guide/'];

const PATTERN = /[!=]==\s*'each'/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) yield path;
  }
}

const repoPath = (file: string): string => relative(repo, file).split(sep).join('/');

describe('стражи шагов «для каждого»', () => {
  it('тип шага «each» не сравнивается по имени в движке и вебе — сравнивают признаки модуля', () => {
    const files = [...walk(join(root, 'src')), ...walk(web)]
      .map(repoPath)
      .filter(file => !ALLOWED_FILES.includes(file) && !ALLOWED_DIRS.some(dir => file.startsWith(dir)));
    const hits = files.filter(file => PATTERN.test(readFileSync(join(repo, file), 'utf8')));
    expect(hits).toEqual([]);
  });
});
