import { group, test, eq, deepEq, throws } from './harness.ts';
import { lex } from '../src/formula/lex.ts';
import { FormulaSyntaxError } from '../src/formula/errors.ts';

// Компактный вид потока токенов: "тип:значение", eof отброшен.
const shape = src => lex(src).filter(t => t.type !== 'eof').map(t => `${t.type}:${t.value}`);

group('лексер', () => {
  test('целое число', () => {
    deepEq(shape('42'), ['number:42']);
  });

  test('десятичная дробь', () => {
    deepEq(shape('1.5'), ['number:1.5']);
  });

  test('арифметические операторы', () => {
    deepEq(shape('1 + 2 - 3 * 4 / 5'),
      ['number:1', 'op:+', 'number:2', 'op:-', 'number:3', 'op:*', 'number:4', 'op:/', 'number:5']);
  });

  test('ссылка на тег теряет решётку в значении, но хранит её в тексте', () => {
    const [t] = lex('#str_mod');
    eq(t.type, 'ref');
    eq(t.value, 'str_mod');
    eq(t.text, '#str_mod');
  });

  test('тег может быть не на латинице — автор системы пишет на своём языке', () => {
    const [t] = lex('#крутость');
    eq(t.type, 'ref');
    eq(t.value, 'крутость');
  });

  test('вызов функции', () => {
    deepEq(shape('floor(1.5)'), ['ident:floor', 'lparen:(', 'number:1.5', 'rparen:)']);
  });

  test('запятая между аргументами', () => {
    deepEq(shape('max(1, 2)'), ['ident:max', 'lparen:(', 'number:1', 'comma:,', 'number:2', 'rparen:)']);
  });

  test('двухсимвольные сравнения не распадаются на одиночные', () => {
    deepEq(shape('1 >= 2'), ['number:1', 'op:>=', 'number:2']);
    deepEq(shape('1 <= 2'), ['number:1', 'op:<=', 'number:2']);
    deepEq(shape('1 == 2'), ['number:1', 'op:==', 'number:2']);
    deepEq(shape('1 != 2'), ['number:1', 'op:!=', 'number:2']);
  });

  test('одиночные сравнения', () => {
    deepEq(shape('1 < 2'), ['number:1', 'op:<', 'number:2']);
    deepEq(shape('1 > 2'), ['number:1', 'op:>', 'number:2']);
  });

  test('тернарный оператор', () => {
    deepEq(shape('1 ? 2 : 3'),
      ['number:1', 'question:?', 'number:2', 'colon::', 'number:3']);
  });

  test('позиция токена указывает на начало в исходной строке', () => {
    const tokens = lex('12 + #str');
    eq(tokens[0].pos, 0, 'число');
    eq(tokens[1].pos, 3, 'плюс');
    eq(tokens[2].pos, 5, 'ссылка');
  });

  test('поток всегда закрыт токеном eof в конце строки', () => {
    const tokens = lex('7');
    const last = tokens[tokens.length - 1];
    eq(last.type, 'eof');
    eq(last.pos, 1);
  });

  test('пустая строка даёт только eof', () => {
    deepEq(lex('').map(t => t.type), ['eof']);
  });

  test('неизвестный символ — синтаксическая ошибка с позицией', () => {
    const err = throws(() => lex('1 $ 2'), FormulaSyntaxError);
    eq(err.pos, 2);
  });

  test('решётка без имени тега — синтаксическая ошибка', () => {
    throws(() => lex('#'), FormulaSyntaxError);
    throws(() => lex('# + 1'), FormulaSyntaxError);
  });

  test('одиночный восклицательный знак не является оператором', () => {
    throws(() => lex('!1'), FormulaSyntaxError);
  });
});
