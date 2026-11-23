import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lex } from '../src/formula/lex.ts';
import { NEUTRAL_WORDS } from '../src/formula/words.ts';
import { IF } from '../src/formula/parse.ts';
import { FUNCTION_NAMES } from '../src/formula/evaluate.ts';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';

const slice = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/slice/dnd5e.world.json', import.meta.url)), 'utf8')) as unknown;

const CALLS = new Set([...FUNCTION_NAMES, IF, NEUTRAL_WORDS.functions.roll]);
const PLAIN = new Set([NEUTRAL_WORDS.and, NEUTRAL_WORDS.or, NEUTRAL_WORDS.not, NEUTRAL_WORDS.yes, NEUTRAL_WORDS.no]);
const LOCAL_DIE = /^\s*\d*\s*[кд]\s*\d+\s*$/iu;

function strays(expr: string): string[] {
  let tokens;
  try { tokens = lex(expr, NEUTRAL_WORDS); } catch { return []; }
  const out: string[] = [];
  tokens.forEach((token, at) => {
    if (token.type === 'ident') {
      const known = PLAIN.has(token.text) || (tokens[at + 1]?.type === 'lparen' && CALLS.has(token.text));
      if (!known) out.push(token.text);
    }
    if (token.type === 'text' && !token.dice && LOCAL_DIE.test(String(token.value))) out.push(token.text);
  });
  return out;
}

function walk(value: unknown, found: string[], key = ''): void {
  if (Array.isArray(value)) { value.forEach(item => walk(item, found, key)); return; }
  if (value && typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) {
      if (name === 'expr' && typeof item === 'string') for (const word of strays(item)) found.push(`«${word}» в «${item}»`);
      walk(item, found, name);
    }
    return;
  }
  if (typeof value === 'string' && !['label', 'hint', 'title', 'name', 'description', 'note', 'text'].includes(key) && /^\d+\s*[кд]\s*\d+$/iu.test(value)) found.push(`кость «${value}»`);
}

describe('в данных — только нейтральная запись формул', () => {
  for (const world of [...SAMPLE_WORLDS, ...LITE_WORLDS]) {
    it(`${world.system.name}${LITE_WORLDS.includes(world) ? ' · лёгкий' : ''}: каждое слово каждой формулы — из нейтрального словаря, кости — через d`, () => {
      const found: string[] = [];
      walk(world, found);
      expect([...new Set(found)]).toEqual([]);
    });
  }

  it('срез D&D для тестов сервера — тоже', () => {
    const found: string[] = [];
    walk(slice, found);
    expect([...new Set(found)]).toEqual([]);
  });

  it('сторож ловит русское слово и русскую кость', () => {
    expect(strays('если(@a и не пусто(@b), 1, сумма(@c))')).toEqual(['если', 'и', 'не', 'пусто', 'сумма']);
    expect(strays('@a or "1к8"')).toEqual(['"1к8"']);
    expect(strays('if(@a and not empty(@b), 1d6, sum(@c))')).toEqual([]);
  });
});
