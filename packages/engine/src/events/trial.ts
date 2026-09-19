import { exchange } from './exchange.ts';
import type { ExchangeResult } from './exchange.ts';
import { describeEntry } from './describe.ts';
import { activationOf, isPipeline } from '../engine/effects.ts';
import { EngineError } from '../engine/errors.ts';
import { registry } from '../engine/steps/index.ts';
import type { System, Compendium, Sheet, Die, Effect } from '../model/types.ts';

export type DiceMode = 'min' | 'avg' | 'max' | 'random';

export const DICE_MODES: Record<DiceMode, { label: string; hint: string }> = {
  min: { label: 'минимум', hint: 'на каждой кости единица' },
  avg: { label: 'среднее', hint: 'на каждой кости середина, округлённая вверх' },
  max: { label: 'максимум', hint: 'на каждой кости старшая грань' },
  random: { label: 'случайно', hint: 'как за столом' },
};

export function dieOf(mode: DiceMode, random: () => number = Math.random): Die {
  if (mode === 'min') return () => 1;
  if (mode === 'max') return sides => sides;
  if (mode === 'avg') return sides => Math.ceil((sides + 1) / 2);
  return sides => 1 + Math.floor(random() * sides);
}

export function sampleArg(kind: string | undefined, system: System, effect?: Effect, key?: string): unknown {
  if (kind === 'dice') return '1d6';
  if (kind === 'number') return 1;
  if (kind === 'expr') return '0';
  if (kind === 'effect') return Object.keys(system.effects)[0] ?? '';
  if (kind === 'tag') return (system.fields.find(f => f.value.kind === 'stored' && f.value.type === 'number') ?? system.fields[0])?.tag ?? '';
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
  return { id, systemId: system.id ?? 'system', kind: 'npc', name, values: {}, equipped: [], effects: [], actions: [] };
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
    throw new EngineError(`пробный прогон: эффект «${effect.label ?? effectId}» пассивный — у него нет цепочки, его вешают`);
  }
  if (activationOf(effect) !== 'manual') {
    throw new EngineError(`пробный прогон: эффект «${effect.label ?? effectId}» срабатывает сам — запустите тот, кого он слушает`);
  }
  const filled: Record<string, unknown> = {};
  for (const param of effect.params ?? []) {
    filled[param.key] = args?.[param.key] !== undefined ? args[param.key] : sampleArg(param.kind, system, effect, param.key);
  }
  const probe: System = {
    ...system,
    records: {
      ...(system.records ?? {}),
      [TRIAL_KIND]: { kind: 'action', label: 'Проба', props: [], bindings: [{ label: effect.label ?? effectId, effect: effectId, args: filled }] },
    },
  } as System;
  const book: Compendium = {
    items: compendium?.items ?? [],
    actions: [...(compendium?.actions ?? []), { id: TRIAL_RECORD, rk: TRIAL_KIND, label: effect.label ?? effectId, props: {} }],
  };
  const sender: Sheet = { ...from, actions: [...(from.actions ?? []), TRIAL_RECORD] };
  const sheets = from.id === to.id ? [sender] : [sender, to];
  const result = exchange({
    system: probe, compendium: book, die: dieOf(dice, random), sheets,
    actionId: `${TRIAL_RECORD}:0`, fromId: sender.id, toId: to.id,
  });
  const lines = result.reports.map(entry => describeEntry(entry, probe, result.sheets));
  return { ...result, lines };
}
