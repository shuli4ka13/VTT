import { effectLabelOf } from './actions.ts';
import { isShared, isDesk } from './desk.ts';
import { MOMENT_PREFIX } from './bus.ts';
import { fieldOf as columnField, valueWord } from '../model/sheet-columns.ts';
import type { Report } from '../core/log.ts';
import type { Clock } from '../engine/clock.ts';
import type { System, Sheet, WornEffect } from '../model/types.ts';
import { FIELD_PREFIX } from './bus.ts';


export const MOMENTS = {
  'turn-start': 'в начале своего хода',
  'turn-end': 'в конце своего хода',
  'round-start': 'в начале раунда',
  'combat-start': 'когда начался бой',
  'combat-end': 'когда бой кончился',
  'combat-leave': 'когда вышел из боя',
  'scene-end': 'когда закрыли сцену',
  'short-rest': 'на коротком отдыхе',
  'long-rest': 'на долгом отдыхе',
  time: 'когда прошло время',
} as const;

export type MomentKey = keyof typeof MOMENTS;

const TABLE_MOMENTS: ReadonlySet<MomentKey> = new Set<MomentKey>(['combat-start', 'round-start', 'combat-end', 'scene-end', 'short-rest', 'long-rest', 'time']);

export const heardMoments = (system: System): Set<MomentKey> =>
  new Set(Object.values(system.effects ?? {}).flatMap(effect => (effect.on ?? []).map(handler => momentOf(handler.on)))
    .filter((key): key is MomentKey => key !== null));

export const isMoment = (on: string | undefined): boolean =>
  Boolean(on && on.startsWith(MOMENT_PREFIX));

export const momentOf = (on: string | undefined): MomentKey | null => {
  if (!isMoment(on)) return null;
  const key = on!.slice(MOMENT_PREFIX.length) as MomentKey;
  return key in MOMENTS ? key : null;
};

export interface MomentEvent {
  moment: MomentKey;
  sheetId: string;
}

export type TurnOp = 'start' | 'next' | 'stop' | 'scene' | 'short-rest' | 'long-rest' | 'time' | 'join' | 'leave';

export function momentsOfTurn(op: TurnOp, before: Clock, after: Clock, sheets: Sheet[]): MomentEvent[] {
  const desk = sheets.find(isDesk);
  const everyone = (moment: MomentKey): MomentEvent[] => [
    ...sheets.filter(sheet => !isShared(sheet, sheets)).map(sheet => ({ moment, sheetId: sheet.id })),
    ...(desk && TABLE_MOMENTS.has(moment) ? [{ moment, sheetId: desk.id }] : []),
  ];
  if (op === 'start') {
    return [
      ...everyone('combat-start'),
      ...everyone('round-start'),
      ...(after.active ? [{ moment: 'turn-start' as const, sheetId: String(after.active) }] : []),
    ];
  }
  if (op === 'next') {
    const ended = before.active ? [{ moment: 'turn-end' as const, sheetId: String(before.active) }] : [];
    const round = after.round !== before.round ? everyone('round-start') : [];
    const started = after.active ? [{ moment: 'turn-start' as const, sheetId: String(after.active) }] : [];
    return [...ended, ...round, ...started];
  }
  if (op === 'stop') return everyone('combat-end');
  if (op === 'short-rest') return everyone('short-rest');
  if (op === 'long-rest') return [...everyone('short-rest'), ...everyone('long-rest')];
  if (op === 'time') return everyone('time');
  if (op === 'join' || op === 'leave') return [];
  return everyone('scene-end');
}


export const wornSeed = (entry: WornEffect | undefined): Record<string, unknown> => ({ ...(entry ?? {}) });

export const wornEntry = (sheet: Sheet, effectId: string): Record<string, unknown> =>
  wornSeed((sheet.effects ?? []).find(entry => entry.effectId === effectId));

export const fieldOf = (on: string | undefined): string | null =>
  (on && on.startsWith(FIELD_PREFIX) ? on.slice(FIELD_PREFIX.length) : null);

export const describeMoment = (
  world: { system: System }, entry: { sheetId: string; report: Report }, sheets: Sheet[],
): string => {
  const who = sheets.find(s => s.id === entry.sheetId)?.name ?? entry.sheetId;
  const what = entry.report.label || effectLabelOf(world.system, entry.report.effect);
  const changes = (entry.report.changes as { tag: string; from: unknown; to: unknown }[])
    .map(change => {
      const field = columnField(world.system, change.tag);
      return `${field?.label ?? change.tag}: ${valueWord(change.from)} → ${valueWord(change.to)}`;
    });
  return changes.length ? `${who}: «${what}» — ${changes.join(', ')}` : `${who}: «${what}»`;
};
