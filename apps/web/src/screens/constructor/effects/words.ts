import { LAUNCHES } from '@vtt/engine/model/effect-kinds';
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import type { Step } from '@vtt/schema';

export const LAUNCH_KINDS = (['manual', 'auto', 'passive'] as const)
  .map(key => ({ key: key as LaunchKind, label: LAUNCHES[key].label, title: LAUNCHES[key].hint }));

export const launchHint = (kind: LaunchKind): string => LAUNCHES[kind].hint;

export type Moment = 'after-in' | 'after-out' | 'ask-target' | 'ask-sender';

export const MOMENTS: readonly (readonly [Moment, string])[] = [
  ['after-in', 'со мной что-то сделали — отвечаю сам, молча'],
  ['after-out', 'я что-то сделал — срабатывает сам, молча'],
  ['ask-target', 'на меня действуют — стол спрашивает меня до того, как это разрешится'],
  ['ask-sender', 'я бросил — стол спрашивает меня до того, как результат уйдёт цели'],
];

export type EditFn = (slotIndexInGroup: number, change: (draft: Step) => void) => void;
export type WithNumber = (change: (amount: Step, apply: Step, id: string) => void) => void;

export const CARD_TITLES: Record<string, string> = { check: 'Проверка', change: 'Изменение', number: 'Число' };
