import { ROW, columnChoices } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { t } from '../../i18n/author.ts';

export function rowNames(system: System, tableId: string): Map<string, string> {
  const out = new Map<string, string>([[ROW, t('fields:row.this')]]);
  for (const one of columnChoices(system, tableId)) out.set(`${ROW}${one.path}`, one.label);
  return out;
}
