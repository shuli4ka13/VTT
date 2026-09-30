import { deskOf, hasDesk, blankDesk } from './desk.ts';
import { exchange } from './exchange.ts';
import type { ExchangeResult } from './exchange.ts';
import { describeEntry } from './describe.ts';
import { isPipeline } from '../engine/effects.ts';
import { EngineError } from '../engine/errors.ts';
import { registry } from '../engine/steps/index.ts';
import { listOf } from '../model/lists.ts';
import type { System, Compendium, Sheet, Die, Effect } from '../model/types.ts';

export type DiceMode = 'min' | 'avg' | 'max' | 'random';

export const DICE_MODES: Record<DiceMode, { label: string; hint: string }> = {
  min: { label: 'минимум', hint: 'на каждой кости единица' },
  avg: { label: 'среднее', hint: 'на каждой кости середина, округлённая вверх' },
  max: { label: 'максимум', hint: 'на каждой кости старшая грань' },
  random: { label: 'случайно', hint: 'как за столом' },
};

export function dieOf(mode: DiceMode, random?: () => number): Die {
  if (mode === 'min') return () => 1;
  if (mode === 'max') return sides => sides;
  if (mode === 'avg') return sides => Math.ceil((sides + 1) / 2);
  if (!random) throw new EngineError('проба «случайно»: источник случайности не передан — движок сам костей не выдумывает');
  return sides => 1 + Math.floor(random() * sides);
}

export function sampleArg(
  kind: string | undefined, system: System, effect?: Effect, key?: string, from?: string,
): unknown {
  const list = listOf(system, from);
  if (list?.length) return list[0]!.value;
  if (kind === 'dice') return '1к6';
  if (kind === 'number') return 1;
  if (kind === 'text') return 'проба';
  if (kind === 'effect') return Object.keys(system.effects)[0] ?? '';
  if (kind === 'choice' && effect && key) return firstChoice(effect, key) ?? '';
  return '';
}

function firstChoice(effect: Effect, key: string): string | null {
  for (const step of effect.steps ?? []) {
    const slots = (registry.get(step.type)?.slots ?? []) as { key: string; options?: readonly string[] }[];
    for (const slot of slots) {
      const value = (step as Record<string, unknown>)[slot.key];
      if (value && typeof value === 'object' && (value as { param?: unknown }).param === key && slot.options?.length) {
        return String(slot.options[0]);
      }
    }
  }
  return null;
}

export function mannequin(system: System, id: string, name: string): Sheet {
  return { id, systemId: system.id ?? 'system', name, values: {}, has: [], effects: [] };
}

export interface TrialArgs {
  system: System;
  compendium?: Compendium;
  effectId: string;
  from: Sheet;
  to: Sheet;
  args?: Record<string, unknown>;
  dice?: DiceMode;
  random?: () => number;
}

export interface TrialResult extends ExchangeResult {
  lines: string[];
}

const TRIAL_KIND = '__проба';
const TRIAL_RECORD = '__проба';

export function trial({ system, compendium, effectId, from, to, args, dice = 'avg', random }: TrialArgs): TrialResult {
  const effect: Effect | undefined = system.effects[effectId];
  if (!effect) throw new EngineError(`пробный прогон: система не объявляет эффекта «${effectId}»`);
  if (!isPipeline(effect)) {
    throw new EngineError(`пробный прогон: эффект «${effect.label ?? effectId}» висит на листе — его не запускают кнопкой, запустите то, на что он отзывается`);
  }
  const filled: Record<string, unknown> = {};
  for (const param of effect.params ?? []) {
    filled[param.key] = args?.[param.key] !== undefined
      ? args[param.key]
      : sampleArg(param.kind, system, effect, param.key, param.from);
  }
  const probe: System = {
    ...system,
    tables: {
      ...(system.tables ?? {}),
      [TRIAL_KIND]: { shape: 'book', use: 'action', label: 'Проба', columns: [], bindings: [{ label: effect.label ?? effectId, effect: effectId, args: filled }] },
    },
  } as System;
  const book: Compendium = {
    records: [...(compendium?.records ?? []), { id: TRIAL_RECORD, table: TRIAL_KIND, label: effect.label ?? effectId, cells: {} }],
  };
  const sender: Sheet = { ...from, has: [...(from.has ?? []), { of: TRIAL_RECORD }] };
  const people = from.id === to.id ? [sender] : [sender, to];
  const sheets = hasDesk(system) && !deskOf(people) ? [...people, blankDesk(system)] : people;
  const result = exchange({
    system: probe, compendium: book, die: dieOf(dice, random), sheets,
    actionId: `${TRIAL_RECORD}:0`, fromId: sender.id, toId: to.id,
  });
  const lines = result.reports.map(entry => describeEntry(entry, probe, result.sheets));
  return { ...result, lines };
}
