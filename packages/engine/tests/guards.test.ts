import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Два инварианта, которые обязаны жить раньше любого кода пакета:
// ноль рантайм-зависимостей и запрет на динамическое создание кода.
// Оба переехали из приёмочных критериев PoC.

const root = fileURLToPath(new URL('..', import.meta.url));

export function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (path.endsWith('.ts')) yield path;
  }
}

describe('стражи пакета engine', () => {
  it('рантайм-зависимостей — ноль', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('ни eval, ни new Function во всём src/', () => {
    // Паттерн собран из кусков, иначе сканер поймал бы сам себя.
    const banned = new RegExp('\\be' + 'val\\s*\\(|new\\s+Fun' + 'ction');
    for (const file of walk(join(root, 'src'))) {
      expect(banned.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });
});
