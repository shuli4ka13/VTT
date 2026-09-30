import { newPass, calc } from '../engine/calc.ts';
import { packCall, runCall } from './call.ts';
import { holdsNow } from '../engine/refs.ts';
import { lapse, burnsUse, spendUse } from './durations.ts';
import type { Expired } from './durations.ts';
import type { Clock } from '../engine/clock.ts';
import { listening, subscribers, withSteps, MOMENT_PREFIX, FIELD_PREFIX } from './bus.ts';
import { EngineError } from '../engine/errors.ts';
import { effectLabelOf } from './envelope.ts';
import { sharedOf, isShared } from './desk.ts';
import type { Report, WorldContext } from './envelope.ts';
import type { Sheet, System, Effect, Handler, Step, WornEffect } from '../model/types.ts';
import { fieldOf as columnField } from '../model/sheet-columns.ts';


export const MOMENTS = {
  'turn-start': 'в начале своего хода',
  'turn-end': 'в конце своего хода',
  'round-start': 'в начале раунда',
  'combat-start': 'когда начался бой',
  'combat-end': 'когда бой кончился',
  'scene-end': 'когда закрыли сцену',
  'short-rest': 'на коротком отдыхе',
  'long-rest': 'на долгом отдыхе',
} as const;

export type MomentKey = keyof typeof MOMENTS;

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

export interface MomentRun {
  sheets: Sheet[];
  reports: Fired[];

  expired?: Expired[];
}

export type TurnOp = 'start' | 'next' | 'stop' | 'scene' | 'short-rest' | 'long-rest';

export function momentsOfTurn(op: TurnOp, before: Clock, after: Clock, sheets: Sheet[]): MomentEvent[] {
  const everyone = (moment: MomentKey): MomentEvent[] =>
    sheets.filter(sheet => !isShared(sheet, sheets)).map(sheet => ({ moment, sheetId: sheet.id }));
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
  return everyone('scene-end');
}

const MAX_FIRES = 32;

export interface Firing {
  sheetId: string;
  id: string;
  effect: Effect;
  steps: Step[] | undefined;
  owner: string;
  label: string;
  seed: Record<string, unknown>;
  handler?: Handler;
}

export type Fired = { sheetId: string; report: Report };

export function fire(firing: Firing, sheets: Sheet[], world: WorldContext): { sheets: Sheet[]; fired: Fired } | null {
  const live = sheets.find(s => s.id === firing.sheetId);
  if (!live) return null;
  const { id, effect, owner, seed, handler } = firing;
  if (handler && !holds(handler, live, seed, owner, world)) return null;

  const here = { ...world, shared: sharedOf(world.system, sheets) };
  const call = { effectId: id, effect: withSteps(effect, firing.steps), sheet: live, owner, args: {}, props: null, seed };
  const done = runCall(packCall(call, here), { sheet: live, owner, seed }, here);
  let next = done.sheet;
  if (handler && burnsUse(effect)) next = spendUse(next, id);
  return {
    sheets: sheets.map(s => (s.id === next.id ? next : done.shared?.find(u => u.id === s.id) ?? s)),
    fired: {
      sheetId: firing.sheetId,
      report: {
        kind: 'moment', effect: id, from: firing.sheetId, label: firing.label,
        reply: false, trace: done.trace, stopped: done.stopped,
        changes: done.changes, effects: done.effects, removed: done.removed, spent: [],
        emitted: done.emitted,
      },
    },
  };
}

export function fireMoments(events: MomentEvent[], sheets: Sheet[], world: WorldContext): MomentRun {
  let updated = sheets;
  const reports: Fired[] = [];
  const expired: Expired[] = [];
  let fired = 0;

  for (const event of events) {
    const lapsed = lapse(event, updated, world.system, world.clock);
    updated = lapsed.sheets;
    expired.push(...lapsed.expired);

    const sheet = updated.find(s => s.id === event.sheetId);
    if (!sheet) continue;

    for (const { id, effect, handler } of listening(world.system, sheet, { kind: 'moment', moment: event.moment }, { compendium: world.compendium })) {
      if (fired++ >= MAX_FIRES) {
        throw new EngineError(`моменты срабатывают без остановки: больше ${MAX_FIRES} за один ход`);
      }
      const live = updated.find(s => s.id === event.sheetId)!;
      const done = fire({
        sheetId: event.sheetId, id, effect, handler, steps: handler.steps,
        owner: `момент «${MOMENTS[event.moment]}» у «${effect.label ?? id}»`,
        label: effect.label ?? id,
        seed: { moment: { moment: event.moment, sheet: event.sheetId }, worn: wornEntry(live, id) },
      }, updated, world);
      if (!done) continue;
      updated = done.sheets;
      reports.push(done.fired);
    }
  }

  return { sheets: updated, reports, expired };
}

export const wornSeed = (entry: WornEffect | undefined): Record<string, unknown> => ({ carry: null, ...(entry ?? {}) });

export const wornEntry = (sheet: Sheet, effectId: string): Record<string, unknown> =>
  wornSeed((sheet.effects ?? []).find(entry => entry.effectId === effectId));

export const fieldOf = (on: string | undefined): string | null =>
  (on && on.startsWith(FIELD_PREFIX) ? on.slice(FIELD_PREFIX.length) : null);

const truthy = (value: unknown): boolean =>
  value === true || (typeof value === 'number' && value !== 0) || (typeof value === 'string' && value !== '');

const valuesOf = (sheet: Sheet, world: WorldContext): (tag: string) => unknown => {
  let pass: ReturnType<typeof newPass> | null = null;
  return tag => calc(world.system, sheet, tag, pass ??= newPass(world.system, sheet, { compendium: world.compendium }));
};

export function fireCrossings(before: Sheet[], after: Sheet[], world: WorldContext): MomentRun {
  let updated = after;
  let previous = before;
  const reports: Fired[] = [];
  let fired = 0;

  for (;;) {
    const wave: { sheetId: string; id: string; effect: Effect; handler: Handler; tag: string; value: unknown }[] = [];
    for (const sheet of updated) {
      const was = previous.find(s => s.id === sheet.id);
      if (!was || was === sheet) continue;
      const now = valuesOf(sheet, world);
      const then = valuesOf(was, world);
      for (const { id, effect, handler } of subscribers(world.system, sheet, { compendium: world.compendium })) {
        const tag = fieldOf(handler.on);
        if (!tag) continue;
        const value = now(tag);
        if (!truthy(value) || truthy(then(tag))) continue;
        wave.push({ sheetId: sheet.id, id, effect, handler, tag, value });
      }
    }
    if (!wave.length) break;
    previous = updated;

    for (const { sheetId, id, effect, handler, tag, value } of wave) {
      if (fired++ >= MAX_FIRES) {
        throw new EngineError(`поля будят эффекты без остановки: больше ${MAX_FIRES} срабатываний за раз`);
      }
      const live = updated.find(s => s.id === sheetId)!;
      const label = columnField(world.system, tag)?.label ?? tag;
      const done = fire({
        sheetId, id, effect, handler, steps: handler.steps,
        owner: `поле «${label}» стало верным у «${effect.label ?? id}»`,
        label: effect.label ?? id,
        seed: { field: { tag, value }, worn: wornEntry(live, id) },
      }, updated, world);
      if (!done) continue;
      updated = done.sheets;
      reports.push(done.fired);
    }
  }

  return { sheets: updated, reports };
}

function holds(
  handler: Handler, sheet: Sheet, seed: Record<string, unknown>, owner: string, world: WorldContext,
): boolean {
  const condition = handler.if;
  if (!condition) return true;
  const pass = newPass(world.system, sheet, { compendium: world.compendium });
  return holdsNow(condition, { pass, owner, results: seed });
}

export const describeMoment = (
  world: WorldContext, entry: { sheetId: string; report: Report }, sheets: Sheet[],
): string => {
  const who = sheets.find(s => s.id === entry.sheetId)?.name ?? entry.sheetId;
  const what = entry.report.label || effectLabelOf(world.system, entry.report.effect);
  const changes = (entry.report.changes as { tag: string; from: unknown; to: unknown }[])
    .map(change => {
      const field = columnField(world.system, change.tag);
      return `${field?.label ?? change.tag}: ${change.from} → ${change.to}`;
    });
  return changes.length ? `${who}: «${what}» — ${changes.join(', ')}` : `${who}: «${what}»`;
};
