import { describe, it, expect, afterEach } from 'vitest';
import { LITE_WORLDS, SAMPLE_SYSTEMS, SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { availableActions } from '../src/events/actions.ts';
import { asksOf, choicesOf, askKindOf, isPerTarget } from '../src/model/asks.ts';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import { isRuleError } from '../src/engine/errors.ts';
import { lintSystem } from '../src/model/lint.ts';
import { installMethod, ADVANTAGE_METHODS } from '../src/model/advantage-methods.ts';
import { setCrit } from '../src/model/toggles.ts';
import { blankDesk } from '../src/events/desk.ts';
import { setTongue, tongueOf } from '../src/words/tongue.ts';
import { registry } from '../src/engine/steps/index.ts';
import { STEP_WORDS } from '../src/words/steps.ts';
import { withColumn } from '../src/model/sheet-columns.ts';
import { englishWorld, latinData, SPOKEN } from './tongue.latin.ts';
import type { Journal } from '../src/core/external.ts';
import type { Sheet, System, Compendium } from '../src/model/types.ts';

interface World { system: System; compendium: Compendium; sheets: Sheet[] }

interface Played { kind: 'done' | 'refused'; sheets: Sheet[]; lines: string[] }

function answersFor(world: World, actionId: string, to: string): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const param of asksOf(actionId, world)) {
    const kind = askKindOf(param);
    const options = kind === 'choice' ? choicesOf(world.system, param) : [];
    const value = kind === 'choice' ? options[0] : kind === 'number' ? 1 : kind === 'boolean' ? false : 'x';
    if (value === undefined) continue;
    inputs[param.key] = isPerTarget(param) ? { [to]: value } : value;
  }
  return inputs;
}

function play(world: World, fromId: string, to: string, actionId: string): Played {
  let journal: Journal = emptyJournal();
  let turn = 0;
  const die = (sides: number) => 1 + ((turn++ * 7) % sides);
  try {
    for (let round = 0; round < 64; round++) {
      const out = act({ ...world, clock: null, die, journal }, { actionId, fromId, toIds: [to], inputs: answersFor(world, actionId, to) });
      if (out.kind === 'done') return { kind: 'done', sheets: out.sheets, lines: out.log };
      const first = out.question.offers[0];
      journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: first ? [first.id] : [] } };
    }
  } catch (err) {
    if (isRuleError(err)) return { kind: 'refused', sheets: [], lines: [(err as Error).message] };
    throw err;
  }
  throw new Error(`«${actionId}» задаёт вопросы без конца`);
}

const worldOf = (sample: (typeof LITE_WORLDS)[number]): World =>
  ({ system: flattenSystem(sample.system), compendium: sample.compendium, sheets: sample.sheets });

afterEach(() => { setTongue('ru'); });

for (const sample of LITE_WORLDS) {
  const russian = worldOf(sample);
  const english = worldOf(englishWorld(sample));
  const players = russian.sheets.filter(sheet => sheet.id !== 'desk');
  const moves = players.flatMap(from => {
    const to = players.find(sheet => sheet.id !== from.id)?.id ?? from.id;
    return availableActions(from, russian).map(action => ({ from: from.id, to, action: action.id }));
  });

  describe(`движок на двух языках: ${russian.system.name} · лёгкий`, () => {
    it('язык журнала идёт от системы: умолчание интерфейса итог операции не меняет', () => {
      for (const move of moves) {
        setTongue('ru');
        const plain = play(russian, move.from, move.to, move.action);
        setTongue('en');
        expect(play(russian, move.from, move.to, move.action), move.action).toEqual(plain);
      }
    }, 300000);

    it('система с английским основным языком играется так же, а говорит без русских букв', () => {
      const spoken: string[] = [];
      for (const move of moves) {
        const plain = play(russian, move.from, move.to, move.action);
        const other = play(english, move.from, move.to, move.action);
        expect(other.kind, move.action).toBe(plain.kind);
        expect(other.sheets, move.action).toEqual(latinData(plain.sheets));
        expect(other.lines.length, move.action).toBe(plain.lines.length);
        for (const line of other.lines) if (SPOKEN.test(line)) spoken.push(`${move.action}: ${line}`);
      }
      expect(spoken.slice(0, 20)).toEqual([]);
    }, 300000);

    it('«Проблемы» на английском — те же места и уровни, без русских букв', () => {
      const plain = lintSystem(russian.system, russian.compendium);
      const other = lintSystem(english.system, english.compendium, 'en');
      expect(other.map(problem => [problem.level, JSON.stringify(problem.where)])).toEqual(plain.map(problem => [problem.level, JSON.stringify(latinData(problem.where))]));
      expect(other.filter(problem => SPOKEN.test(problem.text)).map(problem => problem.text).slice(0, 20)).toEqual([]);
      expect(lintSystem(russian.system, russian.compendium, 'ru')).toEqual(plain);
    }, 300000);
  });
}

describe('заготовки движка пишут в систему на её основном языке', () => {
  const dnd = (): System => structuredClone(SAMPLE_SYSTEMS.find(one => one.name === 'D&D 5e')!) as System;

  const grown = (system: System): System => {
    for (const method of ADVANTAGE_METHODS) installMethod(system, method.id);
    setCrit(system, 'explode');
    return system;
  };

  it('русская система: при любом умолчании интерфейса заготовки дают одно и то же', () => {
    setTongue('ru');
    const plain = grown(dnd());
    const desk = blankDesk(dnd());
    setTongue('en');
    expect(grown(dnd())).toEqual(plain);
    expect(blankDesk(dnd())).toEqual(desk);
  });

  it('система с английским основным языком: добавленное заготовками — без русских букв', () => {
    const before = englishWorld({ system: dnd() }).system as System;
    const after = grown(structuredClone(before));
    const added = JSON.stringify(after).length - JSON.stringify(before).length;
    expect(added).toBeGreaterThan(0);
    expect(JSON.stringify(after).match(/[Ѐ-ӿ][^"]{0,40}/gu)?.slice(0, 10) ?? []).toEqual([]);
    expect(blankDesk(before).name).toBe('Desk');
  });
});

describe('находки ревью второго языка: что не должно зависеть от языка и что должно за ним идти', () => {
  it('подпись шага из реестра читается на текущем языке, а не замерзает при загрузке', () => {
    for (const [type, mod] of registry) {
      const words = (STEP_WORDS as Record<string, { label: string; hint: string } | undefined>)[type];
      if (!words) continue;
      setTongue('ru');
      expect(mod.label, type).toBe(words.label);
      const russian = mod.label;
      setTongue('en');
      expect(mod.label, type).toBe(words.label);
      expect(SPOKEN.test(String(mod.label)), type).toBe(false);
      expect(mod.label, type).not.toBe(russian);
    }
  });

  it('ошибка сломанной таблицы говорится на языке запроса, даже если поля уже собраны на другом', () => {
    const broken = {
      id: 's', name: 's', effects: {},
      tables: {
        abilities: {
          label: 'Abilities', owner: 'sheet',
          columns: [
            { key: 'score', label: 'Score', kind: 'number', default: 10 },
            { key: 'mod', label: 'Modifier', kind: 'number', expr: { expr: '@row.score' }, title: '{nope}: {label}' },
          ],
          rows: [{ value: 'strength', label: 'Strength' }],
        },
      },
    } as unknown as System;
    const first = lintSystem(broken).filter(problem => problem.where.section === 'tables');
    expect(first.length).toBeGreaterThan(0);
    expect(first.some(problem => SPOKEN.test(problem.text))).toBe(true);
    const asked = lintSystem(broken, undefined, 'en').filter(problem => problem.where.section === 'tables');
    expect(asked.length).toBe(first.length);
    expect(asked.filter(problem => SPOKEN.test(problem.text)).map(problem => problem.text)).toEqual([]);
    expect(lintSystem(broken).filter(problem => problem.where.section === 'tables')).toEqual(first);
  });

  it('таблица листа, заведённая движком, называется на основном языке системы', () => {
    const column = { key: 'hp', label: 'HP', kind: 'number' } as never;
    const empty = { id: 's', name: 's', effects: {}, tables: {} } as unknown as System;
    setTongue('en');
    expect(Object.values(withColumn(empty, column).tables ?? {})[0]!.label).toBe('Лист');
    setTongue('ru');
    expect(Object.values(withColumn({ ...empty, langs: ['en'] } as System, column).tables ?? {})[0]!.label).toBe('Sheet');
  });

  it('полные образцы: «Проблемы» на английском — те же места и уровни', () => {
    for (const sample of SAMPLE_WORLDS) {
      const russian = flattenSystem(sample.system);
      const english = englishWorld(sample);
      const plain = lintSystem(russian, sample.compendium);
      const other = lintSystem(flattenSystem(english.system), english.compendium, 'en');
      expect(other.map(problem => [problem.level, JSON.stringify(problem.where)]), russian.name).toEqual(plain.map(problem => [problem.level, JSON.stringify(latinData(problem.where))]));
      expect(other.filter(problem => SPOKEN.test(problem.text)).map(problem => problem.text).slice(0, 10), russian.name).toEqual([]);
    }
  }, 300000);

  it('код языка с регионом — тот же язык', () => {
    setTongue('ru-RU');
    expect(lintSystem({ id: 's', name: 's', effects: {}, tables: {}, langs: ['ru'] } as unknown as System)).toEqual([]);
    expect(tongueOf('ru-RU')).toBe('ru');
    expect(tongueOf('RU')).toBe('ru');
    expect(tongueOf('en-GB')).toBe('en');
  });
});
