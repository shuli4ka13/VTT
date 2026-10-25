import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import type { Journal, Question } from '../src/core/external.ts';
import type { Entry, Report } from '../src/core/log.ts';
import type { Clock } from '../src/engine/clock.ts';
import type { System, Sheet, Compendium, Die } from '../src/model/types.ts';

export interface PlayArgs {
  system: System;
  compendium: Compendium;
  die: Die;
  sheets: Sheet[];
  actionId: string;
  fromId: string;
  toId?: string;
  toIds?: string[];
  clock?: Clock | null;
  inputs?: Record<string, number | string>;
  claims?: { source?: string[]; target?: string[] };
  answer?: (question: Question) => string[];
  newId?: () => string;
}

export interface Played {
  sheets: Sheet[];
  reports: { fromId: string; toId: string; report: Report }[];
  log: string[];
  questions: Question[];
}

export function exchange(args: PlayArgs): Played {
  const toIds = args.toIds ?? (args.toId ? [args.toId] : []);
  let journal: Journal = emptyJournal();
  const questions: Question[] = [];
  for (let round = 0; round < 64; round++) {
    const out = act({
      system: args.system, compendium: args.compendium, clock: args.clock ?? null, sheets: args.sheets,
      die: args.die, journal, declineAll: !args.answer, ...(args.newId ? { newId: args.newId } : {}),
    }, {
      actionId: args.actionId, fromId: args.fromId, toIds,
      ...(args.inputs ? { inputs: args.inputs } : {}),
      ...(args.claims ? { claims: {
        ...(args.claims.source?.length ? { [args.fromId]: args.claims.source } : {}),
        ...(args.claims.target?.length && toIds[0] ? { [toIds[0]]: args.claims.target } : {}),
      } } : {}),
    });
    if (out.kind === 'done') {
      const reports = out.entries.filter((entry): entry is Exclude<Entry, { text: string }> => !('text' in entry));
      return { sheets: out.sheets, reports, log: out.log, questions };
    }
    questions.push(out.question);
    journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: args.answer!(out.question) } };
  }
  throw new Error('действие задаёт вопросы без конца');
}

export const deliverMany = (args: Omit<PlayArgs, 'actionId'> & { actionId: string; toIds: string[] }): Played => exchange(args);
