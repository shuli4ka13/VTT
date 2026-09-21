import { ANY_ROLL } from '../engine/targets.ts';
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
    hint: 'Из урона вычитается броня, остаток идёт в хиты, а броня теряет единицу. Так в Cyberpunk RED.',
  },
];

export const CRIT_EDIT = 'crit_explode';
export const CRIT_RULE = 'crit_explode_rule';
export const ARMOR_STEP = 'сквозь_броню';

const amountsAfterCheck = (steps: Step[]): { check: Step; amount: Step }[] => {
  const out: { check: Step; amount: Step }[] = [];
  let check: Step | null = null;
  for (const step of steps) {
    const s = step as Record<string, unknown>;
    if (step.type === 'threshold') {
      check = (s.side ?? 'source') === 'source' && step.id ? step : null;
      continue;
    }
    if (step.type === 'amount' && check && s.dice !== undefined) out.push({ check, amount: step });
  }
  return out;
};

export function critOf(system: System): CritChoice {
  if ((system.room_rules ?? []).includes(CRIT_RULE) && system.effects[CRIT_RULE]) return 'explode';
  const doubled = Object.values(system.effects).some(effect =>
    (effect.steps ?? []).some(step => (step as Record<string, unknown>).double !== undefined));
  return doubled ? 'double' : 'off';
}

export function setCrit(draft: System, choice: CritChoice): void {
  for (const effect of Object.values(draft.effects)) {
    for (const step of effect.steps ?? []) delete (step as Record<string, unknown>).double;
  }
  delete draft.effects[CRIT_RULE];
  draft.room_rules = (draft.room_rules ?? []).filter(id => id !== CRIT_RULE);
  if (draft.roll_edits?.[CRIT_EDIT]) delete draft.roll_edits[CRIT_EDIT];

  if (choice === 'double') {
    for (const effect of Object.values(draft.effects)) {
      for (const { check, amount } of amountsAfterCheck(effect.steps ?? [])) {
        (amount as Record<string, unknown>).double = { ref: `${check.id}.atMax`, atLeast: 1 };
      }
    }
  }
  if (choice === 'explode') {
    (draft.roll_edits ??= {})[CRIT_EDIT] = { label: 'Взрывная кость', ops: [{ op: 'explode' }] };
    draft.effects[CRIT_RULE] = {
      label: 'Взрывная кость', activation: 'passive', duration: { kind: 'permanent' },
      description: 'Кость проверки на максимуме кидается ещё раз, результат прибавляется.',
      modifiers: [{ kind: 'roll', target: ANY_ROLL, edit: CRIT_EDIT, condition: null }],
    };
    draft.room_rules = [...(draft.room_rules ?? []), CRIT_RULE];
  }
}

export function armorTail(choice: ArmorChoice, armor: string, hp: string): Step[] {
  if (choice === 'none') {
    return [{ type: 'apply', target: { tag: hp }, direction: 'subtract', value: { ref: 'event.amount' }, targetModifiers: true } as Step];
  }
  if (choice === 'threshold') {
    return [
      { id: ARMOR_STEP, type: 'compare', value: { ref: 'event.amount' }, versus: { tag: armor }, breakIf: 'atMost' } as Step,
      { type: 'apply', target: { tag: hp }, direction: 'subtract', value: { ref: 'event.amount' }, targetModifiers: false } as Step,
    ];
  }
  return [
    { id: ARMOR_STEP, type: 'compare', value: { ref: 'event.amount' }, versus: { tag: armor }, breakIf: 'less' } as Step,
    { type: 'apply', target: { tag: hp }, direction: 'subtract', value: { ref: `${ARMOR_STEP}.margin` }, targetModifiers: false } as Step,
    { type: 'apply', target: { tag: armor }, direction: 'subtract', value: { const: 1 }, targetModifiers: false } as Step,
  ];
}

export interface ArmorReading { choice: ArmorChoice; armor: string | null; hp: string | null }

export function armorOf(system: System, event: string): ArmorReading {
  const steps = (system.effects?.[event]?.steps ?? []) as Record<string, unknown>[];
  const first = steps[0];
  const versus = first?.versus as { tag?: string } | undefined;
  if (!first || first.type !== 'compare' || !versus?.tag) return { choice: 'none', armor: null, hp: null };
  const armor = String(versus.tag);
  const applies = steps.filter(s => s.type === 'apply');
  const hp = applies.map(s => (s.target as { tag?: string } | undefined)?.tag).find(tag => tag && tag !== armor) ?? null;
  const wears = applies.some(s => (s.target as { tag?: string } | undefined)?.tag === armor);
  if (String(first.breakIf ?? 'less') === 'atMost' && !wears) return { choice: 'threshold', armor, hp };
  if (wears) return { choice: 'ablation', armor, hp };
  return { choice: 'none', armor, hp };
}

export function setArmor(draft: System, choice: ArmorChoice, at: { event: string; armor: string; hp: string }): void {
  const called = draft.effects?.[at.event];
  if (!called) return;
  called.steps = armorTail(choice, at.armor, at.hp);
}
