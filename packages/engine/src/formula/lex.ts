import { FormulaSyntaxError } from './errors.ts';
import { bareDiceAt, dice } from '../words/glossary.ts';
import { tr } from '../words/tongue.ts';

export type TokenType =
  | 'number' | 'text' | 'ref' | 'ident' | 'op'
  | 'lparen' | 'rparen' | 'comma'
  | 'lbracket' | 'rbracket' | 'tail'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string | number | null;

  text: string;
  pos: number;
  dice?: true;
}

const OPS_2 = ['==', '!=', '<=', '>='];
const OPS_1 = ['+', '-', '*', '/', '<', '>'];
const PUNCT: Record<string, TokenType> = {
  '(': 'lparen', ')': 'rparen', ',': 'comma',
};

export interface LexWords { functions: Record<string, string>; dieLetters: string }

function phraseAt(src: string, at: number, phrases: readonly string[]): string | null {
  for (const phrase of phrases) {
    if (!src.startsWith(phrase, at)) continue;
    let next = at + phrase.length;
    while (next < src.length && /\s/.test(src[next]!)) next++;
    if (src[next] === '(') return phrase;
  }
  return null;
}

const isDigit = (ch: string) => ch >= '0' && ch <= '9';


const isNameStart = (ch: string) => /[\p{L}_]/u.test(ch);
const isNamePart = (ch: string) => /[\p{L}\p{N}_.]/u.test(ch);

export function lex(source: unknown, words?: LexWords): Token[] {
  const src = String(source ?? '');
  const phrases = words ? Object.values(words.functions).filter(name => name.includes(' ')) : [];
  const letters = words?.dieLetters ?? 'd';
  const isDieLetter = (ch: string) => letters.includes(ch.toLowerCase());
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i]!;

    if (/\s/.test(ch)) { i++; continue; }

    if (ch === '"' || ch === "'") {
      const start = i;
      i++;
      const from = i;
      while (i < src.length && src[i] !== ch) i++;
      if (i >= src.length) throw new FormulaSyntaxError(tr`не закрыта кавычка`, start);
      const text = src.slice(from, i);
      i++;
      tokens.push({ type: 'text', value: text, text: src.slice(start, i), pos: start });
      continue;
    }

    const die = isDigit(ch) || isDieLetter(ch) ? bareDiceAt(src, i, letters) : null;
    if (die) {
      tokens.push({ type: 'text', value: dice(die.count, die.sides), text: src.slice(i, die.end), pos: i, dice: true });
      i = die.end;
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1] || ''))) {
      const start = i;
      while (i < src.length && isDigit(src[i]!)) i++;
      if (src[i] === '.') {
        i++;
        while (i < src.length && isDigit(src[i]!)) i++;
      }
      const text = src.slice(start, i);
      tokens.push({ type: 'number', value: Number(text), text, pos: start });
      continue;
    }

    if (ch === '@' || ch === '#') {
      const start = i;
      i++;
      const nameStart = i;
      while (i < src.length && isNamePart(src[i]!)) i++;
      if (i === nameStart) throw new FormulaSyntaxError(tr`после «@» ожидается имя`, start);
      const name = src.slice(nameStart, i);
      if (!name.endsWith('.')) {
        tokens.push({ type: 'ref', value: name, text: src.slice(start, i), pos: start });
        continue;
      }
      if (src[i] !== '[') throw new FormulaSyntaxError(tr`после точки ожидается имя колонки или «[» — колонка по значению`, i - 1);
      tokens.push({ type: 'ref', value: name.slice(0, -1), text: src.slice(start, i - 1), pos: start });
      tokens.push({ type: 'lbracket', value: '[', text: '[', pos: i });
      i++;
      continue;
    }

    if (ch === ']') {
      tokens.push({ type: 'rbracket', value: ']', text: ']', pos: i });
      i++;
      if (src[i] === '.' && isNameStart(src[i + 1] ?? '')) {
        const start = i;
        i++;
        while (i < src.length && isNamePart(src[i]!)) i++;
        tokens.push({ type: 'tail', value: src.slice(start + 1, i), text: src.slice(start, i), pos: start });
      }
      continue;
    }

    const phrase = phraseAt(src, i, phrases);
    if (phrase) {
      tokens.push({ type: 'ident', value: phrase, text: phrase, pos: i });
      i += phrase.length;
      continue;
    }

    if (isNameStart(ch)) {
      const start = i;
      while (i < src.length && isNamePart(src[i]!)) i++;
      const text = src.slice(start, i);
      tokens.push({ type: 'ident', value: text, text, pos: start });
      continue;
    }

    const two = src.slice(i, i + 2);
    if (OPS_2.includes(two)) {
      tokens.push({ type: 'op', value: two, text: two, pos: i });
      i += 2;
      continue;
    }

    if (OPS_1.includes(ch)) {
      tokens.push({ type: 'op', value: ch, text: ch, pos: i });
      i++;
      continue;
    }

    const punct = PUNCT[ch];
    if (punct) {
      tokens.push({ type: punct, value: ch, text: ch, pos: i });
      i++;
      continue;
    }

    throw new FormulaSyntaxError(tr`неизвестный символ «${ch}»`, i);
  }

  tokens.push({ type: 'eof', value: null, text: '', pos: src.length });
  return tokens;
}
