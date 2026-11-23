import { FormulaError } from '../formula/errors.ts';
import { tr } from '../words/tongue.ts';

export const NO_SHEET = 'no-sheet';

export class EngineError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = new.target.name;
    if (code) this.code = code;
  }
}

export class UnknownTagError extends EngineError {
  readonly tag: string;
  readonly fromTag: string | null;

  constructor(tag: string, fromTag?: string | null) {
    super(fromTag
      ? tr`система не объявляет тег «${tag}» — на него ссылается поле «${fromTag}»`
      : tr`система не объявляет тег «${tag}»`);
    this.tag = tag;
    this.fromTag = fromTag ?? null;
  }
}

export class CycleError extends EngineError {
  readonly path: string[];

  constructor(path: string[]) {
    super(tr`циклическая зависимость формул: ${path.join(' → ')}`);
    this.path = path;
  }
}

export class TableError extends EngineError {}

export class ActRefused extends EngineError {
  readonly why: string;

  constructor(label: string, why: string) {
    super(tr`«${label}» не состоялось: ${why}`);
    this.why = why;
  }
}

export const isRuleError = (err: unknown): boolean => err instanceof EngineError || err instanceof FormulaError;
