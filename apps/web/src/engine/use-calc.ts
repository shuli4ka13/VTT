import { useMemo } from 'react';
import type { System, Sheet, Compendium } from '@vtt/schema';
import { newPass, calc, findField, livesOn } from '@vtt/engine/engine/calc';
import { hasDesk, blankDesk } from '@vtt/engine/events/desk';
import { resolveRoll } from '@vtt/engine/engine/modifiers';
import type { Pass, Scope } from '@vtt/engine/engine/calc';
import type { RollResolution } from '@vtt/engine/engine/modifiers';

export type Computed =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export interface Reader {

  valueOf: (tag: string) => Computed;

  rollOf: (tags: string[]) => RollResolution | null;

  storedOf?: (tag: string) => unknown;
}

export function useReader(system: System, sheet: Sheet | null, compendium: Compendium, shared?: readonly Sheet[] | null, only?: Scope): Reader {
  return useMemo(() => {
    if (!sheet) {
      const idle: Reader = {
        valueOf: () => ({ ok: false, error: 'персонаж не выбран' }),
        rollOf: () => null,
        storedOf: () => undefined,
      };
      return idle;
    }

    let pass: Pass;
    try {
      const common = shared !== undefined ? shared : hasDesk(system) ? [blankDesk(system)] : null;
      pass = newPass(system, sheet, { compendium, shared: common, ...(only ? { only } : {}) });
    } catch (err) {

      const message = (err as Error).message;
      const broken: Reader = {
        valueOf: () => ({ ok: false, error: message }),
        rollOf: () => null,
        storedOf: tag => sheet.values[tag],
      };
      return broken;
    }

    const reader: Reader = {
      valueOf: tag => {
        try { return { ok: true, value: calc(system, sheet, tag, pass) }; }
        catch (err) { return { ok: false, error: (err as Error).message }; }
      },
      rollOf: tags => {
        try { return resolveRoll(system, sheet, tags, pass); }
        catch { return null; }
      },
      storedOf: tag => {
        const field = findField(system, tag);
        const holder = livesOn(field) === 'group' && pass.group ? pass.group.sheet : livesOn(field) === 'desk' && pass.desk ? pass.desk.sheet : sheet;
        const value = holder.values[tag];
        return value !== undefined ? value : field?.value.kind === 'stored' ? field.value.default : undefined;
      },
    };
    return reader;

  }, [system, sheet, compendium, shared, only]);
}

export function show(value: Computed): { text: string; title?: string; bad: boolean } {
  if (!value.ok) return { text: '—', title: value.error, bad: true };
  if (typeof value.value === 'boolean') return { text: value.value ? 'да' : 'нет', bad: false };
  if (value.value === null || value.value === undefined) return { text: '—', bad: false };
  return { text: String(value.value), bad: false };
}
