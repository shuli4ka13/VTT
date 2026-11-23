// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { sourcesOf } from './scan.tools.ts';

const HERE = __dirname;
const SRC = resolve(HERE, '..');
const LANGS = ['ru', 'en'] as const;

const areasOf = (lang: string): string[] =>
  readdirSync(join(HERE, lang)).filter(name => name.endsWith('.json')).map(name => name.replace(/\.json$/, '')).sort();

const flat = (value: unknown, prefix = ''): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (inner && typeof inner === 'object') Object.assign(out, flat(inner, path));
    else out[path] = String(inner);
  }
  return out;
};

const load = (lang: string, area: string): Record<string, string> =>
  flat(JSON.parse(readFileSync(join(HERE, lang, `${area}.json`), 'utf8')));

const places = (text: string): string[] => [...new Set((text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map(item => item.replace(/\s/g, '')))].sort();

const dictionary = new Map<string, Record<string, string>>();
for (const area of areasOf('ru')) dictionary.set(area, load('ru', area));

interface Named { file: string; line: number; key: string; areas: string[] }

function namedKeys(path: string, text: string): Named[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const areas: string[] = [];
  const calls: { key: string; pos: number }[] = [];
  const text0 = (node: ts.Node | undefined): string | null =>
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const first = text0(node.arguments[0]);
      if (first !== null) {
        if (node.expression.text === 'useT') areas.push(first);
        else if (node.expression.text === 't') calls.push({ key: first, pos: node.getStart(source) });
      }
    }
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'i18nKey' && node.initializer && ts.isStringLiteral(node.initializer)) {
      calls.push({ key: node.initializer.text, pos: node.getStart(source) });
    }
    node.forEachChild(visit);
  };
  visit(source);
  return calls.map(call => ({
    file: relative(SRC, path), key: call.key, areas,
    line: source.getLineAndCharacterOfPosition(call.pos).line + 1,
  }));
}

describe('словари интерфейса', () => {
  it('у ru и en одни и те же области', () => {
    expect(areasOf('en')).toEqual(areasOf('ru'));
  });

  for (const area of areasOf('ru')) {
    describe(`область ${area}`, () => {
      const ru = load('ru', area);
      const en = load('en', area);

      it('ключи ru и en совпадают', () => {
        expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
      });

      it('подстановки {{…}} одни и те же в обоих языках', () => {
        const diff = Object.keys(ru).filter(key => en[key] !== undefined && places(ru[key]!).join() !== places(en[key]!).join());
        expect(diff, diff.join('\n')).toEqual([]);
      });

      it('пустых значений нет', () => {
        const empty = [...Object.entries(ru).map(([key, value]) => ['ru', key, value] as const), ...Object.entries(en).map(([key, value]) => ['en', key, value] as const)]
          .filter(([, , value]) => !value.trim()).map(([lang, key]) => `${lang}:${area}:${key}`);
        expect(empty).toEqual([]);
      });
    });
  }

  it('каждый ключ, названный в коде литералом, есть в словаре', () => {
    const missing: string[] = [];
    for (const path of sourcesOf(SRC)) {
      const rel = relative(SRC, path);
      if (/\.test\.tsx?$/.test(rel) || rel.startsWith('i18n/')) continue;
      for (const named of namedKeys(path, readFileSync(path, 'utf8'))) {
        const colon = named.key.indexOf(':');
        const candidates = colon > 0 ? [[named.key.slice(0, colon), named.key.slice(colon + 1)] as const] : named.areas.map(area => [area, named.key] as const);
        if (!candidates.some(([area, key]) => dictionary.get(area)?.[key] !== undefined)) {
          missing.push(`${named.file}:${named.line}: ${named.key}`);
        }
      }
    }
    expect(missing, missing.join('\n')).toEqual([]);
  });

  it('сверка видит пропавший ключ и расхождение подстановок', () => {
    expect(places('Привет, {{name}} и {{ n }}')).toEqual(['{{name}}', '{{n}}']);
    const found = namedKeys('/x/a.tsx', "const t = useT('gate'); const a = t('nope.never');");
    expect(found).toHaveLength(1);
    expect(found[0]!.areas).toEqual(['gate']);
    expect(dictionary.get('gate')?.['nope.never']).toBeUndefined();
  });
});
