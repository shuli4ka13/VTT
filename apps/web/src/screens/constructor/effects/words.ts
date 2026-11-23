import { STEP_WORDS, LAUNCHES, stepSaid } from '@vtt/engine';
import type { LaunchKind } from '@vtt/engine';
import type { Step, System, Effect } from '@vtt/schema';
import { labelOfTag } from '../../../ui/formula.tsx';
import type { CardGroup } from '../cards.ts';
import { tagsSaid } from '../tag-said.ts';
import { t } from '../../../i18n/author.ts';

export const LAUNCH_KINDS = (['manual', 'passive'] as const)
  .map(key => ({
    key: key as LaunchKind,
    get label() { return key === 'passive' ? t('readback:launch.hanging') : LAUNCHES[key].label; },
    get title() { return LAUNCHES[key].hint; },
  }));

export const CREATE_KINDS: { key: LaunchKind; label: string; title: string }[] = [
  { key: 'manual', get label() { return LAUNCHES.manual.label; }, get title() { return LAUNCHES.manual.hint; } },
  { key: 'passive', get label() { return t('readback:launch.hanging'); }, get title() { return t('readback:launch.hangingHint'); } },
];

export const launchHint = (kind: LaunchKind): string => LAUNCHES[kind].hint;

export type EditFn = (slotIndexInGroup: number, change: (draft: Step) => void) => void;
export type WithNumber = (change: (amount: Step, apply: Step, id: string) => void) => void;

export const CARD_TITLES: Record<string, string> = {
  get check() { return t('readback:card.check'); },
  get change() { return t('readback:card.change'); },
  get roll() { return t('readback:card.roll'); },
  get number() { return t('readback:card.number'); },
  get table() { return t('readback:card.table'); },
  get ask() { return STEP_WORDS.ask.label; },
  get stop() { return t('readback:card.stop'); },
};

export const STEP_TITLES = {
  get call() { return t('readback:step.call'); },
  get callFrom() { return t('readback:step.callFrom'); },
  get put() { return t('readback:step.put'); },
  get take() { return t('readback:step.take'); },
  get set() { return t('readback:step.set'); },
  get roll() { return t('readback:step.roll'); },
  get number() { return t('readback:step.number'); },
};

const inputOf = (ref: unknown): string | undefined =>
  /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr?: unknown } | undefined)?.expr ?? ''))?.[1];

const fieldOfTarget = (ref: unknown): string | undefined => {
  const text = String((ref as { expr?: unknown } | undefined)?.expr ?? '').trim();
  const found = /^@[\p{L}\p{N}_]+\.([\p{L}\p{N}_.]+)$/u.exec(text);
  return found?.[1];
};

const named = (title: string, step: { id?: unknown; label?: unknown } | undefined): string => {
  const name = typeof step?.id === 'string' && step.id ? stepSaid(step) : '';
  return name && name.replace(/ \d+$/, '').toLowerCase() !== title.toLowerCase() ? `${title} «${name}»` : title;
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
    const what = id ? system.effects?.[id]?.label ?? system.tags?.[id]?.label ?? id : via ? via.label ?? via.key : '';
    return what ? `${verb} «${what}»` : verb;
  }
  if (s?.type === 'apply') {
    const tag = fieldOfTarget(s.target);
    return tag ? `${STEP_TITLES.set} «${labelOfTag(system, tag, names)}»` : STEP_TITLES.set;
  }
  if (kind === 'roll') return named(STEP_TITLES.roll, s);
  if (kind === 'number') return named(STEP_TITLES.number, s);
  if (kind === 'table') return named(CARD_TITLES[kind] ?? kind, s);
  if (kind === "seen" && typeof s?.type === "string" && s.type in STEP_WORDS) return STEP_WORDS[s.type as keyof typeof STEP_WORDS].label;
  return CARD_TITLES[kind] ?? kind;
}

export const cardTitle = (cards: CardGroup[], index: number, system: System, effect?: Effect): string | undefined => {
  const card = cards.find(c => c.indices.includes(index));
  if (!card) return undefined;
  const own = card.indices.length > 1 && card.amount && card.indices[0] === index ? card.amount : card.step;
  if (own.type === 'roll' && (own as { by?: unknown }).by !== undefined) {
    const tags = (((own as { tags?: unknown[] }).tags) ?? []).filter((tag): tag is string => typeof tag === 'string');
    return tags.length ? t('readback:card.rollTagged', { tags: tagsSaid(system, tags) }) : t('readback:step.roll');
  }
  return titleOf(card.kind, card.step, system, effect);
};
