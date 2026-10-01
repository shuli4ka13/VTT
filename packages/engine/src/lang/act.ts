import { actionOf, send, receive, offers, react, senderResults, effectLabelOf } from '../events/envelope.ts';
import { deliver, concludeAction, sharedHolderOf, MAX_REPLIES, CUT_WORDS } from '../events/exchange.ts';
import { runSelfTrack, selfRefusal } from '../events/self.ts';
import { releaseHolder } from '../events/bonds.ts';
import { settle } from '../events/settle.ts';
import { describeEntry, previewLines } from '../events/describe.ts';
import { describeMoment } from '../events/moments.ts';
import { sharedOf } from '../events/desk.ts';
import { requireEffect, isPipeline } from '../engine/effects.ts';
import { EngineError } from '../engine/errors.ts';
import { State } from './state.ts';
import { External, Pause } from './journal.ts';
import type { Journal, Question } from './journal.ts';
import type { Envelope, Offer, ReactionWindow, WorldContext } from '../events/envelope.ts';
import type { Seen } from '../events/exchange.ts';
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
}

export type ActOutcome =
  | { kind: 'done'; sheets: Sheet[]; log: string[]; journal: Journal; fresh: number[] }
  | { kind: 'paused'; sheets: Sheet[]; log: string[]; journal: Journal; fresh: number[]; question: Question };

export function settleLines(world: WorldContext, before: Sheet[], after: Sheet[], lines: string[]): Sheet[] {
  const done = settle(before, after, world);
  for (const entry of done.aftermath) {
    if (entry.kind === 'fired') { lines.push(describeMoment(world, entry, done.sheets)); continue; }
    const who = done.sheets.find(s => s.id === entry.sheetId)?.name ?? entry.sheetId;
    lines.push(`«${effectLabelOf(world.system, entry.effectId)}» спало с ${who}: держать стало нечем`);
  }
  return done.sheets;
}

const nameOf = (state: State, id: string): string => state.find(id)?.name ?? id;

export function act(world: ActWorld, intent: ActIntent): ActOutcome {
  const { system, compendium, clock } = world;
  const ext = new External(world.journal, world.die);
  const state = new State([...world.sheets], system, compendium, clock);
  const log: string[] = [];
  const base = (scope: string) => ({ system, compendium, clock, die: ext.dieAt(scope) });
  const shared = () => sharedOf(system, state.sheets);
  const targets = [...new Set(intent.toIds)];
  let budget = MAX_REPLIES;
  let replyCount = 0;
  let cut = false;

  const affordable = (envelope: Envelope, window: ReactionWindow, sheetId: string, results: Record<string, unknown>, emitted: EmittedEvent[], scope: string): Offer[] => {
    const offered = offers(envelope, window, { ...base(`${scope}?`), sheet: state.get(sheetId) }, results, emitted);
    return offered.filter(offer => {
      try {
        react([offer.id], envelope, window, { ...base(`${scope}?${offer.id}`), sheet: state.get(sheetId) }, results, emitted);
        return true;
      } catch (err) {
        if (err instanceof EngineError) return false;
        throw err;
      }
    });
  };

  const apply = (sheets: readonly Sheet[] | undefined): void => {
    for (const sheet of sheets ?? []) state.put(sheet);
  };

  const ask = (
    key: string, window: ReactionWindow, sheetId: string, envelope: Envelope,
    offered: Offer[], results: Record<string, unknown>, emitted: EmittedEvent[], preview: string[],
  ): { claims: string[]; replies: Envelope[] } => {
    const question: Question = {
      key, sheetId, window, label: envelope.reply ? envelope.label : '',
      offers: offered, results, preview,
    };
    const chosen = ext.ask(question);
    const asked = state.get(sheetId);
    const reacted = react(chosen, envelope, window, { ...base(`${key}!`), sheet: asked }, results, emitted);
    state.put(reacted.sheet);
    for (const report of reacted.reports) {
      log.push(describeEntry({ fromId: sheetId, toId: sheetId, report }, system, state.sheets));
    }
    if (!chosen.length) log.push(`${asked.name} пропускает реакцию`);
    return { claims: reacted.claims, replies: reacted.replies };
  };

  const answerAll = (queue: Envelope[], scope: string): void => {
    while (queue.length) {
      const reply = queue.shift()!;
      const target = state.find(String(reply.to));
      if (!target) continue;
      if (budget <= 0) { cut = true; queue.length = 0; return; }
      const at = `${scope}r${replyCount++}`;
      const dry = receive(reply, { ...base(at), sheet: target, shared: shared() });
      const before = affordable(reply, 'target', target.id, dry.results, dry.report.emitted, at);
      let claims: string[] = [];
      if (before.length) {
        const asked = ask(`${at}:target`, 'target', target.id, reply, before, dry.results, dry.report.emitted, previewLines(reply, system, dry));
        claims = asked.claims;
        queue.push(...asked.replies);
      }
      budget--;
      const back = receive(reply, {
        ...base(claims.length ? `${at}:c` : at), sheet: state.get(target.id), shared: shared(),
        ...(claims.length ? { claims } : {}),
      });
      state.put(back.sheet);
      apply(back.shared);
      log.push(describeEntry({ fromId: reply.from, toId: target.id, report: back.report }, system, state.sheets));
      queue.push(...back.replies);
      if (back.cut) cut = true;
      const after = affordable(reply, 'after', target.id, back.results, back.report.emitted, `${at}:after`);
      if (after.length) {
        queue.push(...ask(`${at}:after`, 'after', target.id, reply, after, back.results, back.report.emitted, []).replies);
      }
    }
  };

  try {
    const action = actionOf(intent.actionId, { system, compendium });
    const effect = requireEffect(system, action.effect, `действие «${action.label}»`);
    if (!isPipeline(effect)) {
      throw new EngineError(`действие «${action.label}» зовёт пассивный эффект «${effect.label || action.effect}» — его вешают, а не применяют`);
    }
    if (!state.find(intent.fromId)) throw new EngineError(`в комнате нет листа «${intent.fromId}»`);
    for (const id of targets) if (!state.find(id)) throw new EngineError(`в комнате нет листа «${id}»`);
    const inputs = intent.inputs && Object.keys(intent.inputs).length ? intent.inputs : undefined;

    const own = runSelfTrack(intent.actionId, state.get(intent.fromId), { ...base('self'), shared: shared(), ...(inputs ? { inputs } : {}) });
    const refused = selfRefusal(own, { system }, action.label);
    if (refused) throw new EngineError(refused);
    if (own.report) {
      state.put(own.sheet);
      apply(own.shared);
      if (own.report.changes.length || own.report.effects.length || own.report.removed.length) {
        log.push(describeEntry({ fromId: intent.fromId, toId: intent.fromId, report: own.report }, system, state.sheets));
      }
    }

    const holder = sharedHolderOf(system, action.effect);
    if (holder) {
      const released = releaseHolder(system, state.sheets, intent.fromId, holder);
      state.sheets = released.sheets;
      for (const broken of released.broken) {
        log.push(`«${effectLabelOf(system, broken.effectId)}» спало с ${nameOf(state, broken.sheetId)}: наложивший взялся за новое`);
      }
    }

    let claims = intent.edits ?? [];
    const pack = (round: number, kept?: Envelope['steps']): Envelope => send(intent.actionId, {
      ...base(`send:${round}`), sheet: state.get(intent.fromId), against: state.get(targets[0]!), claims, shared: shared(),
      ...(inputs ? { inputs } : {}),
      ...(kept ? { kept } : {}),
    });
    let envelope = pack(0);

    const seenBySender = senderResults(envelope);
    const senderOffers = affordable(envelope, 'sender', intent.fromId, seenBySender, [], 'sender');
    if (senderOffers.length) {
      const asked = ask('sender', 'sender', intent.fromId, envelope, senderOffers, seenBySender, [], previewLines(envelope, system, null));
      if (asked.claims.length) {
        claims = [...new Set([...claims, ...asked.claims])];
        envelope = pack(1, envelope.steps);
        log.push(`${nameOf(state, intent.fromId)}: бросок собран заново — выпавшее остаётся, новые кости добавлены`);
      }
    }

    const taken: Record<string, string[]> = {};
    const claimsFor = (id: string): string[] => [...new Set([...(intent.targetEdits ?? []), ...(taken[id] ?? [])])];
    const seen: Record<string, Seen> = {};

    for (const toId of targets) {
      let scope = `t:${toId}`;
      const dry = receive(envelope, { ...base(scope), sheet: state.get(toId), claims: claimsFor(toId), shared: shared() });
      const before = affordable(envelope, 'target', toId, dry.results, dry.report.emitted, scope);
      if (before.length) {
        const asked = ask(`target:${toId}`, 'target', toId, envelope, before, dry.results, dry.report.emitted, previewLines(envelope, system, dry));
        if (asked.claims.length) {
          taken[toId] = [...new Set([...(taken[toId] ?? []), ...asked.claims])];
          scope = `${scope}:c`;
          log.push(`${nameOf(state, toId)}: бросок пересчитан с заявленной правкой`);
        }
        answerAll(asked.replies, `${scope}>`);
      }
      const out = deliver({
        ...base(scope), sheets: state.sheets, envelope, fromId: intent.fromId, toId,
        claims: { target: claimsFor(toId) }, drain: false,
      });
      state.sheets = out.sheets;
      for (const entry of out.reports) log.push(describeEntry(entry, system, state.sheets));
      Object.assign(seen, out.seen ?? {});
      if (out.cut) cut = true;
      answerAll([...(out.replies ?? [])], `${scope}>`);
    }

    for (const toId of targets) {
      const here = seen[toId];
      if (!here || !state.find(toId)) continue;
      const after = affordable(envelope, 'after', toId, here.results, here.emitted, `after:${toId}`);
      if (after.length) {
        answerAll(ask(`after:${toId}`, 'after', toId, envelope, after, here.results, here.emitted, []).replies, `after:${toId}>`);
      }
    }

    const done = concludeAction({ ...base('done'), sheets: state.sheets, envelope, fromId: intent.fromId, toIds: targets, seen });
    state.sheets = done.sheets;
    for (const entry of done.reports) log.push(describeEntry(entry, system, state.sheets));
    if (cut) log.push(CUT_WORDS);

    const final = settleLines({ ...base('settle') }, world.sheets, state.sheets, log);
    return { kind: 'done', sheets: final, log, journal: ext.settled(), fresh: ext.fresh };
  } catch (err) {
    if (!(err instanceof Pause)) throw err;
    const shown = settleLines({ ...base('settle?') }, world.sheets, state.sheets, log);
    return { kind: 'paused', sheets: shown, log, journal: { ...world.journal }, fresh: ext.fresh, question: err.question };
  }
}
