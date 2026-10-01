import { FormulaError } from '../formula/errors.ts';

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnknownTagError extends EngineError {
  readonly tag: string;
  readonly fromTag: string | null;

  constructor(tag: string, fromTag?: string | null) {
    super(fromTag
      ? `система не объявляет тег «${tag}» — на него ссылается поле «${fromTag}»`
      : `система не объявляет тег «${tag}»`);
    this.tag = tag;
    this.fromTag = fromTag ?? null;
  }
}

export class CycleError extends EngineError {
  readonly path: string[];

  constructor(path: string[]) {
    super(`циклическая зависимость формул: ${path.join(' → ')}`);
    this.path = path;
  }
}

export class TableError extends EngineError {}

export const isRuleError = (err: unknown): boolean => err instanceof EngineError || err instanceof FormulaError;
