import type { Die } from '../model/types.ts';
import type { Path, Window } from './path.ts';

export type { Window };

export interface Journal {
  dice: Record<string, number>;
  answers: Record<string, string[]>;
  ids: Record<string, string>;
}

export const emptyJournal = (): Journal => ({ dice: {}, answers: {}, ids: {} });

export type Mode = 'real' | 'trial' | 'preview';

export interface Offer { id: string; label: string; text?: string }

export const QUIET = '~quiet';

export interface TableRules { reactionRolls?: boolean; reactionUseful?: boolean; payment?: 'trust' | 'strict' }

export interface Question {
  key: string;
  sheetId: string;
  window: Window;
  label: string;
  text?: string;
  offers: Offer[];
  results: Record<string, unknown>;
  preview: string[];
  one?: boolean;
  mute?: boolean;
}

export class Pause {
  constructor(readonly question: Question) {}
}

export const average = (sides: number): number => Math.ceil((sides + 1) / 2);

export interface Source {
  die: Die;
  newId?: () => string;
}

export class External {
  readonly fresh: number[] = [];
  private readonly used = new Set<string>();
  private readonly journal: Journal;
  private counter = 0;

  constructor(journal: Journal, private readonly source: Source, readonly mode: Mode = 'real') {
    this.journal = { dice: { ...journal.dice }, answers: { ...journal.answers }, ids: { ...(journal.ids ?? {}) } };
  }

  dice(path: Path): Die {
    let n = 0;
    return (sides: number) => this.die(path.die(n++), sides);
  }

  private die(key: string, sides: number): number {
    this.used.add(key);
    const known = this.journal.dice[key];
    if (known !== undefined) return known;
    if (this.mode === 'preview') return average(sides);
    const value = this.source.die(sides);
    this.journal.dice[key] = value;
    this.fresh.push(value);
    return value;
  }

  peek(key: string): string[] | null {
    return this.journal.answers[key] ?? null;
  }

  ask(question: Question): { chosen: string[]; byPerson: boolean } {
    this.used.add(question.key);
    const known = this.journal.answers[question.key];
    if (known !== undefined) return { chosen: known, byPerson: true };
    if (this.mode !== 'real') return { chosen: [], byPerson: false };
    throw new Pause(question);
  }

  id(path: Path): string {
    const key = path.key;
    this.used.add(`id:${key}`);
    const known = this.journal.ids[key];
    if (known !== undefined) return known;
    const made = this.source.newId ? this.source.newId() : `i${++this.counter}`;
    this.journal.ids[key] = made;
    return made;
  }

  answered(key: string, chosen: string[]): Journal {
    return { ...this.snapshot(), answers: { ...this.journal.answers, [key]: chosen } };
  }

  snapshot(): Journal {
    return { dice: { ...this.journal.dice }, answers: { ...this.journal.answers }, ids: { ...this.journal.ids } };
  }

  settled(): Journal {
    const keep = <T>(all: Record<string, T>, prefix = ''): Record<string, T> =>
      Object.fromEntries(Object.entries(all).filter(([key]) => this.used.has(`${prefix}${key}`)));
    return { dice: keep(this.journal.dice), answers: keep(this.journal.answers), ids: keep(this.journal.ids, 'id:') };
  }
}
