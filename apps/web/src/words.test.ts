// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { FORBIDDEN_STEMS, dice, diceExample, TABS } from './words.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..', '..', '..');

const ROOTS = [
  'packages/schema/src', 'packages/schema/tests',
  'packages/engine/src', 'packages/engine/tests',
  'apps/server/src', 'apps/server/test',
  'apps/web/src',
];

const SELF = ['apps/web/src/words.test.ts', 'packages/engine/src/words/glossary.ts'];

function filesOf(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '__snapshots__') continue;
      out.push(...filesOf(path));
    } else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const all = ROOTS.flatMap(dir => filesOf(join(root, dir)))
  .map(path => ({ path: relative(root, path), code: readFileSync(path, 'utf8') }))
  .filter(f => !SELF.includes(f.path));

const sources = all.filter(f => !/\.test\.tsx?$/.test(f.path) && !/\/tests?\//.test(f.path));

const LATIN_DICE = /\b\d+d\d+\b/;
const MACHINE_KEY = /«(trigger\.on|successWhen|continueOn|targetModifiers|effectId|fromId|toId|activation|rk|steps\.\d+)»/;

describe('одно слово на одно понятие', () => {
  it('запрещённые основы не встречаются ни в коде, ни в тестах четырёх пакетов', () => {
    const found: string[] = [];
    for (const { path, code } of all) {
      const lower = code.toLowerCase();
      for (const stem of FORBIDDEN_STEMS) {
        if (lower.includes(stem.toLowerCase())) found.push(`${path}: «${stem}»`);
      }
    }
    expect(found, found.join('\n')).toEqual([]);
  });

  it('кость в подписях пишется через «к»: одна функция на всех', () => {
    expect(dice(1, 20)).toBe('1к20');
    expect(dice(null, 6)).toBe('1к6');
    expect(dice('сколько', 8)).toBe('сколькок8');
    expect(diceExample).toBe('1к20');
    const found = sources.filter(f => LATIN_DICE.test(f.code)).map(f => `${f.path}: ${f.code.match(LATIN_DICE)![0]}`);
    expect(found, found.join('\n')).toEqual([]);
  });

  it('машинные ключи не печатаются в подписях интерфейса', () => {
    const web = sources.filter(f => f.path.startsWith('apps/web/'));
    const found = web.filter(f => MACHINE_KEY.test(f.code)).map(f => `${f.path}: ${f.code.match(MACHINE_KEY)![0]}`);
    expect(found, found.join('\n')).toEqual([]);
  });

  it('вкладки конструктора зовутся словами глоссария', () => {
    const constructor = sources.find(f => f.path.endsWith('screens/constructor/constructor.tsx'))!;
    for (const key of Object.keys(TABS) as (keyof typeof TABS)[]) {
      expect(constructor.code, `вкладка ${key}`).toContain(`TABS.${key}`);
    }
  });

  it('негативный контроль: проверки ловят нарушение, а не совпадение', () => {
    expect(FORBIDDEN_STEMS.some(stem => 'Карточка шага'.toLowerCase().includes(stem))).toBe(true);
    expect(FORBIDDEN_STEMS.some(stem => 'карточек: 2'.toLowerCase().includes(stem))).toBe(true);
    expect(LATIN_DICE.test('бросьте 1d20')).toBe(true);
    expect(LATIN_DICE.test('бросьте 1к20')).toBe(false);
    expect(LATIN_DICE.test('`${count}d${sides}`')).toBe(false);
    expect(MACHINE_KEY.test('не заполнено «trigger.on»')).toBe(true);
    expect(sources.length).toBeGreaterThan(50);
  });
});
