import { STEP_WORDS } from '@vtt/engine/words/steps';
import { LAUNCHES } from '@vtt/engine/model/effect-kinds';
import type { LaunchKind } from '@vtt/engine/model/effect-kinds';
import type { Step, System, Effect } from '@vtt/schema';
import { labelOfTag } from '../../../ui/formula.tsx';
import type { CardGroup } from '../cards.ts';

export const LAUNCH_KINDS = (['manual', 'passive'] as const)
  .map(key => ({ key: key as LaunchKind, label: key === 'passive' ? 'Висит' : LAUNCHES[key].label, title: LAUNCHES[key].hint }));

export const CREATE_KINDS = (['manual', 'auto', 'passive'] as const)
  .map(key => ({ key: key as LaunchKind, label: LAUNCHES[key].label, title: LAUNCHES[key].hint }));

export const launchHint = (kind: LaunchKind): string => LAUNCHES[kind].hint;

export type EditFn = (slotIndexInGroup: number, change: (draft: Step) => void) => void;
export type WithNumber = (change: (amount: Step, apply: Step, id: string) => void) => void;

export const CARD_TITLES: Record<string, string> = { check: 'Проверка', change: 'Изменение', number: 'Число', table: 'Взять из таблицы', stop: 'Стоп' };

export const STEP_TITLES = { call: 'Вызов', callFrom: 'Вызвать переданное в', put: 'Наложить', take: 'Снять', set: 'Изменить', roll: 'Бросок', number: 'Число' };

const inputOf = (ref: unknown): string | undefined =>
  /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr?: unknown } | undefined)?.expr ?? ''))?.[1];

const fieldOfTarget = (ref: unknown): string | undefined => {
  const text = String((ref as { expr?: unknown } | undefined)?.expr ?? '').trim();
  const found = /^@[\p{L}\p{N}_]+\.([\p{L}\p{N}_.]+)$/u.exec(text);
  return found?.[1];
};

const named = (title: string, id: unknown): string => {
  const name = typeof id === 'string' ? id.replace(/_/g, ' ') : '';
  return name && name.replace(/ \d+$/, '') !== title.toLowerCase() ? `${title} «${name}»` : title;
};

export function titleOf(kind: string, step: Step | undefined, system: System, effect?: Effect, names?: ReadonlyMap<string, string>): string {
  const s = step as Record<string, unknown> | undefined;
  const param = (ref: unknown) => { const key = inputOf(ref); return key ? effect?.params?.find(p => p.key === key) : undefined; };
  if (s?.type === 'emit') {
    if (typeof s.effect === 'string') return system.effects?.[s.effect]?.label || (s.effect ? s.effect : STEP_TITLES.call);
    const via = param(s.effect);
    return via ? `${STEP_TITLES.callFrom} «${via.label ?? via.key}»` : STEP_TITLES.call;
  }
  if (s?.type === 'status') {
    const verb = s.mode === 'remove' ? STEP_TITLES.take : STEP_TITLES.put;
    const id = typeof s.effect === 'string' ? s.effect : undefined;
    const via = id ? undefined : param(s.effect);
    const what = id ? system.effects?.[id]?.label ?? id : via ? via.label ?? via.key : '';
    return what ? `${verb} «${what}»` : verb;
  }
  if (s?.type === 'apply') {
    const tag = fieldOfTarget(s.target);
    return tag ? `${STEP_TITLES.set} «${labelOfTag(system, tag, names)}»` : STEP_TITLES.set;
  }
  if (kind === 'number') return named(s?.by || s?.field ? STEP_TITLES.roll : STEP_TITLES.number, s?.id);
  if (kind === 'table') return named(CARD_TITLES[kind] ?? kind, s?.id);
  if (kind === "seen" && typeof s?.type === "string" && s.type in STEP_WORDS) return STEP_WORDS[s.type as keyof typeof STEP_WORDS].label;
  return CARD_TITLES[kind] ?? kind;
}

export const cardTitle = (cards: CardGroup[], index: number, system: System, effect?: Effect): string | undefined => {
  const card = cards.find(c => c.indices.includes(index));
  if (!card) return undefined;
  const own = card.indices.length > 1 && card.amount && card.indices[0] === index ? card.amount : card.step;
  if (own.type === 'roll' && (own as { by?: unknown }).by !== undefined) {
    const tags = (((own as { tags?: unknown[] }).tags) ?? []).filter((tag): tag is string => typeof tag === 'string');
    return tags.length ? `Бросок «${tags.join(', ')}»` : 'Бросок';
  }
  return titleOf(card.kind, card.step, system, effect);
};
