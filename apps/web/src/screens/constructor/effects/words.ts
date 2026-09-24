import { LAUNCHES } from '@vtt/engine/model/effect-kinds';
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import { COST_BLOCK } from '@vtt/engine/words/glossary';
import type { Step, System } from '@vtt/schema';

export const LAUNCH_KINDS = (['manual', 'auto', 'passive'] as const)
  .map(key => ({ key: key as LaunchKind, label: LAUNCHES[key].label, title: LAUNCHES[key].hint }));

export const launchHint = (kind: LaunchKind): string => LAUNCHES[kind].hint;

export type Moment = 'after-in' | 'after-out' | 'before-in' | 'ask-target' | 'ask-sender' | 'ask-after';

export const MOMENTS: readonly (readonly [Moment, string])[] = [
  ['after-in', 'со мной что-то сделали — отвечаю сам, молча'],
  ['after-out', 'я что-то сделал — срабатывает сам, молча'],
  ['before-in', 'на меня действуют — срабатывает само до того, как это разрешится, молча'],
  ['ask-target', 'на меня действуют — стол спрашивает меня до того, как это разрешится'],
  ['ask-sender', 'я бросил — стол спрашивает меня до того, как результат уйдёт цели'],
  ['ask-after', 'на меня подействовали — стол спрашивает меня после того, как это разрешилось'],
];

export type EditFn = (slotIndexInGroup: number, change: (draft: Step) => void) => void;
export type WithNumber = (change: (amount: Step, apply: Step, id: string) => void) => void;

export const CARD_TITLES: Record<string, string> = { check: 'Проверка', change: 'Изменение', number: 'Число' };

export function titleOf(kind: string, step: Step | undefined, system: System): string {
  const s = step as { type?: string; event?: string } | undefined;
  if (s?.type === 'emit' && s.event && system.effects?.[s.event]?.group === COST_BLOCK) return COST_BLOCK;
  return CARD_TITLES[kind] ?? kind;
}
