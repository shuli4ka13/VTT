import { sharedOf } from './desk.ts';
import { send, receive, fireOutgoing, conclude } from './envelope.ts';
import { runSelfTrack, selfRefusal } from './self.ts';
import { holderOf, releaseHolder } from './bonds.ts';
import { settle } from './settle.ts';
import { EngineError } from '../engine/errors.ts';
import type { Report, Envelope } from './envelope.ts';
import type { System, Sheet, Compendium, Die } from '../model/types.ts';
import type { Clock } from '../engine/clock.ts';
import type { EmittedEvent } from '../engine/rule.ts';

export interface WorldArgs {
  system: System;
  compendium: Compendium;
  die: Die;
  sheets: Sheet[];

  clock?: Clock | null;
}

export interface ExchangeArgs extends WorldArgs {
  actionId: string;
  fromId: string;
  toId: string;

  inputs?: Record<string, number | string>;

  claims?: { source?: string[]; target?: string[] };
}

export interface DeliverArgs extends WorldArgs {
  envelope: Envelope;
  fromId: string;
  toId: string;

  drain?: boolean;

  claims?: { target?: string[] };
}

export interface ExchangeEntry { fromId: string; toId: string; report: Report }

export interface Seen { results: Record<string, unknown>; emitted: EmittedEvent[] }

export interface ExchangeResult {
  sheets: Sheet[];
  reports: ExchangeEntry[];

  seen?: Record<string, Seen>;

  cut?: boolean;

  replies?: Envelope[];
}

export { MAX_REPLIES, CUT_WORDS } from '../lang/limits.ts';
import { MAX_REPLIES } from '../lang/limits.ts';

export function deliverReplies({
  system, compendium, die, clock, sheets, replies, budget = MAX_REPLIES,
}: WorldArgs & { replies: Envelope[]; budget?: number }): ExchangeResult & { budget: number } {
  let updated = sheets;
  const reports: ExchangeEntry[] = [];
  const queue = [...replies];
  let left = budget;
  let cut = false;
  while (queue.length) {
    if (left <= 0) { cut = true; break; }
    const reply = queue.shift()!;
    const target = updated.find(s => s.id === String(reply.to));
    if (!target) continue;
    left--;
    const back = receive(reply, { system, compendium, die, clock, sheet: target, shared: sharedOf(system, updated) });
    const changed = new Map([[back.sheet.id, back.sheet], ...(back.shared ?? []).map(s => [s.id, s] as const)]);
    updated = updated.map(s => changed.get(s.id) ?? s);
    reports.push({ fromId: reply.from, toId: String(reply.to), report: back.report });
    queue.push(...back.replies);
    if (back.cut) cut = true;
  }
  return { sheets: updated, reports, budget: left, ...(cut ? { cut } : {}) };
}

export { sharedHolderOf } from './bonds.ts';
import { sharedHolderOf } from './bonds.ts';

const finder = (sheets: Sheet[]) => (id: string): Sheet | null => sheets.find(s => s.id === id) || null;

export function deliver({
  system, compendium, die, clock, sheets, envelope, fromId, toId, claims, drain = true,
}: DeliverArgs): ExchangeResult {
  const ctx = { system, compendium, die, clock };
  const held: Envelope[] = [];
  let updated = [...sheets];
  const put = (sheet: Sheet): void => { updated = updated.map(s => (s.id === sheet.id ? sheet : s)); };
  const live = (id: string): Sheet | null => updated.find(s => s.id === id) || null;
  const common = (): Sheet[] => sharedOf(system, updated);

  const to = live(toId);
  if (!to) throw new Error(`не найдена цель «${toId}»`);

  const main = receive(envelope, { ...ctx, sheet: to, claims: claims?.target, shared: common() });
  put(main.sheet);
  for (const s of main.shared ?? []) put(s);
  const reports: ExchangeEntry[] = [{ fromId, toId, report: main.report }];
  const seen: Record<string, Seen> = { [toId]: { results: main.results, emitted: main.report.emitted } };

  let cut = main.cut === true;
  let budget = MAX_REPLIES;
  const answer = (replies: Envelope[]): void => {
    if (!drain) { held.push(...replies); return; }
    const out = deliverReplies({ ...ctx, sheets: updated, replies, budget });
    updated = out.sheets;
    budget = out.budget;
    reports.push(...out.reports);
    if (out.cut) cut = true;
  };
  answer(main.replies);

  const holder = holderOf(envelope.effect, system.effects[envelope.effect]);
  if (holder && !envelope.reply) {
    const caster = live(fromId);
    if (caster && !(caster.effects ?? []).some(entry => entry.effectId === holder)) {
      put({ ...caster, effects: [...(caster.effects ?? []), { effectId: holder }] });
    }
  }

  const sender = live(fromId);
  if (sender && !envelope.reply) {
    const out = fireOutgoing(envelope, { results: main.results, emitted: main.report.emitted }, { sheet: sender, targetId: toId }, { ...ctx, shared: common() });
    put(out.sheet);
    for (const s of out.shared ?? []) put(s);
    for (const report of out.reactions) reports.push({ fromId, toId: fromId, report });
    answer(out.replies);
  }

  return { sheets: updated, reports, seen, ...(cut ? { cut } : {}), ...(drain ? {} : { replies: held }) };
}

export function concludeAction({
  system, compendium, die, clock, sheets, envelope, fromId, toIds, seen,
}: WorldArgs & { envelope: Envelope; fromId: string; toIds: string[]; seen: Record<string, Seen> }): ExchangeResult {
  const sender = sheets.find(s => s.id === fromId);
  if (!sender || envelope.reply) return { sheets, reports: [] };
  const targets = [...new Set(toIds)].filter(id => seen[id]).map(id => ({ id, ...seen[id]! }));
  const out = conclude(envelope, targets, sender, { system, compendium, die, clock, shared: sharedOf(system, sheets) });
  const changed = new Map([[out.sheet.id, out.sheet], ...(out.shared ?? []).map(s => [s.id, s] as const)]);
  return {
    sheets: sheets.map(s => changed.get(s.id) ?? s),
    reports: out.reactions.map(report => ({ fromId, toId: fromId, report })),
  };
}

export interface ManyArgs extends WorldArgs {
  envelope: Envelope;
  fromId: string;
  toIds: string[];

  claims?: { target?: string[] };
}

export function deliverMany({
  system, compendium, die, clock, sheets, envelope, fromId, toIds, claims,
}: ManyArgs): ExchangeResult {
  let updated = sheets;
  const reports: ExchangeEntry[] = [];
  const seen: Record<string, Seen> = {};

  const unique = [...new Set(toIds)];
  let cut = false;
  for (const toId of unique) {
    const out = deliver({
      system, compendium, die, clock, sheets: updated, envelope, fromId, toId, claims,
    });
    updated = out.sheets;
    reports.push(...out.reports);
    Object.assign(seen, out.seen ?? {});
    if (out.cut) cut = true;
  }

  const done = concludeAction({ system, compendium, die, clock, sheets: updated, envelope, fromId, toIds: unique, seen });
  return { sheets: done.sheets, reports: [...reports, ...done.reports], seen, ...(cut ? { cut } : {}) };
}

export function exchange({
  system, compendium, die, sheets, actionId, fromId, toId, claims, clock, inputs,
}: ExchangeArgs): ExchangeResult {
  const find = finder(sheets);
  const from = find(fromId);
  const to = find(toId);
  if (!from) throw new Error(`не найден отправитель «${fromId}»`);
  if (!to) throw new Error(`не найдена цель «${toId}»`);

  const common = sharedOf(system, sheets);
  const envelope = send(actionId, { system, compendium, die, clock, shared: common, sheet: from, against: to, claims: claims?.source, ...(inputs ? { inputs } : {}) });

  const own = runSelfTrack(actionId, from, { system, compendium, die, clock, shared: common, ...(inputs ? { inputs } : {}) });
  const refused = selfRefusal(own, { system }, envelope.label);
  if (refused) throw new EngineError(refused);
  const afterOwn = own.report
    ? sheets.map(s => (s.id === own.sheet.id ? own.sheet : own.shared?.find(u => u.id === s.id) ?? s))
    : sheets;
  const shared = sharedHolderOf(system, envelope.effect);
  const started = shared ? releaseHolder(system, afterOwn, fromId, shared).sheets : afterOwn;

  const delivered = deliver({
    system, compendium, die, clock, sheets: started, envelope, fromId, toId,
    claims: { target: claims?.target },
  });
  const done = concludeAction({ system, compendium, die, clock, sheets: delivered.sheets, envelope, fromId, toIds: [toId], seen: delivered.seen ?? {} });
  const out = { ...delivered, sheets: done.sheets, reports: [...delivered.reports, ...done.reports] };
  const settled = settle(sheets, out.sheets, { system, compendium, die, clock });
  const hooks = settled.aftermath.flatMap(entry => (entry.kind === 'fired'
    ? [{ fromId: entry.sheetId, toId: entry.sheetId, report: entry.report }] : []));
  return {
    ...out,
    sheets: settled.sheets,
    reports: [...(own.report ? [{ fromId, toId: fromId, report: own.report }] : []), ...out.reports, ...hooks],
  };
}
