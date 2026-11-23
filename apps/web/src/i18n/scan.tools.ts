import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const RUSSIAN = /[А-Яа-яЁё]/u;

export interface Place { line: number; text: string }

export function cyrillicIn(path: string, text: string): Place[] {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const found: Place[] = [];
  const visit = (node: ts.Node) => {
    const k = node.kind;
    const literal = k === ts.SyntaxKind.StringLiteral || k === ts.SyntaxKind.NoSubstitutionTemplateLiteral
      || k === ts.SyntaxKind.TemplateHead || k === ts.SyntaxKind.TemplateMiddle || k === ts.SyntaxKind.TemplateTail
      || k === ts.SyntaxKind.JsxText || k === ts.SyntaxKind.RegularExpressionLiteral;
    if (literal) {
      const value = k === ts.SyntaxKind.JsxText || k === ts.SyntaxKind.RegularExpressionLiteral
        ? node.getText(source)
        : (node as ts.LiteralLikeNode).text;
      if (RUSSIAN.test(value)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        found.push({ line: line + 1, text: value.trim().replace(/\s+/g, ' ').slice(0, 60) });
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
  return found;
}

export function sourcesOf(dir: string, root: string = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      out.push(...sourcesOf(path, root));
    } else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

export const exempt = (rel: string): boolean =>
  /\.test\.tsx?$/.test(rel) || rel.startsWith('i18n/') || rel.startsWith('testing/');
