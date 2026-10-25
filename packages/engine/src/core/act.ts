import { lazyPlan } from '../model/flow.ts';
import { actionOf, effectLabelOf } from '../events/actions.ts';
import { asksOf } from '../model/asks.ts';
import { loopOf } from '../engine/steps/each.ts';
import { requireEffect, isPipeline } from '../engine/effects.ts';
import { releaseHolder } from '../events/bonds.ts';
import { refusalWords } from '../events/refusal.ts';
import { propsOf, keyOf } from '../model/owned.ts';
import { entryByKey } from '../model/item-ref.ts';
import type { Inputs } from '../model/asks.ts';
import { EngineError } from '../engine/errors.ts';
import { render, renderLines } from './render.ts';
import { External, Pause, emptyJournal } from './external.ts';
import { Path } from './path.ts';
import { Run, newSink, reportOf } from './run.ts';
import { runnerOf, idleTrace } from './steps.ts';
import { keysOf } from './subs.ts';
import { CUT_WORDS } from './limits.ts';
import type { Journal, Mode, Question } from './external.ts';
import type { Frame, Delivery, Delivered, Claims, Lazy } from './run.ts';
import type { Bound } from '../engine/refs.ts';
import type { Entry } from './log.ts';
import type { RollResult } from './dice.ts';
import type { StepData } from './steps.ts';
import type { Clock } from '../engine/clock.ts';
import type { System, Sheet, Compendium, Die, WornEffect } from '../model/types.ts';
import { tableOf } from '../model/buttons.ts';
import { TARGETS_SEED } from '../model/references.ts';

export { tableOf };

export interface ActIntent {
  actionId: string;
  fromId: string;
  toIds: string[];
  inputs?: Inputs;
  claims?: Record<string, string[]>;
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
  | { kind: 'done'; sheets: Sheet[]; log: string[]; lines: (string[] | null)[]; entries: Entry[]; journal: Journal; fresh: number[] }
  | { kind: 'paused'; sheets: Sheet[]; log: string[]; lines: (string[] | null)[]; entries: Entry[]; journal: Journal; fresh: number[]; question: Question };

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
    return { kind: 'done', sheets: [...state.sheets], log: render(log, system, state.sheets), lines: renderLines(log, system, state.sheets), entries: log, journal: ext.settled(), fresh: ext.fresh };
  } catch (err) {
    if (!(err instanceof Pause)) throw err;
    const log = [...state.log];
    return {
      kind: 'paused', sheets: [...state.sheets], log: render(log, system, state.sheets), lines: renderLines(log, system, state.sheets), entries: log,
      journal: ext.snapshot(), fresh: ext.fresh, question: err.question,
    };
  }
}

export function runAct(run: Run, intent: ActIntent, root: Path): void {
  const { system, compendium } = run.world;
  const { state } = run;
  const targets = [...new Set(intent.toIds)];
  const action = actionOf(intent.actionId, { system, compendium });
  const effect = requireEffect(system, action.effect, `действие «${action.label}»`);
  if (!isPipeline(effect)) {
    throw new EngineError(`действие «${action.label}» зовёт пассивный эффект «${effect.label || action.effect}» — его вешают, а не применяют`);
  }
  const actor = intent.fromId;
  const actorSheet = run.sheet(actor);
  if (!actorSheet) throw new EngineError(`в комнате нет листа «${actor}»`);
  for (const id of targets) if (!run.sheet(id)) throw new EngineError(`в комнате нет листа «${id}»`);
  const given = intent.inputs && Object.keys(intent.inputs).length ? intent.inputs : undefined;
  const flat = given ? Object.fromEntries(Object.entries(given).filter(([, value]) => value === null || typeof value !== 'object')) as Record<string, number | string> : {};
  const inputs = Object.keys(flat).length ? flat : undefined;
  const perTarget = (to: string): Record<string, number | string> | undefined => {
    const own = Object.fromEntries(Object.entries(given ?? {})
      .filter(([, value]) => value !== null && typeof value === 'object')
      .map(([key, value]) => [key, (value as Record<string, number | string>)[to]])
      .filter(([, value]) => value !== undefined)) as Record<string, number | string>;
    return inputs || Object.keys(own).length ? { ...inputs, ...own } : undefined;
  };
  if (given) {
    const asked = new Set(asksOf(intent.actionId, { system, compendium }).map(param => param.key));
    const stray = Object.keys(given).find(key => !asked.has(key));
    if (stray) throw new EngineError(`«${action.label}»: лишнее значение «${stray}» — действие о нём не спрашивает`);
  }
  const args = (action.binding.args || {}) as Record<string, unknown>;
  const entry = entryByKey(actorSheet, action.record.id, action.inst);
  const props = propsOf(action.record, system, entry);
  const item = entry ? { sheet: actor, key: keyOf(entry), record: action.record.id } : undefined;
  const paramDefs = effect.params ?? [];
  const claims: Claims = intent.claims ?? {};
  const table = tableOf(action.binding, effect);

  const bound: Record<string, Bound> = { носитель: actor };
  for (const param of paramDefs) {
    if (param.kind !== 'sheet') continue;
    bound[param.key] = table[param.key] === 'actor' ? actor : table[param.key] === 'targets' ? (param.many ? targets : targets[0] ?? null) : null;
  }
  const bondSheet = effect.bond ? bound[effect.bond.by] : null;
  let bond: WornEffect['bond'] = effect.bond && typeof bondSheet === 'string' ? { sheet: bondSheet, effect: effect.bond.effect } : undefined;

  const top = (path: Path, owner: string, extra: Partial<Frame> = {}): Frame => ({
    path, effectId: action.effect, label: action.label, owner, home: actor, bound,
    args, paramDefs, props, ...(item ? { item } : {}), ...(inputs ? { inputs } : {}), claims, hop: 0, inSub: false, ...(bond ? { bond } : {}), ...extra,
  });

  if (bond && effect.bond?.if && !run.holdsAt(top(root.phase('bond'), `держание «${action.label}»`), effect.bond.if)) bond = undefined;
  const many = Boolean(effect.bond?.many) && bond !== undefined;
  const holderArgs = many && effect.bond?.args ? run.valuesAt(top(root.phase('bond'), `держание «${action.label}»`), effect.bond.args) : {};
  if (bond && many) {
    const taken = new Set((run.sheet(bond.sheet)?.effects ?? []).map(entry => entry.inst));
    let inst = run.ext.id(root.phase('bond').phase(bond.effect));
    for (let n = 2; taken.has(inst); n += 1) inst = `${inst.replace(/~\d+$/, '')}~${n}`;
    bond = { ...bond, inst };
    run.hold(inst, holderArgs);
  }

  if (effect.cost?.length) {
    const sink = newSink();
    const costFrame = top(root.phase('cost'), `стоимость действия «${action.label}»`, { alone: true, cost: true });
    const ran = run.exec(costFrame, effect.cost, sink, run.argValues(costFrame));
    const report = reportOf('cost', action.effect, actor, action.label, sink, ran.stopped, false);
    const why = refusalWords(report, system);
    if (why) throw new EngineError(`«${action.label}» не состоялось: ${why}`);
    if (sink.changes.length || sink.effects.length || sink.removed.length) state.write({ fromId: actor, toId: actor, report });
    state.write(...sink.after);
  }

  if (effect.bond && bond && !many) {
    const released = releaseHolder(system, [...state.sheets], bond.sheet, bond.effect);
    state.replace(released.sheets);
    for (const broken of released.broken) {
      state.write({ text: `«${effectLabelOf(system, broken.effectId)}» спало с ${run.sheet(broken.sheetId)?.name ?? broken.sheetId}: наложивший взялся за новое` });
    }
  }

  const steps = effect.steps ?? [];
  const split = steps.findIndex(step => runnerOf(step.type).splits?.(step as StepData) === true);
  const label = `эффект «${effect.label || action.effect}»`;
  const keys = keysOf(system, action.effect, true);
  let calls: Delivery[];
  let lazy: Lazy | undefined;
  let shared: Record<string, unknown> = {};
  let sharedRolls: Record<string, RollResult> = {};

  const base = {
    effectId: action.effect, label: action.label, hop: 0, top: true, home: actor, keys,
    args, paramDefs, props, ...(item ? { item } : {}), ...(inputs ? { inputs } : {}), claims, ...(bond ? { bond } : {}),
  };

  if (split >= 0) {
    const each = steps[split] as StepData;
    const pre = steps.slice(0, split);
    const plan = lazyPlan(pre, index => runnerOf(pre[index]!.type).lazy?.(pre[index] as StepData) === true);
    const preFrame = top(root, label);
    const seeded = run.argValues(preFrame);
    lazy = {
      frame: preFrame,
      steps: new Map([...plan.guards].map(([index, guard]) => {
        const step = pre[index] as StepData;
        return [String(step.id), { step: guard ? { ...step, if: { expr: guard } } : step, index }] as const;
      })),
      stepIds: new Set(pre.map(step => step.id).filter((id): id is string => typeof id === 'string' && id !== '')),
    };
    preFrame.lazy = lazy;
    const sink = newSink();
    const ran = run.exec(preFrame, pre.filter((_, index) => !plan.guards.has(index) && !plan.hidden.has(index)), sink, seeded);
    if (ran.stopped) {
      const why = refusalWords(reportOf('effect', action.effect, actor, action.label, sink, ran.stopped, false), system);
      throw new EngineError(`«${action.label}» не состоялось: ${why ?? 'цепочка оборвана'}`);
    }
    if (sink.trace.some(one => !idleTrace(one, system)) || sink.changes.length || sink.effects.length || sink.removed.length) {
      state.write({ fromId: actor, toId: actor, report: reportOf('effect', action.effect, actor, action.label, sink, null, false) });
    }
    state.write(...sink.after);
    shared = Object.fromEntries(Object.entries(ran.results).filter(([key]) => lazy!.stepIds.has(key)));
    sharedRolls = ran.rolls;
    const rolls: Record<string, RollResult> = ran.rolls;
    const of = String(each.of ?? '');
    const as = loopOf(paramDefs, each as { of?: unknown })?.key ?? '';
    const list = bound[of];
    const ids = Array.isArray(list) ? list : typeof list === 'string' ? [list] : [];
    calls = ids.map((to): Delivery => ({
      ...base, ...(perTarget(to) ? { inputs: perTarget(to) } : {}), steps: steps.slice(split + 1), path: root.at(to), subject: to, bound: { ...bound, [as]: to },
      seed: shared, ...(Object.keys(rolls).length ? { rolls } : {}), lazy: lazy!, offset: split + 1, lead: sink.trace,
    }));
  } else {
    calls = [{ ...base, steps, path: root, subject: null, bound }];
  }

  const delivered: Delivered[] = [];
  run.group(calls, root, out => {
    if (bond && !many) {
      const holder = run.sheet(bond.sheet)!;
      if (!(holder.effects ?? []).some(entry => entry.effectId === bond.effect)) {
        state.put({ ...holder, effects: [...(holder.effects ?? []), { effectId: bond.effect }] });
      }
    }
    delivered.push(out);
  }, entries => state.write(...entries));

  const summaries: Record<string, unknown> = { ...shared };
  const doneRolls: Record<string, RollResult> = { ...sharedRolls };
  for (const id of lazy?.steps.keys() ?? []) {
    const made = state.memo(root.step(id).key) as { value: unknown; roll?: RollResult } | undefined;
    if (made) summaries[id] = made.value;
    if (made?.roll) doneRolls[id] = made.roll;
  }
  if (split < 0 && delivered[0]) {
    Object.assign(summaries, delivered[0].results);
    Object.assign(doneRolls, delivered[0].rolls);
  }
  const rows = delivered.filter(out => out.call.subject).map(out => ({ ...out.results, лист: out.call.subject }));
  const sink = newSink();
  const seed = { ...run.argValues(top(root.phase('done'), label)), ...summaries, [TARGETS_SEED]: rows };
  run.hear({ keys: keys.map(key => `done:${key}`), names: bound, seed, rolls: doneRolls, path: root.phase('done'), hop: 0, owner: sub => `«${sub.effect.label || sub.effectId}» — «${action.label}» завершено` }, sink);
  for (const report of sink.reactions) state.write({ fromId: actor, toId: actor, report });
  state.write(...sink.after);
  state.write(...run.window('done', keys.map(key => `done:${key}`), bound, seed, root, action.label, doneRolls));
}

export { CUT_WORDS };
