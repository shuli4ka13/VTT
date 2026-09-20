import { newPass, calc } from '../engine/calc.ts';
import { packCall, runCall } from './call.ts';
import { resolveRef } from '../engine/refs.ts';
import { activationOf, durationOf, wornEffects, findEffect } from '../engine/effects.ts';
import { EngineError } from '../engine/errors.ts';
import { spendUse, effectLabelOf } from './envelope.ts';
import type { Report, WorldContext } from './envelope.ts';
import type { Sheet, Effect } from '../model/types.ts';

export const MOMENT_PREFIX = 'moment:';

export const MOMENTS = {
  'turn-start': 'в начале своего хода',
  'turn-end': 'в конце своего хода',
  'round-start': 'в начале раунда',
  'combat-start': 'когда начался бой',
  'combat-end': 'когда бой кончился',
  'scene-end': 'когда закрыли сцену',
  'equipped': 'когда вещь надели',
  'attached': 'когда эффект повесили',
  'expired': 'когда эффект спал',
} as const;

export type MomentKey = keyof typeof MOMENTS;

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
  about?: string;
}

export interface MomentRun {
  sheets: Sheet[];
  reports: { sheetId: string; report: Report }[];
}

const MAX_FIRES = 32;

export function fireMoments(events: MomentEvent[], sheets: Sheet[], world: WorldContext): MomentRun {
  let updated = sheets;
  const reports: { sheetId: string; report: Report }[] = [];
  let fired = 0;

  for (const event of events) {
    const sheet = updated.find(s => s.id === event.sheetId);
    if (!sheet) continue;

    for (const { id, effect } of listeners(sheet, event, world)) {
      if (fired++ >= MAX_FIRES) {
        throw new EngineError(`моменты срабатывают без остановки: больше ${MAX_FIRES} за один ход`);
      }
      const live = updated.find(s => s.id === event.sheetId)!;
      const owner = `момент «${MOMENTS[event.moment]}» у «${effect.label ?? id}»`;
      const seed = { moment: { moment: event.moment, sheet: event.sheetId, about: event.about ?? null } };
      if (!holds(effect, live, seed, owner, world)) continue;

      const call = { effectId: id, effect, sheet: live, owner, args: {}, props: null, seed };
      const done = runCall(packCall(call, world), { sheet: live, owner, seed }, world);
      let next = done.sheet;
      if (durationOf(effect) === 'uses') next = spendUse(next, id);
      updated = updated.map(s => (s.id === next.id ? next : s));

      reports.push({
        sheetId: event.sheetId,
        report: {
          kind: 'moment', effect: id, from: event.sheetId, label: effect.label ?? id,
          reply: false, trace: done.trace, stopped: done.stopped,
          changes: done.changes, effects: done.effects, removed: done.removed, spent: [],
          emitted: done.emitted,
        },
      });
    }
  }

  return { sheets: updated, reports };
}

function triggeredOn(sheet: Sheet, world: WorldContext): { id: string; effect: Effect }[] {
  const worn = wornEffects(world.system, sheet, { strict: false });
  const roomWorn = new Set(worn.map(w => w.id));
  const room = (world.system.room_rules ?? [])
    .filter(id => !roomWorn.has(id))
    .map(id => ({ id, effect: findEffect(world.system, id) }))
    .filter((entry): entry is { id: string; effect: Effect } => Boolean(entry.effect));
  return [...worn, ...room].filter(({ effect }) => activationOf(effect) === 'triggered');
}

function listeners(sheet: Sheet, event: MomentEvent, world: WorldContext): { id: string; effect: Effect }[] {
  return triggeredOn(sheet, world).filter(({ effect }) => momentOf(effect.trigger?.on) === event.moment);
}

export const FIELD_PREFIX = 'field:';

export const fieldOf = (on: string | undefined): string | null =>
  (on && on.startsWith(FIELD_PREFIX) ? on.slice(FIELD_PREFIX.length) : null);

const truthy = (value: unknown): boolean =>
  value === true || (typeof value === 'number' && value !== 0) || (typeof value === 'string' && value !== '');

const valueOn = (sheet: Sheet, tag: string, world: WorldContext): unknown =>
  calc(world.system, sheet, tag, newPass(world.system, sheet, { compendium: world.compendium }));

export function fireCrossings(before: Sheet[], after: Sheet[], world: WorldContext): MomentRun {
  let updated = after;
  let previous = before;
  const reports: { sheetId: string; report: Report }[] = [];
  let fired = 0;

  for (;;) {
    const wave: { sheetId: string; id: string; effect: Effect; tag: string; value: unknown }[] = [];
    for (const sheet of updated) {
      const was = previous.find(s => s.id === sheet.id);
      if (!was || was === sheet) continue;
      for (const { id, effect } of triggeredOn(sheet, world)) {
        const tag = fieldOf(effect.trigger?.on);
        if (!tag) continue;
        const value = valueOn(sheet, tag, world);
        if (!truthy(value) || truthy(valueOn(was, tag, world))) continue;
        wave.push({ sheetId: sheet.id, id, effect, tag, value });
      }
    }
    if (!wave.length) break;
    previous = updated;

    for (const { sheetId, id, effect, tag, value } of wave) {
      if (fired++ >= MAX_FIRES) {
        throw new EngineError(`поля будят эффекты без остановки: больше ${MAX_FIRES} срабатываний за раз`);
      }
      const live = updated.find(s => s.id === sheetId)!;
      const label = world.system.fields.find(f => f.tag === tag)?.label ?? tag;
      const owner = `поле «${label}» стало верным у «${effect.label ?? id}»`;
      const seed = { field: { tag, value } };
      if (!holds(effect, live, seed, owner, world)) continue;

      const call = { effectId: id, effect, sheet: live, owner, args: {}, props: null, seed };
      const done = runCall(packCall(call, world), { sheet: live, owner, seed }, world);
      let next = done.sheet;
      if (durationOf(effect) === 'uses') next = spendUse(next, id);
      updated = updated.map(s => (s.id === next.id ? next : s));

      reports.push({
        sheetId,
        report: {
          kind: 'moment', effect: id, from: sheetId, label: effect.label ?? id,
          reply: false, trace: done.trace, stopped: done.stopped,
          changes: done.changes, effects: done.effects, removed: done.removed, spent: [],
          emitted: done.emitted,
        },
      });
    }
  }

  return { sheets: updated, reports };
}

function holds(
  effect: Effect, sheet: Sheet, seed: Record<string, unknown>, owner: string, world: WorldContext,
): boolean {
  const condition = effect.trigger?.condition;
  if (!condition) return true;
  const pass = newPass(world.system, sheet, { compendium: world.compendium });
  const own = condition && typeof condition === 'object' && 'expr' in condition
    ? { ...condition, of: 'target' as const }
    : condition;
  const value = resolveRef(own, { pass, owner, results: seed });
  if (typeof value !== 'boolean') {
    throw new EngineError(`${owner}: условие должно давать да/нет, а дало ${JSON.stringify(value)}`);
  }
  return value;
}

export const describeMoment = (
  world: WorldContext, entry: { sheetId: string; report: Report }, sheets: Sheet[],
): string => {
  const who = sheets.find(s => s.id === entry.sheetId)?.name ?? entry.sheetId;
  const what = effectLabelOf(world.system, entry.report.effect);
  const changes = (entry.report.changes as { tag: string; from: unknown; to: unknown }[])
    .map(change => {
      const field = world.system.fields.find(f => f.tag === change.tag);
      return `${field?.label ?? change.tag}: ${change.from} → ${change.to}`;
    });
  return changes.length ? `${who}: «${what}» — ${changes.join(', ')}` : `${who}: «${what}»`;
};
