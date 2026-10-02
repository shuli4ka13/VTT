import { HOLDER } from '@vtt/engine/model/references';
import { sheetNamesAt } from '@vtt/engine/model/names-at';
import type { Place } from '@vtt/engine/model/names-at';
import type { SheetNames } from '../../../ui/formula-chips.tsx';
import type { System } from '@vtt/schema';

export const sheetsAt = (system: System, id: string, place: Place): SheetNames =>
  new Map(sheetNamesAt(system, id, place).map(one => [one.name, one.label]));

export const holderPhrase = (name: string): string => `@${name} == @${HOLDER}`;

export const splitIf = (expr: string | undefined, holders: string[]): { holder: string; rest: string } => {
  const text = (expr ?? '').trim();
  if (!text) return { holder: '', rest: '' };
  if (holders.includes(text)) return { holder: text, rest: '' };
  const both = /^все\((.*)\)$/su.exec(text);
  if (both) {
    const [first, ...others] = both[1]!.split(/,\s*/u);
    if (first && holders.includes(first.trim())) return { holder: first.trim(), rest: others.join(', ') };
  }
  return { holder: '', rest: text };
};

export const joinIf = (holder: string, rest: string): string | null => {
  const parts = [holder, rest.trim()].filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0]! : `все(${parts.join(', ')})`;
};

