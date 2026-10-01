import { LAUNCHES } from '@vtt/engine/model/effect-kinds';
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import { COST_BLOCK } from '@vtt/engine/words/glossary';
import { ACTION_MOMENTS } from '@vtt/engine/events/bus';
import type { Step, System } from '@vtt/schema';

export const LAUNCH_KINDS = (['manual', 'passive'] as const)
  .map(key => ({ key: key as LaunchKind, label: key === 'passive' ? 'Висит' : LAUNCHES[key].label, title: LAUNCHES[key].hint }));

export const CREATE_KINDS = (['manual', 'auto', 'passive'] as const)
  .map(key => ({ key: key as LaunchKind, label: LAUNCHES[key].label, title: LAUNCHES[key].hint }));

export const launchHint = (kind: LaunchKind): string => LAUNCHES[kind].hint;

export type Moment = 'after-in' | 'after-out' | 'done' | 'before-in' | 'ask-target' | 'ask-sender' | 'ask-after';

export const MOMENTS: readonly (readonly [Moment, string])[] = [
  ['after-in', `${ACTION_MOMENTS.affected.label} — молча`],
  ['after-out', `${ACTION_MOMENTS.acted.label} — молча`],
  ['done', `${ACTION_MOMENTS.done.label} — молча, один раз на все цели`],
  ['before-in', `${ACTION_MOMENTS.targeted.label} — молча`],
  ['ask-target', `${ACTION_MOMENTS.targeted.label} — спросить меня`],
  ['ask-sender', `${ACTION_MOMENTS.acting.label} — спросить меня`],
  ['ask-after', `${ACTION_MOMENTS.affected.label} — спросить меня`],
];

export type EditFn = (slotIndexInGroup: number, change: (draft: Step) => void) => void;
export type WithNumber = (change: (amount: Step, apply: Step, id: string) => void) => void;

export const CARD_TITLES: Record<string, string> = { check: 'Проверка', change: 'Изменение', number: 'Число' };

export function titleOf(kind: string, step: Step | undefined, system: System): string {
  const s = step as { type?: string; event?: string } | undefined;
  if (s?.type === 'emit' && s.event && system.effects?.[s.event]?.group === COST_BLOCK) return COST_BLOCK;
  return CARD_TITLES[kind] ?? kind;
}
