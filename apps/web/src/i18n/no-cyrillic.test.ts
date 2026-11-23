// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { cyrillicIn, exempt, sourcesOf } from './scan.tools.ts';
import pending from './pending.json';

const SRC = resolve(__dirname, '..');

const scanned = sourcesOf(SRC)
  .map(path => ({ rel: relative(SRC, path).split('\\').join('/'), path }))
  .filter(file => !exempt(file.rel));

describe('в компонентах нет русских литералов: тексты живут в словарях', () => {
  it('сканер видит строки, шаблоны, текст разметки и атрибуты, но не комментарии', () => {
    expect(cyrillicIn('a.tsx', 'const a = "да";')).toHaveLength(1);
    expect(cyrillicIn('a.tsx', 'const a = `x ${b} да ${c}`;')).toHaveLength(1);
    expect(cyrillicIn('a.tsx', 'const a = <p title="нет">да</p>;')).toHaveLength(2);
    expect(cyrillicIn('a.tsx', 'const a = <p>{t("ok")} text</p>;')).toEqual([]);
  });

  it('файл с кириллицей не из списка «ещё не переведено» — провал', () => {
    const listed = new Set<string>(pending);
    const found = scanned
      .filter(file => !listed.has(file.rel))
      .flatMap(file => cyrillicIn(file.path, readFileSync(file.path, 'utf8')).map(place => `${file.rel}:${place.line}: ${place.text}`));
    expect(found, found.slice(0, 40).join('\n')).toEqual([]);
  });

  it('файл из списка без кириллицы обязан из него уйти', () => {
    const byRel = new Map(scanned.map(file => [file.rel, file.path]));
    const clean = (pending as string[]).filter(rel => {
      const path = byRel.get(rel);
      return !path || cyrillicIn(path, readFileSync(path, 'utf8')).length === 0;
    });
    expect(clean, `уберите из pending.json: ${clean.join(', ')}`).toEqual([]);
  });

  it('список отсортирован и без повторов', () => {
    const list = pending as string[];
    expect(list).toEqual([...new Set(list)].sort());
  });
});
