import { NAMES } from '../words/names.ts';
import { endOf, isFlow } from './flow.ts';
import { ROLL_CALL } from '../words/calls.ts';
import { holderConditionOf } from './references.ts';
import { factorsOf, bare, tight } from './amounts.ts';
import { rolesOf } from './buttons.ts';
import type { System, Step } from './types.ts';
import { tr, live } from '../words/tongue.ts';
import { inSystemTongue } from './localize.ts';

export type CritChoice = 'off' | 'double' | 'explode';
export type ArmorChoice = 'none' | 'threshold' | 'ablation';

export interface ToggleOption<T extends string> { key: T; label: string; hint: string }

export const CRIT_OPTIONS: ToggleOption<CritChoice>[] = live([
  { key: 'off', label: 'нет', hint: 'Максимум на кости — просто максимум.' },
  {
    key: 'double', label: 'кости урона вдвое',
    hint: 'Выпал максимум на проверке — кости следующего «числа» кидаются вдвое, ещё до броска. Так в D&D.',
  },
  {
    key: 'explode', label: 'взрывная кость',
    hint: 'Кость проверки на максимуме кидается ещё раз и прибавляется — у всех бросков. Так в Cyberpunk RED и Savage Worlds.',
  },
]);

export const ARMOR_OPTIONS: ToggleOption<ArmorChoice>[] = live([
  { key: 'none', label: 'урон целиком', hint: 'Броня, если есть, живёт в классе защиты: попал — снял всё.' },
  {
    key: 'threshold', label: 'порог',
    hint: 'Урон не выше брони не проходит вовсе; выше — проходит целиком. Броня не портится.',
  },
  {
    key: 'ablation', label: 'вычитание и износ',
    hint: 'Из урона вычитается броня, остаток идёт в хиты, а броня теряет единицу.',
  },
]);

export const CRIT_EDIT = 'crit_explode';
export const CRIT_RULE = 'crit_explode_rule';
export const ARMOR_STEP = NAMES.throughArmor;

const owned = (step: Step): boolean => {
  const { by, field } = step as { by?: unknown; field?: unknown };
  return (by !== undefined && by !== null) || (field !== undefined && field !== null);
};

const timesOf = (step: Step): { expr?: unknown } | undefined => (step as { times?: { expr?: unknown } }).times ?? undefined;

const repeated = (step: Step): boolean => typeof timesOf(step)?.expr === 'string' && (step as { die?: unknown }).die !== undefined;

const critOfCall = (system: System | undefined, step: Step): string | null => {
  const called = (step as { effect?: unknown }).effect;
  if (step.type !== 'emit' || !step.id || typeof called !== 'string') return null;
  const returns = system?.effects?.[called]?.returns ?? [];
  if (returns.some(column => column.key === tr`крит`)) return tr`if(@${String(step.id)}.крит, 2, 1)`;
  for (const column of returns) {
    if (column.kind !== 'choice' || !column.from || column.many) continue;
    const factor = (system?.tables?.[column.from]?.columns ?? []).find(one => (one.kind ?? 'number') === 'number');
    if (factor) return `@${String(step.id)}.${column.key}.${factor.key}`;
  }
  return null;
};

const amountsAfterCheck = (steps: Step[], system?: System): { check: Step; amount: Step; crit: string }[] => {
  const out: { check: Step; amount: Step; crit: string }[] = [];
  let check: Step | null = null;
  let crit = '';
  for (const step of steps) {
    const called = critOfCall(system, step);
    if (called) {
      check = step;
      crit = called;
      continue;
    }
    if (step.type !== 'roll') continue;
    const s = step as Record<string, unknown>;
    if (check && repeated(step)) { out.push({ check, amount: step, crit }); continue; }
    if (owned(step)) {
      check = step.id ? step : null;
      crit = check ? `if(@${String(step.id)}.atMax >= 1, 2, 1)` : '';
      continue;
    }
    if (!check) continue;
    if (s.die !== undefined) out.push({ check, amount: step, crit });
  }
  return out;
};

const DOUBLER = /^if\(.*,\s*2\s*,\s*1\s*\)$/;

const OUTCOME_COLUMN = /^@([\p{L}\p{N}_]+)\.([\p{L}\p{N}_]+)\.[\p{L}\p{N}_]+$/u;

type Doubler = (part: string) => boolean;

const doublerIn = (system: System, steps: readonly Step[]): Doubler => part => {
  if (DOUBLER.test(part)) return true;
  const found = OUTCOME_COLUMN.exec(part);
  const step = found ? steps.find(one => one.type === 'emit' && one.id === found[1]) : undefined;
  const called = step ? system.effects?.[String((step as { effect?: unknown }).effect)] : undefined;
  return Boolean(called?.returns?.some(column => column.key === found![2] && column.kind === 'choice' && column.from));
};

export function critOf(system: System): CritChoice {
  if ((system.grants ?? []).includes(CRIT_RULE) && system.effects[CRIT_RULE]) return 'explode';
  const doubled = Object.values(system.effects).some(effect =>
    (effect.steps ?? []).some(step => isDoubling(step as Record<string, unknown>, doublerIn(system, effect.steps ?? []))));
  return doubled ? 'double' : 'off';
}

const isDoubling = (step: Record<string, unknown>, doubler: Doubler): boolean => {
  if (step.type !== 'roll') return false;
  const times = timesOf(step as Step)?.expr;
  if (repeated(step as Step) && typeof times === 'string') return factorsOf(bare(times)).some(part => doubler(bare(part)));
  if (owned(step as Step)) return false;
  const count = step.count as { expr?: unknown } | undefined;
  return typeof count?.expr === 'string' && DOUBLER.test(count.expr);
};

const withoutDoubler = (step: Record<string, unknown>, doubler: Doubler): void => {
  const repeat = timesOf(step as Step)?.expr;
  if (repeated(step as Step) && typeof repeat === 'string') {
    const left = factorsOf(bare(repeat)).filter(part => !doubler(bare(part)));
    if (left.length) step.times = { expr: left.length === 1 ? bare(left[0]!) : left.map(tight).join(' * ') };
    else delete step.times;
  }
};

const withDoubler = (step: Record<string, unknown>, crit: string): void => {
  const repeat = timesOf(step as Step)?.expr;
  step.times = { expr: typeof repeat === 'string' ? `${tight(repeat)} * ${crit}` : crit };
};

export function setCrit(draft: System, choice: CritChoice): void {
  inSystemTongue(draft, () => setCritIn(draft, choice));
}

function setCritIn(draft: System, choice: CritChoice): void {
  const kept = new Set<Step>();
  for (const effect of Object.values(draft.effects)) {
    const doubler = doublerIn(draft, effect.steps ?? []);
    for (const step of effect.steps ?? []) {
      const loose = step as Record<string, unknown>;
      if (!isDoubling(loose, doubler)) continue;
      if (choice === 'double') { kept.add(step); continue; }
      const count = (loose.count as { expr?: unknown } | undefined)?.expr;
      if (typeof count === 'string' && DOUBLER.test(count)) delete loose.count;
      withoutDoubler(loose, doubler);
    }
  }
  delete draft.effects[CRIT_RULE];
  draft.grants = (draft.grants ?? []).filter(id => id !== CRIT_RULE);
  if (draft.roll_edits?.[CRIT_EDIT]) delete draft.roll_edits[CRIT_EDIT];

  if (choice === 'double') {
    for (const effect of Object.values(draft.effects)) {
      for (const { amount, crit } of amountsAfterCheck(effect.steps ?? [], draft)) {
        if (!kept.has(amount)) withDoubler(amount as Record<string, unknown>, crit);
      }
    }
  }
  if (choice === 'explode') {
    (draft.roll_edits ??= {})[CRIT_EDIT] = { label: tr`Взрывная кость`, ops: [{ op: 'explode' }] };
    draft.effects[CRIT_RULE] = {
      label: tr`Взрывная кость`, activation: 'passive', duration: { kind: 'permanent' },
      description: tr`Кость проверки на максимуме кидается ещё раз, результат прибавляется.`,
      modifiers: [{ kind: 'edit', call: ROLL_CALL, param: 'edits', edit: CRIT_EDIT, if: { expr: holderConditionOf(draft, ROLL_CALL)! } }],
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
    { type: 'branch', if: { expr: `not @${ARMOR_STEP}.success` } } as Step,
    { type: 'stop', note: { expr: tr`"броня выдержала"` } } as Step,
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

export const sheetInputOf = (effect: System['effects'][string] | undefined): string | null => {
  const roles = rolesOf({ params: (effect?.params ?? []).filter(param => !param.many) });
  return roles.targets ?? roles.actor ?? null;
};

export function setArmor(draft: System, choice: ArmorChoice, at: { event: string; armor: string; hp: string }): void {
  inSystemTongue(draft, () => setArmorIn(draft, choice, at));
}

function setArmorIn(draft: System, choice: ArmorChoice, at: { event: string; armor: string; hp: string }): void {
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
