import { choiceTableOf } from '@vtt/engine/model/lists';
import type { System } from '@vtt/schema';

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
      if (column.kind === 'choice' && column.from && !column.many && depth < DEEPEST) walk(path, words, column.from, depth + 1);
    }
  };
  for (const head of heads) walk(head.key, head.label, head.from, 1);
  return out;
}

export const fieldPaths = (system: System): Map<string, string> =>
  columnPaths(system, system.fields
    .filter(f => choiceTableOf(f))
    .map(f => ({ key: f.tag, label: f.label ?? f.tag, from: choiceTableOf(f) })));
