// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(__dirname, '../../..');

const SCOPES = [
  'packages/schema/src', 'packages/schema/tests',
  'packages/engine/src', 'packages/engine/tests',
  'apps/server/src', 'apps/server/test',
  'apps/web/src',
];

const ALLOWED = [/^\/\/ @vitest-environment\b/, /^\/\/ @ts-expect-error\b/, /^\/\/ eslint-disable/];

function filesOf(dir: string): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '__snapshots__') continue;
      out.push(...filesOf(path));
    } else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

export function commentsOf(path: string, text: string): string[] {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const seen = new Set<number>();
  const found: string[] = [];
  const prose: [number, number][] = [];

  const collectProse = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) prose.push([node.getFullStart(), node.getEnd()]);
    node.forEachChild(collectProse);
  };
  collectProse(source);

  const take = (ranges: ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      if (seen.has(range.pos)) continue;
      if (prose.some(([from, to]) => range.pos >= from && range.pos < to)) continue;
      seen.add(range.pos);
      const body = text.slice(range.pos, range.end);
      if (ALLOWED.some(rule => rule.test(body))) continue;
      const { line } = source.getLineAndCharacterOfPosition(range.pos);
      found.push(`${line + 1}: ${body.split('\n')[0]!.slice(0, 80)}`);
    }
  };

  const visit = (node: ts.Node) => {
    if (node.kind !== ts.SyntaxKind.JsxText) {
      take(ts.getLeadingCommentRanges(text, node.getFullStart()));
      take(ts.getTrailingCommentRanges(text, node.getEnd()));
    }
    node.forEachChild(visit);
  };
  visit(source);
  return found;
}

describe('правило проекта: в коде нет комментариев', () => {
  it('сканер находит комментарий в подделке и не путает его с адресом в строке', () => {
    expect(commentsOf('fake.ts', 'const a = 1; // пояснение\n')).toHaveLength(1);
    expect(commentsOf('fake.ts', '/* блок */ const a = 1;\n')).toHaveLength(1);
    expect(commentsOf('fake.tsx', 'const a = <a href="http://x/*">/* не код */ http://y</a>;\n')).toEqual([]);
    expect(commentsOf('fake.ts', '// @ts-expect-error — причина\nconst a: number = "x";\n')).toEqual([]);
  });

  it('ни в одном пакете нет комментариев', () => {
    const offenders: string[] = [];
    for (const scope of SCOPES) {
      for (const file of filesOf(join(ROOT, scope))) {
        for (const hit of commentsOf(file, readFileSync(file, 'utf8'))) {
          offenders.push(`${relative(ROOT, file)}:${hit}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
