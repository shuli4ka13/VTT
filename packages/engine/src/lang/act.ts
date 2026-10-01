import { actionOf, effectLabelOf } from '../events/envelope.ts';
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
import type { Entry } from './run.ts';
import type { Journal, Question } from './journal.ts';
import type { Envelope, WorldContext } from '../events/envelope.ts';
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

const HOISTED = (step: StepData): boolean =>
  (step.type === 'threshold' && (step.side ?? 'sender') !== 'target') || step.type === 'amount';

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

    if (effect.self?.length) {
      const sink = newSink();
      const owner = `стоимость действия «${action.label}»`;
      const ran = run.exec({
        scope: 'self', me: actor, here: actor, target: null, effectId: action.effect, owner,
        args, paramDefs, props, ...(inputs ? { inputs } : {}), source: actor, hop: 0, names: 'me', alone: true,
      }, effect.self, sink);
      const report = reportOf('self', action.effect, actor, action.label, sink, ran.stopped, false);
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

    let claims = intent.edits ?? [];
    const steps = effect.steps ?? [];
    const stepIds = new Set(steps.map(step => step.id).filter((id): id is string => typeof id === 'string' && id !== ''));
    const pack = (round: number, kept?: Record<number, StepData>): Record<number, StepData> => {
      const sheet = state.get(actor);
      const first = targets[0] ? state.find(targets[0]) : null;
      const against = first ? newPass(system, first, { compendium }) : null;
      const base: StepContext = {
        system, sheet, die: ext.dieAt(`send:${round}`),
        pass: newPass(system, sheet, { compendium, shared: sharedOf(system, state.sheets) }),
        params: args, paramDefs, props, owner: `эффект «${effect.label || action.effect}»`,
        ...(inputs ? { inputs } : {}),
        ...(against ? { against: (tags: readonly string[]) => incomingRollModifiers(tags, against) } : {}),
        ...(claims.length ? { claims } : {}),
        ...(kept ? { kept: Object.fromEntries(Object.entries(kept).map(([index, step]) => [String(step.id ?? index), step])) } : {}),
      };
      const out: Record<number, StepData> = {};
      const done: StepData[] = [];
      steps.forEach((step, index) => {
        if (!HOISTED(step as StepData)) return;
        const inner = { ...base, sender: rolledSoFar(done as unknown as Record<string, unknown>[]), stepIds };
        const when = packGuardRef((step as StepData).when, inner);
        const one = { type: step.type, id: step.id ?? null, ...(when !== undefined ? { when } : {}), ...stepModule(step.type).pack(step as StepData, inner) } as StepData;
        out[index] = one;
        done.push(one);
      });
      return out;
    };
    const asEnvelope = (hoisted: Record<number, StepData>): Envelope => ({
      kind: 'effect', effect: action.effect, from: actor, action: action.id, label: action.label, steps: Object.values(hoisted),
    });
    let packed = pack(0);

    const seenBySender = rolledSoFar(Object.values(packed) as unknown as Record<string, unknown>[]);
    const senderOffers = run.offers('sender', actor, action.effect, 0, seenBySender, [], 'sender');
    if (senderOffers.length) {
      const asked = run.ask({
        key: 'sender', sheetId: actor, window: 'sender', label: '', offers: senderOffers,
        results: seenBySender, preview: previewLines(asEnvelope(packed), system, null),
      }, action.effect, 0, [], targets[0] ?? null);
      log.push(...asked.entries);
      if (asked.claims.length) {
        claims = [...new Set([...claims, ...asked.claims])];
        packed = pack(1, packed);
        log.push({ text: `${nameOf(actor)}: бросок собран заново — выпавшее остаётся, новые кости добавлены` });
      }
    }

    const holder = holderOf(action.effect, effect);
    const seen: Record<string, { results: Record<string, unknown>; emitted: EmittedEvent[] }> = {};
    const taken: Record<string, string[]> = {};
    const claimsFor = (id: string): string[] => [...new Set([...(intent.targetEdits ?? []), ...(taken[id] ?? [])])];
    const callTo = (toId: string) => ({
      effectId: action.effect, label: action.label, steps: effect.steps ?? [], from: actor, to: toId, hop: 0,
      scope: `t:${toId}`, args, paramDefs, props, ...(inputs ? { inputs } : {}), packed, asks: false,
    });

    for (const toId of targets) {
      const dry = run.dry(() => run.deliver({ ...callTo(toId), claims: claimsFor(toId) }));
      const before = dry ? run.offers('target', toId, action.effect, 0, dry.results, dry.emitted, `target:${toId}`) : [];
      if (dry && before.length) {
        const asked = run.ask({
          key: `target:${toId}`, sheetId: toId, window: 'target', label: '', offers: before,
          results: dry.results, preview: previewLines(asEnvelope(packed), system, dry),
        }, action.effect, 0, dry.emitted, actor);
        log.push(...asked.entries);
        if (asked.claims.length) {
          taken[toId] = [...new Set([...(taken[toId] ?? []), ...asked.claims])];
          log.push({ text: `${nameOf(toId)}: бросок пересчитан с заявленной правкой` });
        }
      }
      const delivered = run.deliver({ ...callTo(toId), claims: claimsFor(toId) });
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
      { ...rolledSoFar(Object.values(packed) as unknown as Record<string, unknown>[]), цели: table }, null, 'done', 0, done);
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
