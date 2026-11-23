// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { sourcesOf } from './scan.tools.ts';

const SRC = resolve(__dirname, '..');

export function uiWordsInData(path: string, text: string): number[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines: number[] = [];
  const inside = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      lines.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
    }
    node.forEachChild(inside);
  };
  const visit = (node: ts.Node): void => {
    const first = (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) ? node.parameters[0]?.name : undefined;
    if (first && ts.isIdentifier(first) && first.text === 'draft') inside((node as ts.ArrowFunction).body);
    else node.forEachChild(visit);
  };
  visit(source);
  return lines;
}

describe('правка данных не берёт слова на языке интерфейса', () => {
  it('сторож видит t(…) внутри правки и не трогает td(…)', () => {
    expect(uiWordsInData('a.ts', "edit(draft => { draft.label = t('x:y'); });")).toEqual([1]);
    expect(uiWordsInData('a.ts', "edit(draft => { draft.label = td('data:y'); });")).toEqual([]);
    expect(uiWordsInData('a.ts', "const label = t('x:y'); edit(other => { other.label = label; });")).toEqual([]);
  });

  it('внутри правки (draft => …) подпись берётся через dataT(система), а не через t', () => {
    const found: string[] = [];
    for (const path of sourcesOf(SRC)) {
      const rel = relative(SRC, path).split('\\').join('/');
      if (/\.test\.tsx?$/.test(rel) || rel.startsWith('i18n/') || rel.startsWith('testing/')) continue;
      for (const line of uiWordsInData(path, readFileSync(path, 'utf8'))) found.push(`${rel}:${line}`);
    }
    expect(found, found.join('\n')).toEqual([]);
  });
});
