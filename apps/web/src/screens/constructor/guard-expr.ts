import { compile, printFormula } from '@vtt/engine/formula';
import type { Node } from '@vtt/engine/formula';

export interface RowIs { table: string; column: string; is: string }

export interface When {
  ref: string;
  not?: boolean;
  atLeast?: string;
  atMost?: string;
  has?: string;
  where?: RowIs;
}

const quote = (value: string): string => (value.includes('"') ? `'${value}'` : `"${value}"`);

const refOf = (node: Node | undefined): string | null => (node?.kind === 'Ref' ? node.tag : null);
const textOf = (node: Node | undefined): string | null => (node?.kind === 'Text' ? node.value : null);

function part(node: Node, when: Partial<When>): boolean {
  if (node.kind === 'Ref') {
    if (when.ref && when.ref !== node.tag) return false;
    when.ref = node.tag;
    return true;
  }
  if (node.kind === 'Binary' && (node.op === '>=' || node.op === '<=')) {
    const ref = refOf(node.left);
    if (!ref || (when.ref && when.ref !== ref)) return false;
    when.ref = ref;
    const bound = printFormula(node.right);
    if (node.op === '>=') { if (when.atLeast !== undefined) return false; when.atLeast = bound; }
    else { if (when.atMost !== undefined) return false; when.atMost = bound; }
    return true;
  }
  if (node.kind === 'Call' && node.name === 'есть' && node.args.length === 2) {
    const [first, second] = node.args;
    const wanted = textOf(second);
    if (wanted === null) return false;
    const ref = refOf(first);
    if (ref) {
      if ((when.ref && when.ref !== ref) || when.has !== undefined) return false;
      when.ref = ref;
      when.has = wanted;
      return true;
    }
    if (first?.kind === 'Call' && first.name === 'таблица' && first.args.length === 3) {
      const table = textOf(first.args[0]);
      const inner = refOf(first.args[1]);
      const column = textOf(first.args[2]);
      if (table === null || !inner || column === null || when.where) return false;
      if (when.ref && when.ref !== inner) return false;
      when.ref = inner;
      when.where = { table, column, is: wanted };
      return true;
    }
  }
  return false;
}

export function readGuard(expr: string | undefined | null): When | null {
  if (!expr?.trim()) return null;
  let ast: Node;
  try { ast = compile(expr).ast; } catch { return null; }
  const when: Partial<When> = {};
  if (ast.kind === 'Call' && ast.name === 'не' && ast.args.length === 1) {
    when.not = true;
    ast = ast.args[0]!;
  }
  const parts = ast.kind === 'Call' && ast.name === 'все' ? ast.args : [ast];
  if (!parts.every(node => part(node, when)) || !when.ref) return null;
  const plain = when.atLeast === undefined && when.atMost === undefined && when.has === undefined && !when.where;
  if (!plain && parts.length === 1 && parts[0]!.kind === 'Ref') return null;
  if (plain && parts.length > 1) return null;
  return when as When;
}

export function writeGuard(when: When): string {
  const name = `@${when.ref}`;
  const parts: string[] = [];
  if (when.atLeast !== undefined && when.atLeast.trim()) parts.push(`${name} >= ${when.atLeast.trim()}`);
  if (when.atMost !== undefined && when.atMost.trim()) parts.push(`${name} <= ${when.atMost.trim()}`);
  if (when.has !== undefined && when.has !== '') parts.push(`есть(${name}, ${quote(when.has)})`);
  if (when.where) parts.push(`есть(таблица(${quote(when.where.table)}, ${name}, ${quote(when.where.column)}), ${quote(when.where.is)})`);
  if (!parts.length) parts.push(name);
  const joined = parts.length > 1 ? `все(${parts.join(', ')})` : parts[0]!;
  return when.not ? `не(${joined})` : joined;
}

const tidy = (expr: string): string => {
  try { return printFormula(compile(expr).ast); } catch { return expr.trim(); }
};

export function splitHolder(expr: string | undefined | null, holders: readonly string[]): { holder: string; rest: string } {
  const text = (expr ?? '').trim();
  if (!text) return { holder: '', rest: '' };
  const wanted = new Map(holders.map(phrase => [tidy(phrase), phrase]));
  let ast: Node;
  try { ast = compile(text).ast; } catch { return { holder: '', rest: text }; }
  const whole = wanted.get(printFormula(ast));
  if (whole) return { holder: whole, rest: '' };
  if (ast.kind !== 'Call' || ast.name !== 'все') return { holder: '', rest: text };
  const at = ast.args.findIndex(arg => wanted.has(printFormula(arg)));
  if (at < 0) return { holder: '', rest: text };
  const others = ast.args.filter((_, index) => index !== at).map(arg => printFormula(arg));
  return { holder: wanted.get(printFormula(ast.args[at]!))!, rest: others.length === 1 ? others[0]! : `все(${others.join(', ')})` };
}

export function joinHolder(holder: string, rest: string): string | null {
  const tail = rest.trim();
  if (!holder) return tail || null;
  if (!tail) return holder;
  let ast: Node | null = null;
  try { ast = compile(tail).ast; } catch { ast = null; }
  const parts = ast && ast.kind === 'Call' && ast.name === 'все' ? ast.args.map(arg => printFormula(arg)) : [tail];
  return `все(${[holder, ...parts].join(', ')})`;
}
