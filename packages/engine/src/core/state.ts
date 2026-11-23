import { EngineError, NO_SHEET } from '../engine/errors.ts';
import type { Sheet } from '../model/types.ts';
import type { Entry } from './log.ts';
import { tr } from '../words/tongue.ts';

interface Saved {
  sheets: readonly Sheet[];
  memo: Readonly<Record<string, unknown>>;
  budget: number;
  log: number;
}

export class State {
  private sheetList: readonly Sheet[];
  private memoCells: Readonly<Record<string, unknown>> = {};
  private stack: Saved[] = [];
  readonly log: Entry[] = [];
  budget: number;

  constructor(sheets: readonly Sheet[], budget: number) {
    this.sheetList = sheets;
    this.budget = budget;
  }

  get sheets(): readonly Sheet[] { return this.sheetList; }

  find(id: string): Sheet | null {
    return this.sheetList.find(sheet => sheet.id === id) ?? null;
  }

  get(id: string): Sheet {
    const sheet = this.find(id);
    if (!sheet) throw new EngineError(tr`в комнате нет листа «${id}»`, NO_SHEET);
    return sheet;
  }

  put(sheet: Sheet): void {
    const at = this.sheetList.findIndex(s => s.id === sheet.id);
    this.sheetList = at < 0 ? [...this.sheetList, sheet] : this.sheetList.map((s, i) => (i === at ? sheet : s));
  }

  drop(id: string): void {
    this.sheetList = this.sheetList.filter(sheet => sheet.id !== id);
  }

  replace(sheets: readonly Sheet[]): void {
    this.sheetList = sheets;
  }

  memo(key: string): unknown {
    return this.memoCells[key];
  }

  remember(key: string, value: unknown): void {
    this.memoCells = { ...this.memoCells, [key]: value };
  }

  write(...entries: Entry[]): void {
    this.log.push(...entries);
  }

  get depth(): number { return this.stack.length; }

  begin(): void {
    this.stack.push({ sheets: this.sheetList, memo: this.memoCells, budget: this.budget, log: this.log.length });
  }

  commit(): void {
    if (!this.stack.pop()) throw new Error(tr`commit без begin`);
  }

  rollback(): void {
    const saved = this.stack.pop();
    if (!saved) throw new Error(tr`rollback без begin`);
    this.sheetList = saved.sheets;
    this.memoCells = saved.memo;
    this.budget = saved.budget;
    this.log.length = saved.log;
  }

  atomic<T>(work: () => T, keep: (result: T) => boolean = () => true): T {
    this.begin();
    let result: T;
    try {
      result = work();
    } catch (err) {
      this.rollback();
      throw err;
    }
    if (keep(result)) this.commit();
    else this.rollback();
    return result;
  }

  probe<T>(work: () => T): T {
    this.begin();
    try {
      return work();
    } finally {
      this.rollback();
    }
  }
}
