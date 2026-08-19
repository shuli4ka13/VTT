import { send, receive } from './envelope.ts';
import type { Report } from './envelope.ts';
import type { System, Sheet, Compendium, Die } from '../model/types.ts';

export interface ExchangeArgs {
  system: System;
  compendium: Compendium;
  die: Die;
  sheets: Sheet[];
  actionId: string;
  fromId: string;
  toId: string;
}

export interface ExchangeEntry { fromId: string; toId: string; report: Report }

export interface ExchangeResult { sheets: Sheet[]; reports: ExchangeEntry[] }

export function exchange({
  system, compendium, die, sheets, actionId, fromId, toId,
}: ExchangeArgs): ExchangeResult {
  const find = (id: string): Sheet | null => sheets.find(s => s.id === id) || null;

  const from = find(fromId);
  const to = find(toId);
  if (!from) throw new Error(`не найден отправитель «${fromId}»`);
  if (!to) throw new Error(`не найдена цель «${toId}»`);

  const ctx = { system, compendium, die };
  const envelope = send(actionId, { ...ctx, sheet: from });

  let updated = [...sheets];
  const put = (sheet: Sheet): void => { updated = updated.map(s => (s.id === sheet.id ? sheet : s)); };
  const live = (id: string): Sheet | null => updated.find(s => s.id === id) || null;

  const main = receive(envelope, { ...ctx, sheet: to });
  put(main.sheet);
  const reports: ExchangeEntry[] = [{ fromId, toId, report: main.report }];

  for (const reply of main.replies) {
    const target = live(String(reply.to));
    if (!target) continue;
    const back = receive(reply, { ...ctx, sheet: target });
    put(back.sheet);
    reports.push({ fromId: reply.from, toId: String(reply.to), report: back.report });
  }

  return { sheets: updated, reports };
}
