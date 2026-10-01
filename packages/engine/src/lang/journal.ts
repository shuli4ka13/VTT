import type { Die } from '../model/types.ts';

export interface Journal {
  dice: Record<string, number>;
  answers: Record<string, string[]>;
}

export const emptyJournal = (): Journal => ({ dice: {}, answers: {} });

export interface Question {
  key: string;
  sheetId: string;
  window: 'target' | 'after' | 'seen';
  label: string;
  offers: { id: string; label: string; cost?: string }[];
  results: Record<string, unknown>;
  preview: string[];
}

export class Pause {
  constructor(readonly question: Question) {}
}

export class External {
  readonly fresh: number[] = [];
  readonly used = new Set<string>();

  constructor(private readonly journal: Journal, private readonly roll: Die, readonly declineAll = false) {}

  dieAt(scope: string): Die {
    let n = 0;
    return (sides: number) => {
      const key = `${scope}#${n++}`;
      this.used.add(key);
      const known = this.journal.dice[key];
      if (known !== undefined) return known;
      const value = this.roll(sides);
      this.journal.dice[key] = value;
      this.fresh.push(value);
      return value;
    };
  }

  peek(key: string): string[] | null {
    return this.journal.answers[key] ?? null;
  }

  ask(question: Question): string[] {
    this.used.add(question.key);
    const known = this.journal.answers[question.key];
    if (known !== undefined) return known;
    if (this.declineAll) {
      this.journal.answers[question.key] = [];
      return [];
    }
    throw new Pause(question);
  }

  settled(): Journal {
    const dice = Object.fromEntries(Object.entries(this.journal.dice).filter(([key]) => this.used.has(key)));
    const answers = Object.fromEntries(Object.entries(this.journal.answers).filter(([key]) => this.used.has(key)));
    return { dice, answers };
  }
}
