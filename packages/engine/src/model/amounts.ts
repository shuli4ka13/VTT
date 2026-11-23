export function factorsOf(times: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < times.length; i += 1) {
    const ch = times[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === '*' && depth === 0) {
      out.push(times.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(times.slice(from).trim());
  return out.filter(Boolean);
}

export function bare(part: string): string {
  let text = part.trim();
  while (text.startsWith('(') && text.endsWith(')')) {
    let depth = 0;
    let paired = true;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') {
        depth -= 1;
        if (depth === 0 && i !== text.length - 1) { paired = false; break; }
      }
    }
    if (!paired) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

const LOW = '+-?:<>=';

export function tight(part: string): string {
  const text = bare(part);
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && LOW.includes(ch) && i > 0) return `(${text})`;
  }
  return text;
}

export interface TableCall { table: string; arg: string; column: string | null }

const TABLE = 'table';

function splitArgs(inside: string): string[] | null {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let from = 0;
  for (let i = 0; i < inside.length; i += 1) {
    const ch = inside[i]!;
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) { out.push(inside.slice(from, i).trim()); from = i + 1; }
    if (depth < 0) return null;
  }
  if (quote || depth !== 0) return null;
  out.push(inside.slice(from).trim());
  return out;
}

const unquote = (part: string | undefined): string | null => {
  const m = /^(["'])(.*)\1$/su.exec(part?.trim() ?? '');
  return m ? m[2]! : null;
};

export function tableCallOf(expr: unknown): TableCall | null {
  if (typeof expr !== 'string') return null;
  const text = expr.trim();
  if (!text.startsWith(`${TABLE}(`) || !text.endsWith(')')) return null;
  const args = splitArgs(text.slice(TABLE.length + 1, -1));
  if (!args || args.length < 2 || args.length > 3) return null;
  const table = unquote(args[0]);
  const column = args.length === 3 ? unquote(args[2]) : null;
  if (table === null || (args.length === 3 && column === null)) return null;
  return { table, arg: args[1]!, column };
}

const quote = (value: string): string => (value.includes('"') ? `'${value}'` : `"${value}"`);

export const writeTableCall = ({ table, arg, column }: TableCall): string =>
  `${TABLE}(${quote(table)}, ${arg.trim() || '0'}${column && column !== 'value' ? `, ${quote(column)}` : ''})`;
