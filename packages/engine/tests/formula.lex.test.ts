import { group, test, eq, deepEq, throws } from './harness.ts';
import { lex } from '../src/formula/lex.ts';
import { FormulaSyntaxError } from '../src/formula/errors.ts';
import { RU_WORDS } from '../src/formula/words.ts';

const shape = (src, words?) => lex(src, words).filter(t => t.type !== 'eof').map(t => `${t.type}:${t.value}`);

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

  test('«если» — обычное имя функции, а знаки «?» и «:» формулам не нужны', () => {
    deepEq(shape('if(1, 2, 3)'), ['ident:if', 'lparen:(', 'number:1', 'comma:,', 'number:2', 'comma:,', 'number:3', 'rparen:)']);
    throws(() => lex('1 ? 2 : 3'), FormulaSyntaxError);
  });

  test('имя из двух слов читается целиком только перед скобкой', () => {
    deepEq(shape('округлить вниз (1)', RU_WORDS), ['ident:округлить вниз', 'lparen:(', 'number:1', 'rparen:)']);
    deepEq(shape('округлить(1)', RU_WORDS), ['ident:округлить', 'lparen:(', 'number:1', 'rparen:)']);
    deepEq(shape('округлить вниз', RU_WORDS), ['ident:округлить', 'ident:вниз']);
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

group('лексер: запись кости без кавычек', () => {
  test('кость — текст с признаком кости, счёт по умолчанию 1', () => {
    deepEq(shape('d4'), ['text:1d4']);
    deepEq(shape('1d4'), ['text:1d4']);
    deepEq(shape('2d6'), ['text:2d6']);
    eq(lex('2d6')[0].dice, true);
    eq(lex('2d6')[0].text, '2d6');
    deepEq(shape('к4', RU_WORDS), ['text:1d4']);
    deepEq(shape('2d6', RU_WORDS), ['text:2d6']);
    deepEq(shape('д6', RU_WORDS), ['text:1d6']);
    deepEq(shape('к4'), ['ident:к4']);
  });

  test('кость внутри «кинуть»', () => {
    deepEq(shape('roll(d4) + 1'), ['ident:roll', 'lparen:(', 'text:1d4', 'rparen:)', 'op:+', 'number:1']);
  });

  test('не кость: буква или точка после цифр, дробный счёт, ссылка, кавычки, «да»', () => {
    deepEq(shape('d6d'), ['ident:d6d']);
    deepEq(shape('d4.5'), ['ident:d4.5']);
    deepEq(shape('1.5'), ['number:1.5']);
    deepEq(shape('@d4'), ['ref:d4']);
    eq(lex('"1d4"')[0].dice, undefined);
    deepEq(shape('true'), ['ident:true']);
    deepEq(shape('да', RU_WORDS), ['ident:да']);
  });
});
