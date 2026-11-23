import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { phraseOf } from '../src/words/tongue.ts';

export const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const SPOKEN = /[\u0400-\u04FF]/u;

export const NOT_TEXT_FILES = ['formula/words.ts', 'words/key.ts'];

export const NOT_TEXT: Record<string, string[]> = {
  'model/blocks.ts': ['Без блока'],
  'events/trial.ts': ['__проба'],
};

export const NOT_TEXT_TABLES: Record<string, string[]> = {
  'words/glossary.ts': ['FORBIDDEN_STEMS'],
};

export interface Phrase { id: string; file: string; line: number }

export interface Scan { phrases: Phrase[]; unmarked: string[]; frozen: string[] }

const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return path.endsWith('words/en') ? [] : files(path);
  return /\.ts$/.test(name) ? [path] : [];
});

export function scan(): Scan {
  const out: Scan = { phrases: [], unmarked: [], frozen: [] };
  for (const path of files(SRC)) {
    const rel = relative(SRC, path).split('\\').join('/');
    if (NOT_TEXT_FILES.includes(rel)) continue;
    const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const lineOf = (node: ts.Node): number => src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
    const allowed = NOT_TEXT[rel] ?? [];
    const tables = NOT_TEXT_TABLES[rel] ?? [];
    const visit = (node: ts.Node, inFn: boolean, inLive: boolean): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && tables.includes(node.name.text)) return;
      const fn = inFn || ts.isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node);
      if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === 'tr') {
        const template = node.template;
        const parts = ts.isTemplateExpression(template) ? [template.head.text, ...template.templateSpans.map(span => span.literal.text)] : [template.text];
        out.phrases.push({ id: phraseOf(parts), file: rel, line: lineOf(node) });
        if (!fn) out.frozen.push(`${rel}:${lineOf(node)}`);
        if (ts.isTemplateExpression(template)) template.templateSpans.forEach(span => visit(span.expression, fn, false));
        return;
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'live') {
        node.arguments.forEach(arg => visit(arg, fn, true));
        return;
      }
      const plain = node.kind === ts.SyntaxKind.StringLiteral || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral;
      const template = ts.isTemplateExpression(node);
      const text = plain ? (node as ts.LiteralLikeNode).text : template ? [node.head.text, ...node.templateSpans.map(span => span.literal.text)].join('') : '';
      if ((plain || template) && SPOKEN.test(text)) {
        const marked = (inLive && !fn) || allowed.some(word => text.includes(word));
        if (!marked) out.unmarked.push(`${rel}:${lineOf(node)}: ${text.replace(/\s+/g, ' ').slice(0, 70)}`);
      }
      if (ts.isTemplateExpression(node)) { node.templateSpans.forEach(span => visit(span.expression, fn, inLive)); return; }
      node.forEachChild(child => visit(child, fn, inLive));
    };
    visit(src, false, false);
  }
  return out;
}

export const places = (text: string): string[] => [...new Set(text.match(/\{\d+\}/g) ?? [])].sort();
