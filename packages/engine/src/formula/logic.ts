import type { Node } from './ast.ts';
import { AND, parse } from './parse.ts';
import { printFormula, bindsLooser } from './print.ts';

export function andParts(node: Node): Node[] {
  return node.kind === 'Binary' && node.op === AND ? [...andParts(node.left), ...andParts(node.right)] : [node];
}

export function joinAnd(parts: readonly Node[]): Node | null {
  return parts.reduce<Node | null>((left, right) => (left ? { kind: 'Binary', op: AND, left, right } : right), null);
}

export function andText(parts: readonly string[]): string {
  const kept = parts.map(part => part.trim()).filter(Boolean);
  if (kept.length < 2) return kept[0] ?? '';
  return printFormula(joinAnd(kept.map(part => parse(part)))!);
}

export const andPartsText = (source: string): string[] => andParts(parse(source)).map(printFormula);

export function operandText(text: string, op: string): string {
  try { return bindsLooser(parse(text), op) ? `(${text})` : text; } catch { return text; }
}
