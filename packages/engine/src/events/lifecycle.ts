import { findEffect, wornEffects } from '../engine/effects.ts';
import { EngineError } from '../engine/errors.ts';
import { listening } from './bus.ts';
import type { WorldContext } from './envelope.ts';
import { fire, wornEntry, wornSeed } from './moments.ts';
import type { Fired, Firing, MomentRun } from './moments.ts';
import type { Sheet, WornEffect } from '../model/types.ts';

export type Turn = 'attach' | 'detach';

export interface Change { sheetId: string; entry: WornEffect; turn: Turn }

const MAX_FIRES = 32;

export const HOOK_WORDS: Record<Turn, string> = { attach: 'при наложении', detach: 'при спадании' };

export const HEARD_WORDS: Record<Turn, string> = { attach: 'появилось', detach: 'ушло' };

const actingOn = (sheet: Sheet, world: WorldContext): WornEffect[] =>
  wornEffects(world.system, sheet, { strict: false, compendium: world.compendium }).map(worn => worn.entry);

export function lifecycleChanges(before: Sheet[], after: Sheet[], world: WorldContext): Change[] {
  const out: Change[] = [];
  for (const sheet of after) {
    const was = before.find(s => s.id === sheet.id);
    if (!was || was === sheet) continue;
    const old = actingOn(was, world);
    for (const entry of actingOn(sheet, world)) {
      const at = old.findIndex(o => o.effectId === entry.effectId);
      if (at >= 0) old.splice(at, 1);
      else out.push({ sheetId: sheet.id, entry, turn: 'attach' });
    }
    for (const entry of old) out.push({ sheetId: sheet.id, entry, turn: 'detach' });
  }
  return out;
}

function firingsOf({ sheetId, entry, turn }: Change, sheets: Sheet[], world: WorldContext): Firing[] {
  const effect = findEffect(world.system, entry.effectId);
  const live = sheets.find(s => s.id === sheetId);
  if (!effect || !live) return [];
  const label = effect.label ?? entry.effectId;
  const out: Firing[] = [];
  if (effect[turn]?.length) {
    out.push({
      sheetId, id: entry.effectId, effect, steps: effect[turn],
      owner: `«${label}» ${HOOK_WORDS[turn]}`,
      label: `${label} · ${HOOK_WORDS[turn]}`,
      seed: { worn: wornSeed(entry) },
    });
  }
  const occasion = turn === 'attach'
    ? { kind: 'gained' as const, effect: entry.effectId }
    : { kind: 'lost' as const, effect: entry.effectId };
  for (const { id, effect: listener, handler } of listening(world.system, live, occasion, { compendium: world.compendium })) {
    out.push({
      sheetId, id, effect: listener, handler, steps: handler.steps,
      owner: `«${label}» ${HEARD_WORDS[turn]} у «${listener.label ?? id}»`,
      label: listener.label ?? id,
      seed: { worn: wornEntry(live, id), about: wornSeed(entry) },
    });
  }
  return out;
}

export function fireLifecycle(before: Sheet[], after: Sheet[], world: WorldContext): MomentRun {
  let previous = before;
  let updated = after;
  const reports: Fired[] = [];
  let fired = 0;

  for (;;) {
    const wave = lifecycleChanges(previous, updated, world);
    previous = updated;
    if (!wave.length) break;

    for (const change of wave) {
      for (const firing of firingsOf(change, updated, world)) {
        if (fired++ >= MAX_FIRES) {
          throw new EngineError(`наложения и спадания будят друг друга без остановки: больше ${MAX_FIRES} за раз`);
        }
        const done = fire(firing, updated, world);
        if (!done) continue;
        updated = done.sheets;
        reports.push(done.fired);
      }
    }
  }

  return { sheets: updated, reports };
}
