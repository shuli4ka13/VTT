// Ошибки языка формул. Отдельный модуль, чтобы и лексер, и парсер, и интерпретатор
// бросали один опознаваемый род ошибок, а вызывающий код мог отличить их от своих.

export class FormulaError extends Error {
  readonly pos: number | undefined;
  readonly raw: string;

  constructor(message: string, pos?: number) {
    super(pos === undefined ? message : `${message} (позиция ${pos})`);
    this.name = new.target.name;
    this.pos = pos;
    this.raw = message;
  }
}

// Строка не разобралась: неизвестный символ, незакрытая скобка, оборванное выражение.
export class FormulaSyntaxError extends FormulaError {}

// Строка разобралась, но вычислить не удалось: неизвестная функция, неверный тип, деление на ноль.
export class FormulaRuntimeError extends FormulaError {}
