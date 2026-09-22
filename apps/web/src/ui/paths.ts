import type { System } from '@vtt/schema';

export function columnPaths(
  system: System, heads: { key: string; label: string; from?: string }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const head of heads) {
    const table = head.from ? system.tables?.[head.from] : undefined;
    for (const column of (table?.columns ?? [])) {
      out.set(`${head.key}.${column.key}`, `${head.label} → ${column.label || column.key}`);
    }
  }
  return out;
}

export const fieldPaths = (system: System): Map<string, string> =>
  columnPaths(system, system.fields
    .filter(f => f.optionsFrom)
    .map(f => ({ key: f.tag, label: f.label ?? f.tag, from: f.optionsFrom })));
