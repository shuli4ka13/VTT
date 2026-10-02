import { describeEntry } from '../events/describe.ts';
import { describeMoment } from '../events/moments.ts';
import type { System, Sheet, Compendium } from '../model/types.ts';
import type { Entry } from './log.ts';

export function render(entries: readonly Entry[], system: System, compendium: Compendium, sheets: readonly Sheet[]): string[] {
  return entries.map(entry => {
    if ('text' in entry) return entry.text;
    if (entry.report.kind === 'moment') {
      return describeMoment({ system, compendium, die: () => 1 }, { sheetId: entry.fromId, report: entry.report as never }, [...sheets]);
    }
    return describeEntry(entry, system, [...sheets]);
  });
}
