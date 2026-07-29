// Публичный интерфейс языка формул. Всё остальное в src/formula/ — внутренности.
//
//   compile(source) -> Formula
//     Formula = {
//       source: string,                     исходная строка как её ввёл пользователь
//       ast: Node,                          разобранное дерево
//       deps: string[],                     теги, на которые ссылается формула
//       evaluate(resolve) -> number|boolean  вычислить, взяв значения тегов через resolve
//     }
//     Бросает FormulaSyntaxError, если строка не разбирается.
//
//   resolve: (tag: string) -> number|boolean
//     Поставляется вызывающим. Именно здесь движок вешает мемоизацию и ловлю циклов.
//     Волен бросать — ошибка пройдёт наружу как есть.
//
// Разбор кэшируется по исходной строке: одна и та же формула у двух чарников
// разбирается один раз.

import { parse } from './parse.js';
import { dependencies } from './deps.js';
import { evaluate } from './evaluate.js';

export { FormulaError, FormulaSyntaxError, FormulaRuntimeError } from './errors.js';
export { FUNCTION_NAMES } from './evaluate.js';
export { lex } from './lex.js';

const cache = new Map();

export function compile(source) {
  const key = String(source);
  if (cache.has(key)) return cache.get(key);

  const ast = parse(key);
  const formula = Object.freeze({
    source: key,
    ast,
    deps: Object.freeze(dependencies(ast)),
    evaluate: resolve => evaluate(ast, resolve),
  });

  cache.set(key, formula);
  return formula;
}
