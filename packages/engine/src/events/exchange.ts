import { deskFor } from './desk.ts';
import { send, receive, fireOutgoing } from './envelope.ts';
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

  claims?: { target?: string[] };
}

export interface ExchangeEntry { fromId: string; toId: string; report: Report }

export interface Seen { results: Record<string, unknown>; emitted: EmittedEvent[] }

export interface ExchangeResult {
  sheets: Sheet[];
  reports: ExchangeEntry[];

  seen?: Record<string, Seen>;
}

export const sharedHolderOf = (system: System, effectId: string): string | null => {
  const bond = system.effects[effectId]?.bond;
  return typeof bond === 'string' ? bond : null;
};

const finder = (sheets: Sheet[]) => (id: string): Sheet | null => sheets.find(s => s.id === id) || null;

export function deliver({
  system, compendium, die, clock, sheets, envelope, fromId, toId, claims,
}: DeliverArgs): ExchangeResult {
  const ctx = { system, compendium, die, clock };
  let updated = [...sheets];
  const put = (sheet: Sheet): void => { updated = updated.map(s => (s.id === sheet.id ? sheet : s)); };
  const live = (id: string): Sheet | null => updated.find(s => s.id === id) || null;
  const desk = (): Sheet | null => deskFor(system, updated);

  const to = live(toId);
  if (!to) throw new Error(`не найдена цель «${toId}»`);

  const main = receive(envelope, { ...ctx, sheet: to, claims: claims?.target, desk: desk() });
  put(main.sheet);
  if (main.desk) put(main.desk);
  const reports: ExchangeEntry[] = [{ fromId, toId, report: main.report }];
  const seen: Record<string, Seen> = { [toId]: { results: main.results, emitted: main.report.emitted } };

  for (const reply of main.replies) {
    const target = live(String(reply.to));
    if (!target) continue;
    const back = receive(reply, { ...ctx, sheet: target, desk: desk() });
    put(back.sheet);
    if (back.desk) put(back.desk);
    reports.push({ fromId: reply.from, toId: String(reply.to), report: back.report });
  }

  const holder = holderOf(envelope.effect, system.effects[envelope.effect]);
  if (holder && !envelope.reply) {
    const caster = live(fromId);
    if (caster && !(caster.effects ?? []).some(entry => entry.effectId === holder)) {
      put({ ...caster, effects: [...(caster.effects ?? []), { effectId: holder }] });
    }
  }

  const sender = live(fromId);
  if (sender && !envelope.reply) {
    const out = fireOutgoing(envelope, { results: main.results, emitted: main.report.emitted }, { sheet: sender, targetId: toId }, ctx);
    put(out.sheet);
    for (const report of out.reactions) reports.push({ fromId, toId: fromId, report });
    for (const reply of out.replies) {
      const target = live(String(reply.to));
      if (!target) continue;
      const back = receive(reply, { ...ctx, sheet: target, desk: desk() });
      put(back.sheet);
      if (back.desk) put(back.desk);
      reports.push({ fromId: reply.from, toId: String(reply.to), report: back.report });
    }
  }

  return { sheets: updated, reports, seen };
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

  for (const toId of toIds) {
    const out = deliver({
      system, compendium, die, clock, sheets: updated, envelope, fromId, toId, claims,
    });
    updated = out.sheets;
    reports.push(...out.reports);
    Object.assign(seen, out.seen ?? {});
  }

  return { sheets: updated, reports, seen };
}

export function exchange({
  system, compendium, die, sheets, actionId, fromId, toId, claims, clock, inputs,
}: ExchangeArgs): ExchangeResult {
  const find = finder(sheets);
  const from = find(fromId);
  const to = find(toId);
  if (!from) throw new Error(`не найден отправитель «${fromId}»`);
  if (!to) throw new Error(`не найдена цель «${toId}»`);

  const desk = deskFor(system, sheets);
  const envelope = send(actionId, { system, compendium, die, clock, desk, sheet: from, against: to, claims: claims?.source, ...(inputs ? { inputs } : {}) });

  const own = runSelfTrack(actionId, from, { system, compendium, die, clock, desk, ...(inputs ? { inputs } : {}) });
  const refused = selfRefusal(own, { system }, envelope.label);
  if (refused) throw new EngineError(refused);
  const afterOwn = own.report
    ? sheets.map(s => (s.id === own.sheet.id ? own.sheet : own.desk && s.id === own.desk.id ? own.desk : s))
    : sheets;
  const shared = sharedHolderOf(system, envelope.effect);
  const started = shared ? releaseHolder(system, afterOwn, fromId, shared).sheets : afterOwn;

  const out = deliver({
    system, compendium, die, clock, sheets: started, envelope, fromId, toId,
    claims: { target: claims?.target },
  });
  const settled = settle(sheets, out.sheets, { system, compendium, die, clock });
  const hooks = settled.aftermath.flatMap(entry => (entry.kind === 'fired'
    ? [{ fromId: entry.sheetId, toId: entry.sheetId, report: entry.report }] : []));
  return {
    ...out,
    sheets: settled.sheets,
    reports: [...(own.report ? [{ fromId, toId: fromId, report: own.report }] : []), ...out.reports, ...hooks],
  };
}
