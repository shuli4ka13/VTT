import { useMemo } from 'react';
import type { System, Sheet, Compendium } from '@vtt/schema';
import { newPass, calc } from '@vtt/engine/engine/calc';
import { hasDesk, blankDesk } from '@vtt/engine/events/desk';
import { resolveRoll } from '@vtt/engine/engine/modifiers';
import type { Pass } from '@vtt/engine/engine/calc';
import type { RollResolution } from '@vtt/engine/engine/modifiers';

export type Computed =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export interface Reader {

  valueOf: (tag: string) => Computed;

  rollOf: (tag: string) => RollResolution | null;
}

export function useReader(system: System, sheet: Sheet | null, compendium: Compendium, desk?: Sheet | null): Reader {
  return useMemo(() => {
    if (!sheet) {
      const idle: Reader = {
        valueOf: () => ({ ok: false, error: 'персонаж не выбран' }),
        rollOf: () => null,
      };
      return idle;
    }

    let pass: Pass;
    try {
      const table = desk !== undefined ? desk : hasDesk(system) ? blankDesk(system) : null;
      pass = newPass(system, sheet, { compendium, desk: table });
    } catch (err) {

      const message = (err as Error).message;
      const broken: Reader = {
        valueOf: () => ({ ok: false, error: message }),
        rollOf: () => null,
      };
      return broken;
    }

    const reader: Reader = {
      valueOf: tag => {
        try { return { ok: true, value: calc(system, sheet, tag, pass) }; }
        catch (err) { return { ok: false, error: (err as Error).message }; }
      },
      rollOf: tag => {
        try { return resolveRoll(system, sheet, tag, pass); }
        catch { return null; }
      },
    };
    return reader;

  }, [system, sheet, compendium, desk]);
}

export function show(value: Computed): { text: string; title?: string; bad: boolean } {
  if (!value.ok) return { text: '—', title: value.error, bad: true };
  if (typeof value.value === 'boolean') return { text: value.value ? 'да' : 'нет', bad: false };
  if (value.value === null || value.value === undefined) return { text: '—', bad: false };
  return { text: String(value.value), bad: false };
}
