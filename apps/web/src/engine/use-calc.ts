import { useMemo } from 'react';
import type { System, Sheet, Compendium, FieldOption } from '@vtt/schema';
import { compile, newPass, calc, baseOf, findField, livesOn, hasDesk, blankDesk, resolveRoll, toolsOf, HOLDER } from '@vtt/engine';
import type { Pass, Scope, RollResolution } from '@vtt/engine';
import { shownDice } from '../ui/formula-lang.ts';

export type Computed =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export interface Reader {

  valueOf: (tag: string) => Computed;

  rollOf: (tags: string[]) => RollResolution | null;

  storedOf?: (tag: string) => unknown;

  measure?: (expr: string) => Computed;
}

export function useReader(system: System, sheet: Sheet | null, compendium: Compendium, shared?: readonly Sheet[] | null, only?: Scope): Reader {
  return useMemo(() => {
    if (!sheet) {
      const idle: Reader = {
        valueOf: () => ({ ok: false, error: 'персонаж не выбран' }),
        rollOf: () => null,
        storedOf: () => undefined,
        measure: () => ({ ok: false, error: 'персонаж не выбран' }),
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
        measure: () => ({ ok: false, error: message }),
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
        const holder = livesOn(field) === 'group' && pass.group ? pass.group : livesOn(field) === 'desk' && pass.desk ? pass.desk : pass;
        const own = holder.sheet.values[tag];
        if (own !== undefined || !field) return own;
        try { return baseOf(holder, field); } catch { return undefined; }
      },
      measure: expr => {
        const resolve = (name: string) => pass.resolve(name.startsWith(`${HOLDER}.`) ? name.slice(HOLDER.length + 1) : name);
        try { return { ok: true, value: compile(expr).evaluate(resolve, toolsOf(system, pass, 'формула')) }; }
        catch (err) { return { ok: false, error: (err as Error).message }; }
      },
    };
    return reader;

  }, [system, sheet, compendium, shared, only]);
}

export function show(value: Computed, options?: FieldOption[]): { text: string; title?: string; bad: boolean } {
  if (!value.ok) return { text: '—', title: value.error, bad: true };
  if (Array.isArray(value.value)) {
    const labels = value.value.map(item => options?.find(option => String(option.value) === String(item))?.label ?? String(item));
    return { text: labels.length ? labels.join(', ') : '—', bad: false };
  }
  if (typeof value.value === 'boolean') return { text: value.value ? 'да' : 'нет', bad: false };
  if (value.value === null || value.value === undefined) return { text: '—', bad: false };
  return { text: typeof value.value === 'string' ? shownDice(value.value) : String(value.value), bad: false };
}
