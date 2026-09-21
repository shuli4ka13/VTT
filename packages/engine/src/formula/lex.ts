import { FormulaSyntaxError } from './errors.ts';

export type TokenType =
  | 'number' | 'ref' | 'ident' | 'op'
  | 'lparen' | 'rparen' | 'comma' | 'question' | 'colon'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string | number | null;

  text: string;
  pos: number;
}

const OPS_2 = ['==', '!=', '<=', '>='];
const OPS_1 = ['+', '-', '*', '/', '<', '>'];
const PUNCT: Record<string, TokenType> = {
  '(': 'lparen', ')': 'rparen', ',': 'comma', '?': 'question', ':': 'colon',
};

const isDigit = (ch: string) => ch >= '0' && ch <= '9';

const isNameStart = (ch: string) => /[\p{L}_]/u.test(ch);
const isNamePart = (ch: string) => /[\p{L}\p{N}_.]/u.test(ch);

export function lex(source: unknown): Token[] {
  const src = String(source ?? '');
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i]!;

    if (/\s/.test(ch)) { i++; continue; }

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

    if (ch === '#') {
      const start = i;
      i++;
      const nameStart = i;
      while (i < src.length && isNamePart(src[i]!)) i++;
      if (i === nameStart) throw new FormulaSyntaxError('после «#» ожидается имя тега', start);
      tokens.push({ type: 'ref', value: src.slice(nameStart, i), text: src.slice(start, i), pos: start });
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

    throw new FormulaSyntaxError(`неизвестный символ «${ch}»`, i);
  }

  tokens.push({ type: 'eof', value: null, text: '', pos: src.length });
  return tokens;
}
