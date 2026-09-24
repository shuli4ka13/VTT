import { packCall, runCall } from './call.ts';
import { findEffect } from '../engine/effects.ts';
import { EngineError } from '../engine/errors.ts';
import { deskOf } from './desk.ts';
import { withSteps } from './bus.ts';
import type { Report, WorldContext } from './envelope.ts';
import { wornSeed } from './moments.ts';
import type { MomentRun } from './moments.ts';
import type { Sheet, WornEffect } from '../model/types.ts';

export type Turn = 'attach' | 'detach';

export interface Change { sheetId: string; entry: WornEffect; turn: Turn }

const MAX_FIRES = 32;

export const HOOK_WORDS: Record<Turn, string> = { attach: 'при наложении', detach: 'при спадании' };

export function lifecycleChanges(before: Sheet[], after: Sheet[]): Change[] {
  const out: Change[] = [];
  for (const sheet of after) {
    const was = before.find(s => s.id === sheet.id);
    if (!was || was === sheet) continue;
    const old = [...(was.effects ?? [])];
    const now = [...(sheet.effects ?? [])];
    for (const entry of now) {
      const at = old.findIndex(o => o.effectId === entry.effectId);
      if (at >= 0) old.splice(at, 1);
      else out.push({ sheetId: sheet.id, entry, turn: 'attach' });
    }
    for (const entry of old) out.push({ sheetId: sheet.id, entry, turn: 'detach' });
  }
  return out;
}

export function fireLifecycle(before: Sheet[], after: Sheet[], world: WorldContext): MomentRun {
  let previous = before;
  let updated = after;
  const reports: MomentRun['reports'] = [];
  let fired = 0;

  for (;;) {
    const wave = lifecycleChanges(previous, updated)
      .filter(change => (findEffect(world.system, change.entry.effectId)?.[change.turn]?.length ?? 0) > 0);
    previous = updated;
    if (!wave.length) break;

    for (const { sheetId, entry, turn } of wave) {
      if (fired++ >= MAX_FIRES) {
        throw new EngineError(`наложения и спадания будят друг друга без остановки: больше ${MAX_FIRES} за раз`);
      }
      const effect = findEffect(world.system, entry.effectId)!;
      const live = updated.find(s => s.id === sheetId);
      if (!live) continue;
      const owner = `«${effect.label ?? entry.effectId}» ${HOOK_WORDS[turn]}`;
      const seed = { worn: wornSeed(entry) };
      const here = { ...world, desk: deskOf(updated) ?? world.desk ?? null };
      const call = { effectId: entry.effectId, effect: withSteps(effect, effect[turn]), sheet: live, owner, args: {}, props: null, seed };
      const done = runCall(packCall(call, here), { sheet: live, owner, seed }, here);
      const next = done.sheet;
      const desk = done.desk;
      updated = updated.map(s => (s.id === next.id ? next : desk && s.id === desk.id ? desk : s));

      const report: Report = {
        kind: 'moment', effect: entry.effectId, from: sheetId,
        label: `${effect.label ?? entry.effectId} · ${HOOK_WORDS[turn]}`,
        reply: false, trace: done.trace, stopped: done.stopped,
        changes: done.changes, effects: done.effects, removed: done.removed, spent: [],
        emitted: done.emitted,
      };
      reports.push({ sheetId, report });
    }
  }

  return { sheets: updated, reports };
}
