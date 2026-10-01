import { actionOf, effectLabelOf } from '../events/actions.ts';
import { stepModule } from '../engine/steps/index.ts';
import { rolledSoFar } from '../engine/rolled.ts';
import { packGuardRef } from '../engine/rule.ts';
import { newPass } from '../engine/calc.ts';
import { incomingRollModifiers } from '../engine/modifiers.ts';
import { CUT_WORDS } from './limits.ts';
import { releaseHolder, holderOf, sharedHolderOf } from '../events/bonds.ts';
import { settle } from '../events/settle.ts';
import { describeEntry, previewLines } from '../events/describe.ts';
import { describeMoment } from '../events/moments.ts';
import { sharedOf } from '../events/desk.ts';
import { requireEffect, isPipeline } from '../engine/effects.ts';
import { refusalWords } from '../events/refusal.ts';
import { propsOf, entryOf } from '../model/owned.ts';
import { EngineError } from '../engine/errors.ts';
import { State } from './state.ts';
import { External, Pause } from './journal.ts';
import { Runner, newSink, reportOf } from './run.ts';
import type { Entry, Packed } from './run.ts';
import type { Journal, Question } from './journal.ts';
import type { WorldContext } from './types.ts';
import type { StepData, StepContext } from '../engine/steps/index.ts';
import type { EmittedEvent } from '../engine/rule.ts';
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
  journal: Journal;
  declineAll?: boolean;
}

export type ActOutcome =
  | { kind: 'done'; sheets: Sheet[]; log: string[]; entries: Entry[]; journal: Journal; fresh: number[] }
  | { kind: 'paused'; sheets: Sheet[]; log: string[]; entries: Entry[]; journal: Journal; fresh: number[]; question: Question };

export const render = (entries: Entry[], system: System, sheets: Sheet[]): string[] =>
  entries.map(entry => ('text' in entry ? entry.text : describeEntry(entry, system, sheets)));

export function settleLines(world: WorldContext, before: Sheet[], after: Sheet[], lines: string[], entries?: Entry[]): Sheet[] {
  const done = settle(before, after, world);
  for (const entry of done.aftermath) {
    if (entry.kind === 'fired') {
      lines.push(describeMoment(world, entry, done.sheets));
      entries?.push({ fromId: entry.sheetId, toId: entry.sheetId, report: entry.report });
      continue;
    }
    const who = done.sheets.find(s => s.id === entry.sheetId)?.name ?? entry.sheetId;
    lines.push(`«${effectLabelOf(world.system, entry.effectId)}» спало с ${who}: держать стало нечем`);
  }
  return done.sheets;
}

const HOISTED = (step: StepData): boolean => stepModule(step.type).once?.(step) ?? false;

export function act(world: ActWorld, intent: ActIntent): ActOutcome {
  const { system, compendium, clock } = world;
  const ext = new External(world.journal, world.die, world.declineAll);
  const state = new State([...world.sheets], system, compendium, clock);
  const run = new Runner(state, ext);
  const log: Entry[] = [];
  const nameOf = (id: string): string => state.find(id)?.name ?? id;
  const targets = [...new Set(intent.toIds)];

  try {
    const action = actionOf(intent.actionId, { system, compendium });
    const effect = requireEffect(system, action.effect, `действие «${action.label}»`);
    if (!isPipeline(effect)) {
      throw new EngineError(`действие «${action.label}» зовёт пассивный эффект «${effect.label || action.effect}» — его вешают, а не применяют`);
    }
    const actor = intent.fromId;
    if (!state.find(actor)) throw new EngineError(`в комнате нет листа «${actor}»`);
    for (const id of targets) if (!state.find(id)) throw new EngineError(`в комнате нет листа «${id}»`);
    const inputs = intent.inputs && Object.keys(intent.inputs).length ? intent.inputs : undefined;
    const args = (action.binding.args || {}) as Record<string, unknown>;
    const props = propsOf(action.record, system, entryOf(state.get(actor), action.record.id));
    const paramDefs = effect.params ?? [];

    if (effect.cost?.length) {
      const sink = newSink();
      const owner = `стоимость действия «${action.label}»`;
      const ran = run.exec({
        scope: 'cost', me: actor, here: actor, target: null, effectId: action.effect, owner,
        args, paramDefs, props, ...(inputs ? { inputs } : {}), source: actor, hop: 0, names: 'me', alone: true,
      }, effect.cost, sink);
      const report = reportOf('cost', action.effect, actor, action.label, sink, ran.stopped, false);
      const why = refusalWords(report, system);
      if (why) throw new EngineError(`«${action.label}» не состоялось: ${why}`);
      if (sink.changes.length || sink.effects.length || sink.removed.length) {
        log.push({ fromId: actor, toId: actor, report });
      }
      log.push(...sink.after);
    }

    const shared = sharedHolderOf(system, action.effect);
    if (shared) {
      const released = releaseHolder(system, state.sheets, actor, shared);
      state.sheets = released.sheets;
      for (const broken of released.broken) {
        log.push({ text: `«${effectLabelOf(system, broken.effectId)}» спало с ${nameOf(broken.sheetId)}: наложивший взялся за новое` });
      }
    }

    const claims = intent.edits ?? [];
    const steps = effect.steps ?? [];
    const split = steps.findIndex(step => stepModule(step.type).splits === true);
    const body = split >= 0 ? steps.slice(split + 1) : steps;
    const firstTarget = targets[0] ? state.find(targets[0]) : null;
    const against = firstTarget ? newPass(system, firstTarget, { compendium }) : null;

    let packed: Packed | undefined;
    let rolledNow: () => StepData[] = () => [];
    let seed: Record<string, unknown> = {};

    if (split >= 0) {
      const sink = newSink();
      const ran = run.exec({
        scope: 'once', me: actor, here: actor, target: null, opponent: targets[0] ?? null, effectId: action.effect,
        owner: `эффект «${effect.label || action.effect}»`, args, paramDefs, props, ...(inputs ? { inputs } : {}),
        ...(claims.length ? { claims } : {}),
        ...(against ? { against: (tags: readonly string[]) => incomingRollModifiers(tags, against) } : {}),
        source: actor, hop: 0, names: 'me',
      }, steps.slice(0, split), sink);
      const first = { ran, sink };
      if (first.ran.stopped) throw new EngineError(`«${action.label}» не состоялось: ${refusalWords(reportOf('effect', action.effect, actor, action.label, first.sink, first.ran.stopped, false), system) ?? 'цепочка оборвана'}`);
      if (first.sink.changes.length || first.sink.effects.length || first.sink.removed.length) {
        log.push({ fromId: actor, toId: actor, report: reportOf('effect', action.effect, actor, action.label, first.sink, null, false) });
      }
      log.push(...first.sink.after);
      const hoisted = first.ran.packed;
      rolledNow = () => hoisted;
      seed = first.ran.results;
    } else {
      const stepIds = new Set(steps.map(step => step.id).filter((id): id is string => typeof id === 'string' && id !== ''));
      const gate = steps.findIndex(step => HOISTED(step as StepData) && stepModule(step.type).mayBreak === true);
      const cache: Record<number, StepData> = {};
      const seenSink = newSink();
      const now = () => ({ sheet: state.get(actor), shared: sharedOf(system, state.sheets) });
      let start: ReturnType<typeof now> | null = null;
      const packOne = (index: number): StepData => {
        const step = steps[index] as StepData;
        const { sheet, shared } = start ?? now();
        const done = Object.keys(cache).map(Number).filter(at => at < index).sort((a, b) => a - b).map(at => cache[at]!);
        const inner: StepContext = {
          system, sheet, die: ext.dieAt(`send/${step.id ?? index}`),
          pass: newPass(system, sheet, { compendium, shared }),
          params: args, paramDefs, props, owner: `эффект «${effect.label || action.effect}»`,
          ...(inputs ? { inputs } : {}),
          ...(against ? { against: (tags: readonly string[]) => incomingRollModifiers(tags, against) } : {}),
          ...(claims.length ? { claims } : {}),
          sender: rolledSoFar(done as unknown as Record<string, unknown>[]), stepIds,
          seen: (rolled, tags, rollerId) => run.seen(rollerId, targets[0] ?? null, rolled, tags, `send/${step.id ?? index}`, action.effect, 0, seenSink),
        };
        const when = packGuardRef(step.when, inner);
        if (when && typeof when === 'object' && 'const' in when && (when as { const: unknown }).const === false) {
          return { type: step.type, id: step.id ?? null, when } as unknown as StepData;
        }
        return { type: step.type, id: step.id ?? null, ...(when !== undefined ? { when } : {}), ...stepModule(step.type).pack(step, inner) } as StepData;
      };
      const eager = (): void => {
        steps.forEach((step, index) => {
          if (HOISTED(step as StepData) && (gate < 0 || index <= gate)) cache[index] = packOne(index);
        });
      };
      eager();
      start = now();
      log.push(...seenSink.after);
      seenSink.after = [];
      packed = (index: number): StepData | undefined => {
        if (!HOISTED(steps[index] as StepData)) return undefined;
        if (cache[index]) return cache[index];
        const one = packOne(index);
        if (!run.isDrying) {
          cache[index] = one;
          log.push(...seenSink.after);
        }
        seenSink.after = [];
        return one;
      };
      rolledNow = () => Object.keys(cache).map(Number).sort((a, b) => a - b).map(at => cache[at]!);
    }

    const holder = holderOf(action.effect, effect);
    const seen: Record<string, { results: Record<string, unknown>; emitted: EmittedEvent[] }> = {};
    const targetClaims = intent.targetEdits ?? [];
    const callTo = (toId: string) => ({
      effectId: action.effect, label: action.label, steps: body, from: actor, to: toId, hop: 0, seed,
      scope: `t:${toId}`, args, paramDefs, props, ...(inputs ? { inputs } : {}), ...(packed ? { packed } : {}),
      ...(claims.length ? { mine: claims } : {}), asks: false,
    });

    for (const toId of targets) {
      const dry = run.dry(() => run.deliver({ ...callTo(toId), claims: targetClaims }));
      const before = dry ? run.offers('target', toId, action.effect, 0, dry.results, dry.emitted, `target:${toId}`) : [];
      if (dry && before.length) {
        const asked = run.ask({
          key: `target:${toId}`, sheetId: toId, window: 'target', label: '', offers: before,
          results: dry.results, preview: previewLines(rolledNow(), system, dry),
        }, action.effect, 0, dry.emitted, actor);
        log.push(...asked.entries);
      }
      const delivered = run.deliver({ ...callTo(toId), claims: targetClaims });
      if (!delivered) continue;
      log.push(...delivered.entries);
      if (holder) {
        const caster = state.get(actor);
        if (!(caster.effects ?? []).some(entry => entry.effectId === holder)) {
          state.put({ ...caster, effects: [...(caster.effects ?? []), { effectId: holder }] });
        }
      }
      const out = newSink();
      run.fire('acted', 'action', actor, action.effect, delivered.emitted, delivered.results, toId, `t:${toId}^`, 0, out);
      for (const report of out.reactions) log.push({ fromId: actor, toId: actor, report });
      log.push(...out.after);
      seen[toId] = { results: delivered.results, emitted: delivered.emitted };
    }

    for (const toId of targets) {
      const here = seen[toId];
      if (!here || !state.find(toId)) continue;
      const after = run.offers('after', toId, action.effect, 0, here.results, here.emitted, `after:${toId}`);
      if (after.length) {
        log.push(...run.ask({
          key: `after:${toId}`, sheetId: toId, window: 'after', label: '', offers: after, results: here.results, preview: [],
        }, action.effect, 0, here.emitted, actor).entries);
      }
    }

    const done = newSink();
    const table = targets.filter(id => seen[id]).map(id => ({ ...seen[id]!.results, лист: id }));
    run.fire('done', 'any', actor, action.effect, targets.flatMap(id => seen[id]?.emitted ?? []),
      { ...rolledSoFar(rolledNow() as unknown as Record<string, unknown>[]), цели: table }, null, 'done', 0, done);
    for (const report of done.reactions) log.push({ fromId: actor, toId: actor, report });
    log.push(...done.after);
    if (run.cut) log.push({ text: CUT_WORDS });

    const lines = render(log, system, state.sheets);
    const final = settleLines({ system, compendium, clock, die: ext.dieAt('settle') }, world.sheets, state.sheets, lines, log);
    return { kind: 'done', sheets: final, log: lines, entries: log, journal: ext.settled(), fresh: ext.fresh };
  } catch (err) {
    if (!(err instanceof Pause)) throw err;
    return { kind: 'paused', sheets: state.sheets, log: render(log, system, state.sheets), entries: log, journal: { ...world.journal }, fresh: ext.fresh, question: err.question };
  }
}
