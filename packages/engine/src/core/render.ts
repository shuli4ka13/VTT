import { describeEntry, describeParts } from '../events/describe.ts';
import { describeMoment } from '../events/moments.ts';
import type { System, Sheet } from '../model/types.ts';
import type { Entry } from './log.ts';

export function render(entries: readonly Entry[], system: System, sheets: readonly Sheet[]): string[] {
  return entries.map(entry => {
    if ('text' in entry) return entry.text;
    if (entry.report.kind === 'moment') {
      return describeMoment({ system }, { sheetId: entry.fromId, report: entry.report as never }, [...sheets]);
    }
    return describeEntry(entry, system, [...sheets]);
  });
}

export function renderLines(entries: readonly Entry[], system: System, sheets: readonly Sheet[]): (string[] | null)[] {
  return entries.map(entry => {
    if ('text' in entry || entry.report.kind === 'moment') return null;
    const { head, lines } = describeParts(entry, system, [...sheets]);
    return lines.length ? [head, ...lines] : null;
  });
}
