import { endOf, isFlow } from './flow.ts';
import { ROLL_CALL } from '../words/calls.ts';
import { findRoll, writeRoll, factorsOf, bare, tight } from './amounts.ts';
import type { System, Step } from './types.ts';

export type CritChoice = 'off' | 'double' | 'explode';
export type ArmorChoice = 'none' | 'threshold' | 'ablation';

export interface ToggleOption<T extends string> { key: T; label: string; hint: string }

export const CRIT_OPTIONS: ToggleOption<CritChoice>[] = [
  { key: 'off', label: 'нет', hint: 'Максимум на кости — просто максимум.' },
  {
    key: 'double', label: 'кости урона вдвое',
    hint: 'Выпал максимум на проверке — кости следующего «числа» кидаются вдвое, ещё до броска. Так в D&D.',
  },
  {
    key: 'explode', label: 'взрывная кость',
    hint: 'Кость проверки на максимуме кидается ещё раз и прибавляется — у всех бросков. Так в Cyberpunk RED и Savage Worlds.',
  },
];

export const ARMOR_OPTIONS: ToggleOption<ArmorChoice>[] = [
  { key: 'none', label: 'урон целиком', hint: 'Броня, если есть, живёт в классе защиты: попал — снял всё.' },
  {
    key: 'threshold', label: 'порог',
    hint: 'Урон не выше брони не проходит вовсе; выше — проходит целиком. Броня не портится.',
  },
  {
    key: 'ablation', label: 'вычитание и износ',
    hint: 'Из урона вычитается броня, остаток идёт в хиты, а броня теряет единицу.',
  },
];

export const CRIT_EDIT = 'crit_explode';
export const CRIT_RULE = 'crit_explode_rule';
export const ARMOR_STEP = 'сквозь_броню';

const owned = (step: Step): boolean => {
  const by = (step as { by?: unknown }).by;
  return by !== undefined && by !== null;
};

const amountsAfterCheck = (steps: Step[]): { check: Step; amount: Step }[] => {
  const out: { check: Step; amount: Step }[] = [];
  let check: Step | null = null;
  for (const step of steps) {
    if (step.type !== 'roll') continue;
    const s = step as Record<string, unknown>;
    if (owned(step)) {
      check = step.id ? step : null;
      continue;
    }
    if (!check) continue;
    const rolls = s.die !== undefined || findRoll((s.fixed as { expr?: unknown } | undefined)?.expr) !== null;
    if (rolls) out.push({ check, amount: step });
  }
  return out;
};

const DOUBLER = /^если\(.*,\s*2\s*,\s*1\s*\)$/;

export function critOf(system: System): CritChoice {
  if ((system.grants ?? []).includes(CRIT_RULE) && system.effects[CRIT_RULE]) return 'explode';
  const doubled = Object.values(system.effects).some(effect =>
    (effect.steps ?? []).some(step => isDoubling(step as Record<string, unknown>)));
  return doubled ? 'double' : 'off';
}

const isDoubling = (step: Record<string, unknown>): boolean => {
  if (step.type !== 'roll' || owned(step as Step)) return false;
  const count = step.count as { expr?: unknown } | undefined;
  if (typeof count?.expr === 'string' && DOUBLER.test(count.expr)) return true;
  const call = findRoll((step.fixed as { expr?: unknown } | undefined)?.expr);
  return call?.times !== null && call?.times !== undefined
    && factorsOf(bare(call.times)).some(part => DOUBLER.test(bare(part)));
};

const withoutDoubler = (step: Record<string, unknown>): void => {
  const fixed = step.fixed as { expr?: unknown } | undefined;
  const call = findRoll(fixed?.expr);
  if (!call || !call.times) return;
  const kept = factorsOf(bare(call.times)).filter(part => !DOUBLER.test(bare(part)));
  const times = kept.length === 1 ? bare(kept[0]!) : kept.length ? kept.map(tight).join(' * ') : null;
  step.fixed = { ...fixed, expr: writeRoll({ ...call, times }) };
};

const withDoubler = (step: Record<string, unknown>, check: string): void => {
  const crit = `если(@${check}.atMax >= 1, 2, 1)`;
  const fixed = step.fixed as { expr?: unknown } | undefined;
  const call = findRoll(fixed?.expr);
  if (!call) {
    step.count = { expr: crit };
    return;
  }
  const times = call.times ? `${tight(call.times)} * ${crit}` : crit;
  step.fixed = { ...fixed, expr: writeRoll({ ...call, times }) };
};

export function setCrit(draft: System, choice: CritChoice): void {
  for (const effect of Object.values(draft.effects)) {
    for (const step of effect.steps ?? []) {
      const loose = step as Record<string, unknown>;
      if (!isDoubling(loose)) continue;
      delete loose.count;
      withoutDoubler(loose);
    }
  }
  delete draft.effects[CRIT_RULE];
  draft.grants = (draft.grants ?? []).filter(id => id !== CRIT_RULE);
  if (draft.roll_edits?.[CRIT_EDIT]) delete draft.roll_edits[CRIT_EDIT];

  if (choice === 'double') {
    for (const effect of Object.values(draft.effects)) {
      for (const { check, amount } of amountsAfterCheck(effect.steps ?? [])) {
        withDoubler(amount as Record<string, unknown>, String(check.id));
      }
    }
  }
  if (choice === 'explode') {
    (draft.roll_edits ??= {})[CRIT_EDIT] = { label: 'Взрывная кость', ops: [{ op: 'explode' }] };
    draft.effects[CRIT_RULE] = {
      label: 'Взрывная кость', activation: 'passive', duration: { kind: 'permanent' },
      description: 'Кость проверки на максимуме кидается ещё раз, результат прибавляется.',
      modifiers: [{ kind: 'edit', call: ROLL_CALL, param: 'edits', edit: CRIT_EDIT }],
    };
    draft.grants = [...(draft.grants ?? []), CRIT_RULE];
  }
}

export function armorTail(choice: ArmorChoice, armor: string, hp: string, amount: string, sheet: string): Step[] {
  const value = { expr: `@${amount}` };
  const field = (tag: string) => ({ expr: `@${sheet}.${tag}` });
  if (choice === 'none') {
    return [{ type: 'apply', target: field(hp), value } as Step];
  }
  const through = { type: 'check', value, versus: field(armor), successWhen: 'over', id: ARMOR_STEP } as Step;
  const held = [
    { type: 'branch', if: { expr: `не(@${ARMOR_STEP}.success)` } } as Step,
    { type: 'stop', note: { expr: '"броня выдержала"' } } as Step,
    { type: 'end' } as Step,
  ];
  if (choice === 'threshold') {
    return [through, ...held, { type: 'apply', target: field(hp), value } as Step];
  }
  return [
    through,
    ...held,
    { type: 'apply', target: field(hp), value: { expr: `@${ARMOR_STEP}.margin` } } as Step,
    { type: 'apply', target: field(armor), value: { expr: '1' } } as Step,
  ];
}

export interface ArmorReading { choice: ArmorChoice; armor: string | null; hp: string | null }

const fieldIn = (ref: unknown): string | null => {
  const expr = ref && typeof ref === 'object' && 'expr' in ref ? String((ref as { expr: unknown }).expr) : '';
  return /^\s*@[\p{L}\p{N}_]+\.([\p{L}\p{N}_.]+)\s*$/u.exec(expr)?.[1] ?? null;
};

export function armorOf(system: System, event: string): ArmorReading {
  const steps = (system.effects?.[event]?.steps ?? []) as Record<string, unknown>[];
  const first = steps.find(step => !isFlow(step as { type?: unknown }));
  const armorTag = fieldIn(first?.versus);
  if (!first || first.type !== 'check' || !armorTag) return { choice: 'none', armor: null, hp: null };
  const armor = armorTag;
  const applies = steps.filter(s => s.type === 'apply');
  const hp = applies.map(s => fieldIn(s.target)).find(tag => tag && tag !== armor) ?? null;
  const wears = applies.some(s => fieldIn(s.target) === armor);
  if (String(first.successWhen ?? 'atLeast') === 'over' && !wears) return { choice: 'threshold', armor, hp };
  if (wears) return { choice: 'ablation', armor, hp };
  return { choice: 'none', armor, hp };
}

export const sheetInputOf = (effect: System['effects'][string] | undefined): string | null =>
  (effect?.params ?? []).find(param => param.kind === 'sheet' && !param.many)?.key ?? null;

export function setArmor(draft: System, choice: ArmorChoice, at: { event: string; armor: string; hp: string }): void {
  const called = draft.effects?.[at.event];
  const sheet = sheetInputOf(called);
  if (!called || !sheet) return;
  const params = called.params ?? [];
  const amount = params.find(param => param.role === 'amount')?.key ?? 'amount';
  const steps = (called.steps ?? []) as Record<string, unknown>[];
  const anchor = steps.find(step => fieldIn(step.versus) === at.armor || fieldIn(step.target) === at.armor)
    ?? steps.find(step => step.type === 'apply' && fieldIn(step.target) === at.hp);
  const tail = armorTail(choice, at.armor, at.hp, amount, sheet) as Step[];
  if (!anchor) { called.steps = tail; return; }
  const here = steps.indexOf(anchor);
  const tailAt = (index: number): number | null => {
    const step = steps[index];
    if (!step) return null;
    if (fieldIn(step.versus) === at.armor || [at.armor, at.hp].includes(fieldIn(step.target) ?? '')) return index;
    const cond = (step.if as { expr?: unknown } | undefined)?.expr;
    if (step.type === 'branch' && typeof cond === 'string' && cond.includes(`@${ARMOR_STEP}`)) return endOf(steps as Step[], index);
    return null;
  };
  const from = here;
  let to = tailAt(here) ?? here;
  for (let next = tailAt(to + 1); next !== null; next = tailAt(to + 1)) to = next;
  called.steps = [...steps.slice(0, from), ...tail, ...steps.slice(to + 1)] as Step[];
}
