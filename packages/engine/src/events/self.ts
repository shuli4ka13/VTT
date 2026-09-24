import { packCall, runCall } from './call.ts';
import { requireEffect } from '../engine/effects.ts';
import { actionOf } from './envelope.ts';
import { propsOf, entryOf } from '../model/owned.ts';
import type { Report, WorldContext } from './envelope.ts';
import { refusalWords } from './refusal.ts';
import type { Sheet, System } from '../model/types.ts';

export interface SelfRun {
  sheet: Sheet;
  report: Report | null;
  desk?: Sheet;
}

export function selfRefusal(run: SelfRun, world: { system: System }, label: string): string | null {
  const why = refusalWords(run.report, world.system);
  return why ? `«${label}» не состоялось: ${why}` : null;
}

export function runSelfTrack(
  actionId: string, sheet: Sheet, world: WorldContext & { inputs?: Record<string, number | string> },
): SelfRun {
  const action = actionOf(actionId, { system: world.system, compendium: world.compendium });
  const effect = requireEffect(world.system, action.effect, `действие «${action.label}»`);
  const track = effect.self ?? [];
  if (!track.length) return { sheet, report: null };

  const owner = `стоимость действия «${action.label}»`;
  const call = {
    effectId: action.effect,
    effect: { ...effect, steps: track },
    sheet,
    owner,
    args: action.binding.args || {},
    props: propsOf(action.record, world.system, entryOf(sheet, action.record.id)),
    ...(world.inputs ? { inputs: world.inputs } : {}),
    alone: true,
  };
  const done = runCall(packCall(call, world), { sheet, owner }, world);
  const idle = !done.stopped && !done.changes.length && !done.effects.length && !done.removed.length;
  if (idle) return { sheet, report: null };

  return {
    sheet: done.sheet,
    ...(done.desk ? { desk: done.desk } : {}),
    report: {
      kind: 'self', effect: action.effect, from: sheet.id, label: action.label,
      reply: false, trace: done.trace, stopped: done.stopped,
      changes: done.changes, effects: done.effects, removed: done.removed, spent: [],
      emitted: done.emitted,
    },
  };
}
