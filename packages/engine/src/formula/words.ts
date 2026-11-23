import { lex } from './lex.ts';

export type FunctionId = 'floor' | 'ceil' | 'min' | 'max' | 'sum' | 'count' | 'rows' | 'has' | 'first' | 'empty' | 'table' | 'die' | 'dicemax' | 'roll';

export interface FormulaWords {
  and: string;
  or: string;
  not: string;
  yes: string;
  no: string;
  if: string;
  functions: Record<FunctionId, string>;
  die: string;
  dieLetters: string;
}

export const NEUTRAL_WORDS: FormulaWords = {
  and: 'and', or: 'or', not: 'not', yes: 'true', no: 'false', if: 'if',
  functions: {
    floor: 'floor', ceil: 'ceil', min: 'min', max: 'max', sum: 'sum', count: 'count', rows: 'rows', has: 'has',
    first: 'first', empty: 'empty', table: 'table', die: 'die', dicemax: 'dicemax', roll: 'roll',
  },
  die: 'd', dieLetters: 'd',
};

export const RU_WORDS: FormulaWords = {
  and: 'и', or: 'или', not: 'не', yes: 'да', no: 'нет', if: 'если',
  functions: {
    floor: 'округлить вниз', ceil: 'округлить вверх', min: 'меньшее из', max: 'большее из', sum: 'сумма', count: 'сколько',
    rows: 'строки', has: 'есть', first: 'первый', empty: 'пусто', table: 'таблица', die: 'кость', dicemax: 'максимум костей', roll: 'кинуть',
  },
  die: 'к', dieLetters: 'dдк',
};

export const FORMULA_WORDS: Record<string, FormulaWords> = { en: NEUTRAL_WORDS, ru: RU_WORDS };

export const wordsOf = (lang: string | undefined): FormulaWords => FORMULA_WORDS[lang ?? ''] ?? NEUTRAL_WORDS;

const PLAIN = ['and', 'or', 'not', 'yes', 'no'] as const;

const fold = (text: string): string => text.toLowerCase();

function plainWord(words: FormulaWords, text: string): (typeof PLAIN)[number] | null {
  return PLAIN.find(key => fold(words[key]) === fold(text)) ?? null;
}

function callWord(words: FormulaWords, text: string): 'if' | FunctionId | null {
  if (fold(words.if) === fold(text)) return 'if';
  return (Object.keys(words.functions) as FunctionId[]).find(id => fold(words.functions[id]) === fold(text)) ?? null;
}

const DICE_INSIDE = (letters: string): RegExp => new RegExp(`^(\\s*\\d*\\s*)[${letters}](\\s*\\d+\\s*)$`, 'iu');

export function diceText(value: string, to: FormulaWords, from: FormulaWords = NEUTRAL_WORDS): string {
  const found = DICE_INSIDE(from.dieLetters + to.dieLetters).exec(value);
  return found ? `${found[1]}${to.die}${found[2]}` : value;
}

export function translateFormula(source: string, from: FormulaWords, to: FormulaWords): string {
  if (from === to) return source;
  let tokens;
  try { tokens = lex(source, from); } catch { return source; }
  let out = '';
  let at = 0;
  tokens.forEach((token, index) => {
    if (token.type === 'eof') return;
    let text = token.text;
    if (token.type === 'ident') {
      const plain = plainWord(from, token.text);
      const call = tokens[index + 1]?.type === 'lparen' ? callWord(from, token.text) : null;
      if (call) text = call === 'if' ? to.if : to.functions[call];
      else if (plain) text = to[plain];
    } else if (token.type === 'text' && token.dice) text = diceText(token.text, to, from);
    else if (token.type === 'text') {
      const quote = token.text[0]!;
      const inner = token.text.slice(1, -1);
      const turned = diceText(inner, to, from);
      if (turned !== inner) text = `${quote}${turned}${quote}`;
    }
    out += source.slice(at, token.pos) + text;
    at = token.pos + token.text.length;
  });
  return out + source.slice(at);
}
