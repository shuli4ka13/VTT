import type { System } from '@vtt/schema';
import { fieldsOf, fieldLinkOf } from '@vtt/engine/model/sheet-columns';
import { linkOf } from '@vtt/engine/model/tables';

const DEEPEST = 3;

export function columnPaths(
  system: System, heads: { key: string; label: string; from?: string }[],
): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (key: string, label: string, from: string | undefined, depth: number) => {
    const table = from ? system.tables?.[from] : undefined;
    for (const column of (table?.columns ?? [])) {
      const path = `${key}.${column.key}`;
      const words = `${label} → ${column.label || column.key}`;
      out.set(path, words);
      if (linkOf(column) && !column.many && depth < DEEPEST) walk(path, words, linkOf(column), depth + 1);
    }
  };
  for (const head of heads) walk(head.key, head.label, head.from, 1);
  return out;
}

export const fieldPaths = (system: System): Map<string, string> =>
  columnPaths(system, fieldsOf(system)
    .filter(f => fieldLinkOf(system, f))
    .map(f => ({ key: f.tag, label: f.label ?? f.tag, from: fieldLinkOf(system, f) })));
