import { ROW, columnChoices } from '@vtt/engine';
import type { System } from '@vtt/schema';

export function rowNames(system: System, tableId: string): Map<string, string> {
  const out = new Map<string, string>([[ROW, 'эта строка']]);
  for (const one of columnChoices(system, tableId)) out.set(`${ROW}${one.path}`, one.label);
  return out;
}
