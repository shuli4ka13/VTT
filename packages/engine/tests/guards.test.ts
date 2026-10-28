import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

export function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (path.endsWith('.ts')) yield path;
  }
}

function* walkAll(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkAll(path);
    else if (/\.tsx?$/.test(path)) yield path;
  }
}

describe('стражи пакета engine', () => {
  it('рантайм-зависимостей — ноль', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('ни eval, ни new Function во всём src/', () => {

    const banned = new RegExp('\\be' + 'val\\s*\\(|new\\s+Fun' + 'ction');
    for (const file of walk(join(root, 'src'))) {
      expect(banned.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });

  it('основу типа читает одно место — inherit.ts: колонки с основой — typeColumns, основа — basedOn', () => {
    const web = join(root, '..', '..', 'apps', 'web', 'src');
    const sources = [...walk(join(root, 'src')), ...walkAll(web)].filter(file => !/\.test\.tsx?$/.test(file));
    const allowed = [join('model', 'inherit.ts'), join('model', 'lint.ts'), join('constructor', 'records-tab.tsx')];
    const hand = sources.filter(file => !allowed.some(end => file.endsWith(end)) && /\.extends\b/.test(readFileSync(file, 'utf8')));
    expect(hand).toEqual([]);
  });
});
