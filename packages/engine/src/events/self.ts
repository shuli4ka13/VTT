import { packCall, runCall } from './call.ts';
import { requireEffect } from '../engine/effects.ts';
import { propsOf, actionOf } from './envelope.ts';
import type { Report, WorldContext } from './envelope.ts';
import type { Sheet } from '../model/types.ts';

export interface SelfRun {
  sheet: Sheet;
  report: Report | null;
}

export function runSelfTrack(
  actionId: string, sheet: Sheet, world: WorldContext & { inputs?: Record<string, number | string> },
): SelfRun {
  const action = actionOf(actionId, { system: world.system, compendium: world.compendium });
  const effect = requireEffect(world.system, action.effect, `действие «${action.label}»`);
  const track = effect.self ?? [];
  if (!track.length) return { sheet, report: null };

  const owner = `дорожка «со мной» эффекта «${effect.label || action.effect}»`;
  const call = {
    effectId: action.effect,
    effect: { ...effect, steps: track },
    sheet,
    owner,
    args: action.binding.args || {},
    props: propsOf(action.record, world.system),
    ...(world.inputs ? { inputs: world.inputs } : {}),
  };
  const done = runCall(packCall(call, world), { sheet, owner }, world);

  return {
    sheet: done.sheet,
    report: {
      kind: 'self', effect: action.effect, from: sheet.id, label: effect.label || action.effect,
      reply: false, trace: done.trace, stopped: done.stopped,
      changes: done.changes, effects: done.effects, removed: done.removed, spent: [],
      emitted: done.emitted,
    },
  };
}
