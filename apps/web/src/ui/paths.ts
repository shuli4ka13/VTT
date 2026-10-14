import type { System } from '@vtt/schema';
import { columnChoices, sheetChoices, walkSheet } from '@vtt/engine/model/paths';

export function columnPaths(
  system: System, heads: { key: string; label: string; from?: string }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const head of heads) {
    if (!head.from) continue;
    for (const one of columnChoices(system, head.from)) out.set(`${head.key}${one.path}`, `${head.label} → ${one.label}`);
  }
  return out;
}

export const fieldPaths = (system: System): Map<string, string> => sheetChoices(system);

export const sheetPathLabel = (system: System, tag: string): string | null => {
  const walked = walkSheet(system, tag);
  return walked?.ok ? walked.label : null;
};
