import { tr } from '../words/tongue.ts';
export class FormulaError extends Error {
  readonly pos: number | undefined;
  readonly raw: string;

  constructor(message: string, pos?: number) {
    super(pos === undefined ? message : tr`${message} (позиция ${pos})`);
    this.name = new.target.name;
    this.pos = pos;
    this.raw = message;
  }
}

export class FormulaSyntaxError extends FormulaError {}

export class FormulaRuntimeError extends FormulaError {}
