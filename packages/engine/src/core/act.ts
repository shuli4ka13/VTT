import { actionOf, effectLabelOf } from '../events/actions.ts';
import { requireEffect, isPipeline } from '../engine/effects.ts';
import { releaseHolder, holderOf, sharedHolderOf } from '../events/bonds.ts';
import { refusalWords } from '../events/refusal.ts';
import { propsOf, entryOf } from '../model/owned.ts';
import { EngineError } from '../engine/errors.ts';
import { render } from './render.ts';
import { External, Pause, emptyJournal } from './external.ts';
import { Path } from './path.ts';
import { Run, newSink, reportOf } from './run.ts';
import { runnerOf, onceStep } from './steps.ts';
import { CUT_WORDS } from './limits.ts';
import type { Journal, Mode, Question } from './external.ts';
import type { Frame, Memo, Delivery, Delivered } from './run.ts';
import type { Entry } from './log.ts';
import type { RollResult } from './dice.ts';
import type { StepData } from './steps.ts';
import type { Clock } from '../engine/clock.ts';
import type { System, Sheet, Compendium, Die } from '../model/types.ts';

export interface ActIntent {
  actionId: string;
  fromId: string;
  toIds: string[];
  inputs?: Record<string, number | string>;
  edits?: string[];
  targetEdits?: string[];
}

export interface ActWorld {
  system: System;
  compendium: Compendium;
  clock: Clock | null;
  sheets: Sheet[];
  die: Die;
  journal: Partial<Journal> & Pick<Journal, 'dice' | 'answers'>;
  newId?: () => string;
  declineAll?: boolean;
  mode?: Mode;
}

export type ActOutcome =
  | { kind: 'done'; sheets: Sheet[]; log: string[]; entries: Entry[]; journal: Journal; fresh: number[] }
  | { kind: 'paused'; sheets: Sheet[]; log: string[]; entries: Entry[]; journal: Journal; fresh: number[]; question: Question };

export function act(world: ActWorld, intent: ActIntent): ActOutcome {
  const { system, compendium, clock } = world;
  const mode: Mode = world.mode ?? (world.declineAll ? 'trial' : 'real');
  const journal: Journal = { ...emptyJournal(), ...world.journal, ids: world.journal.ids ?? {} };
  const ext = new External(journal, { die: world.die, ...(world.newId ? { newId: world.newId } : {}) }, mode);
  const run = new Run({ system, compendium, clock, sheets: world.sheets }, ext);
  const { state } = run;
  const root = Path.op('act');
  try {
    runAct(run, intent, root);
    run.settle(world.sheets, root);
    const log = [...state.log];
    return { kind: 'done', sheets: [...state.sheets], log: render(log, system, compendium, state.sheets), entries: log, journal: ext.settled(), fresh: ext.fresh };
  } catch (err) {
    if (!(err instanceof Pause)) throw err;
    const log = [...state.log];
    return {
      kind: 'paused', sheets: [...state.sheets], log: render(log, system, compendium, state.sheets), entries: log,
      journal: ext.snapshot(), fresh: ext.fresh, question: err.question,
    };
  }
}

export function runAct(run: Run, intent: ActIntent, root: Path): void {
  const { system, compendium } = run.world;
  const { state } = run;
  const targets = [...new Set(intent.toIds)];
  {
    const action = actionOf(intent.actionId, { system, compendium });
    const effect = requireEffect(system, action.effect, `действие «${action.label}»`);
    if (!isPipeline(effect)) {
      throw new EngineError(`действие «${action.label}» зовёт пассивный эффект «${effect.label || action.effect}» — его вешают, а не применяют`);
    }
    const actor = intent.fromId;
    const actorSheet = run.sheet(actor);
    if (!actorSheet) throw new EngineError(`в комнате нет листа «${actor}»`);
    for (const id of targets) if (!run.sheet(id)) throw new EngineError(`в комнате нет листа «${id}»`);
    const inputs = intent.inputs && Object.keys(intent.inputs).length ? intent.inputs : undefined;
    const args = (action.binding.args || {}) as Record<string, unknown>;
    const props = propsOf(action.record, system, entryOf(actorSheet, action.record.id));
    const paramDefs = effect.params ?? [];
    const claims: Record<string, readonly string[]> = {};
    for (const id of targets) if (intent.targetEdits?.length) claims[id] = intent.targetEdits;
    if (intent.edits?.length) claims[actor] = intent.edits;

    const top = (path: Path, owner: string, extra: Partial<Frame> = {}): Frame => ({
      path, effectId: action.effect, label: action.label, owner,
      here: actor, names: actor, sender: actor, receiver: null, opponent: targets[0] ?? null,
      args, paramDefs, props, ...(inputs ? { inputs } : {}), claims, actor: false, hop: 0, source: actor, ...extra,
    });

    if (effect.cost?.length) {
      const sink = newSink();
      const ran = run.exec(top(root.phase('cost'), `стоимость действия «${action.label}»`, { opponent: null, alone: true }), effect.cost, sink);
      const report = reportOf('cost', action.effect, actor, action.label, sink, ran.stopped, false);
      const why = refusalWords(report, system);
      if (why) throw new EngineError(`«${action.label}» не состоялось: ${why}`);
      if (sink.changes.length || sink.effects.length || sink.removed.length) state.write({ fromId: actor, toId: actor, report });
      state.write(...sink.after);
    }

    const shared = sharedHolderOf(system, action.effect);
    if (shared) {
      const released = releaseHolder(system, [...state.sheets], actor, shared);
      state.replace(released.sheets);
      for (const broken of released.broken) {
        state.write({ text: `«${effectLabelOf(system, broken.effectId)}» спало с ${run.sheet(broken.sheetId)?.name ?? broken.sheetId}: наложивший взялся за новое` });
      }
    }

    const steps = effect.steps ?? [];
    const split = steps.findIndex(step => runnerOf(step.type).splits === true);
    const label = `эффект «${effect.label || action.effect}»`;
    let body = steps;
    let seed: Record<string, unknown> = {};
    let rolls: Record<string, RollResult> = {};
    let memo: Memo | undefined;

    if (split >= 0) {
      const sink = newSink();
      const ran = run.exec(top(root, label), steps.slice(0, split), sink);
      if (ran.stopped) {
        const why = refusalWords(reportOf('effect', action.effect, actor, action.label, sink, ran.stopped, false), system);
        throw new EngineError(`«${action.label}» не состоялось: ${why ?? 'цепочка оборвана'}`);
      }
      if (sink.changes.length || sink.effects.length || sink.removed.length) {
        state.write({ fromId: actor, toId: actor, report: reportOf('effect', action.effect, actor, action.label, sink, null, false) });
      }
      state.write(...sink.after);
      body = steps.slice(split + 1);
      seed = ran.results;
      rolls = ran.rolls;
    } else {
      const stepIds = new Set(steps.map(step => step.id).filter((id): id is string => typeof id === 'string' && id !== ''));
      memo = { top: top(root, label), steps, stepIds };
      const gate = steps.findIndex(step => onceStep(step as StepData) && runnerOf(step.type).mayBreak === true);
      const sink = newSink();
      steps.forEach((step, index) => {
        if (onceStep(step as StepData) && (gate < 0 || index <= gate)) run.memoized(memo!, index, sink);
      });
    }

    const holder = holderOf(action.effect, effect);
    const delivered: Record<string, Delivered> = {};
    const calls: Delivery[] = targets.map(to => ({
      from: actor, to, effectId: action.effect, label: action.label, steps: body, path: root.at(to), hop: 0, top: true,
      seed, args, paramDefs, props, ...(inputs ? { inputs } : {}), claims, ...(memo ? { memo } : {}),
      ...(Object.keys(rolls).length ? { rolls } : {}),
    }));
    run.group(calls, (out, entries) => {
      if (holder) {
        const caster = run.sheet(actor)!;
        if (!(caster.effects ?? []).some(entry => entry.effectId === holder)) {
          state.put({ ...caster, effects: [...(caster.effects ?? []), { effectId: holder }] });
        }
      }
      const sink = newSink();
      run.fire('acted', 'action', actor, action.effect, out.emitted, out.results, out.call.to, out.call.path.phase('acted'), 0, sink);
      for (const report of sink.reactions) entries.push({ fromId: actor, toId: actor, report });
      entries.push(...sink.after);
      delivered[out.call.to] = out;
    }, entries => state.write(...entries));

    const summaries: Record<string, RollResult> = { ...rolls };
    if (memo) {
      steps.forEach((step, index) => {
        const id = (step as StepData).id;
        const made = state.memo(root.step(id ?? index).key) as { summary?: RollResult } | undefined;
        if (id != null && made?.summary) summaries[id] = made.summary;
      });
    }
    const table = targets.filter(id => delivered[id]).map(id => ({ ...delivered[id]!.results, лист: id }));
    const done = newSink();
    run.fire('done', 'any', actor, action.effect, targets.flatMap(id => delivered[id]?.emitted ?? []),
      { ...summaries, цели: table }, null, root.phase('done'), 0, done);
    for (const report of done.reactions) state.write({ fromId: actor, toId: actor, report });
    state.write(...done.after);
  }
}

export { CUT_WORDS };
