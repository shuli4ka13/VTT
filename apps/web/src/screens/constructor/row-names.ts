import { ROW } from '@vtt/engine/model/sheet-columns';
import { columnChoices } from '@vtt/engine/model/paths';
import type { System } from '@vtt/schema';

export function rowNames(system: System, tableId: string): Map<string, string> {
  const out = new Map<string, string>([[ROW, 'эта строка']]);
  for (const one of columnChoices(system, tableId)) out.set(`${ROW}${one.path}`, one.label);
  return out;
}
