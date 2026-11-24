import { NAMES } from '../words/names.ts';
import { endOf, isFlow } from './flow.ts';
import { ROLL_CALL } from '../words/calls.ts';
import { holderConditionOf } from './references.ts';
import { rolesOf } from './buttons.ts';
import { tagWords } from '../engine/roll-tags.ts';
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
    hint: 'Правило «Крит» среди выданного всем: бросок с меткой «крит» кидает вдвое больше костей, прибавки — один раз. Метку ставит бросок «числа» после проверки. Так в D&D.',
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
export const CRIT_DOUBLE = 'crit_double_rule';
export const CRIT_TAG = 'krit';
export const ARMOR_STEP = NAMES.throughArmor;

const owned = (step: Step): boolean => {
  const { by, field } = step as { by?: unknown; field?: unknown };
  return (by !== undefined && by !== null) || (field !== undefined && field !== null);
};

const repeated = (step: Step): boolean => typeof (step as { times?: { expr?: unknown } }).times?.expr === 'string' && (step as { die?: unknown }).die !== undefined;

const critOfCall = (system: System | undefined, step: Step): string | null => {
  const called = (step as { effect?: unknown }).effect;
  if (step.type !== 'emit' || !step.id || typeof called !== 'string') return null;
  const returns = system?.effects?.[called]?.returns ?? [];
  return returns.some(column => column.key === CRIT_TAG) ? `@${String(step.id)}.${CRIT_TAG}` : null;
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
      crit = check ? `@${String(step.id)}.atMax >= 1` : '';
      continue;
    }
    if (!check) continue;
    if (s.die !== undefined) out.push({ check, amount: step, crit });
  }
  return out;
};

const critMark = (crit: string): { expr: string } => ({ expr: `if(${crit}, "${CRIT_TAG}", "")` });

const MARK_HEAD = 'if(';
const MARK_TAIL = `, "${CRIT_TAG}", "")`;

const balanced = (text: string): boolean => {
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};

const isCritMark = (tag: unknown): boolean => {
  const expr = typeof tag === 'object' && tag !== null ? (tag as { expr?: unknown }).expr : undefined;
  if (typeof expr !== 'string' || !expr.startsWith(MARK_HEAD) || !expr.endsWith(MARK_TAIL)) return false;
  const condition = expr.slice(MARK_HEAD.length, expr.length - MARK_TAIL.length);
  return condition.trim() !== '' && balanced(condition);
};

const unmark = (step: Step): void => {
  const loose = step as Record<string, unknown>;
  if (step.type !== 'roll' || !Array.isArray(loose.tags) || !loose.tags.some(isCritMark)) return;
  const left = loose.tags.filter(tag => !isCritMark(tag));
  if (left.length) loose.tags = left; else delete loose.tags;
};

const granted = (system: System, rule: string): boolean => (system.grants ?? []).includes(rule) && Boolean(system.effects[rule]);

export function critOf(system: System): CritChoice {
  if (granted(system, CRIT_RULE)) return 'explode';
  return granted(system, CRIT_DOUBLE) ? 'double' : 'off';
}

export function setCrit(draft: System, choice: CritChoice): void {
  inSystemTongue(draft, () => setCritIn(draft, choice));
}

function setCritIn(draft: System, choice: CritChoice): void {
  for (const rule of [CRIT_RULE, CRIT_DOUBLE]) delete draft.effects[rule];
  draft.grants = (draft.grants ?? []).filter(id => id !== CRIT_RULE && id !== CRIT_DOUBLE);
  if (draft.roll_edits?.[CRIT_EDIT]) delete draft.roll_edits[CRIT_EDIT];
  if (draft.tags?.[CRIT_TAG] && Object.keys(draft.tags[CRIT_TAG]!).every(key => key === 'label')) delete draft.tags[CRIT_TAG];
  if (draft.tags && !Object.keys(draft.tags).length) delete draft.tags;
  for (const effect of Object.values(draft.effects)) (effect.steps ?? []).forEach(unmark);
  const holder = holderConditionOf(draft, ROLL_CALL)!;

  if (choice === 'double') {
    for (const effect of Object.values(draft.effects)) {
      for (const { amount, crit } of amountsAfterCheck(effect.steps ?? [], draft)) {
        const loose = amount as Record<string, unknown>;
        const tags = Array.isArray(loose.tags) ? loose.tags as unknown[] : [];
        if (!tags.some(isCritMark)) loose.tags = [...tags, critMark(crit)];
      }
    }
    if (!draft.tags?.[CRIT_TAG] && !tagWords(draft).has(CRIT_TAG)) (draft.tags ??= {})[CRIT_TAG] = { label: tr`крит` };
    draft.effects[CRIT_DOUBLE] = {
      label: tr`Крит`, activation: 'passive', duration: { kind: 'permanent' },
      description: tr`Критическое попадание: кости урона бросаются вдвое, прибавки — один раз.`,
      modifiers: [{ kind: 'edit', call: ROLL_CALL, param: 'count', op: 'mul', value: { expr: '2' }, tags: [CRIT_TAG], if: { expr: holder } }],
    };
    draft.grants = [...(draft.grants ?? []), CRIT_DOUBLE];
  }
  if (choice === 'explode') {
    (draft.roll_edits ??= {})[CRIT_EDIT] = { label: tr`Взрывная кость`, ops: [{ op: 'explode' }] };
    draft.effects[CRIT_RULE] = {
      label: tr`Взрывная кость`, activation: 'passive', duration: { kind: 'permanent' },
      description: tr`Кость проверки на максимуме кидается ещё раз, результат прибавляется.`,
      modifiers: [{ kind: 'edit', call: ROLL_CALL, param: 'edits', edit: CRIT_EDIT, if: { expr: holder } }],
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
