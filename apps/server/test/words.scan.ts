import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { phraseOf } from '../src/common/words.ts';

export const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const SPOKEN = /[\u0400-\u04FF]/u;

export const NOT_TEXT_FILES = ['seed.ts', 'seed-run.ts', 'main.ts', 'common/words.en.ts'];

const TAGS = new Set(['say', 'told']);

const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.ts$/.test(name) ? [path] : [];
});

export interface Scan { phrases: string[]; unmarked: string[] }

export function scan(): Scan {
  const out: Scan = { phrases: [], unmarked: [] };
  for (const path of files(SRC)) {
    const rel = relative(SRC, path).split('\\').join('/');
    if (NOT_TEXT_FILES.includes(rel)) continue;
    const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isTaggedTemplateExpression(node)) {
        const tag = node.tag;
        const named = ts.isIdentifier(tag) ? TAGS.has(tag.text) : ts.isCallExpression(tag) && ts.isIdentifier(tag.expression) && tag.expression.text === 'sayIn';
        if (named) {
          const template = node.template;
          out.phrases.push(phraseOf(ts.isTemplateExpression(template) ? [template.head.text, ...template.templateSpans.map(span => span.literal.text)] : [template.text]));
          if (ts.isTemplateExpression(template)) template.templateSpans.forEach(span => visit(span.expression));
          return;
        }
      }
      const plain = node.kind === ts.SyntaxKind.StringLiteral || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral || node.kind === ts.SyntaxKind.RegularExpressionLiteral;
      const text = plain ? node.getText(src) : ts.isTemplateExpression(node) ? [node.head.text, ...node.templateSpans.map(span => span.literal.text)].join('') : '';
      if (text && SPOKEN.test(text)) {
        out.unmarked.push(`${rel}:${src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1}: ${text.replace(/\s+/g, ' ').slice(0, 70)}`);
      }
      if (ts.isTemplateExpression(node)) { node.templateSpans.forEach(span => visit(span.expression)); return; }
      node.forEachChild(visit);
    };
    visit(src);
  }
  return out;
}

export const places = (text: string): string[] => [...new Set(text.match(/\{\d+\}/g) ?? [])].sort();
