import { group, test, eq, deepEq } from './harness.ts';
import { perform } from '../src/core/perform.ts';
import { exchange } from './play.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => () => values.shift() ?? 1;

const system = (die: Record<string, unknown>, rule: Record<string, unknown>, columns: Record<string, unknown>[] = []) => ({
  id: 'с', name: 'с',
  constants: { кость: { label: 'Кость', kind: 'die', ...die } },
  rolls: { проверка: { label: 'Проверка', die: 'кость', fields: [{ table: 'лист', column: 'навык' }], ...rule } },
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'навык', label: 'Навык', kind: 'number', default: 2 }, ...columns] } },
  effects: {},
} as unknown as System);

const sheet = { id: 'герой', systemId: 'с', name: 'Герой', values: {}, has: [], effects: [] } as unknown as Sheet;
const book = { records: [] } as unknown as Compendium;

const click = (sys: System, dice: number[]): string => {
  const out = perform({ system: sys, compendium: book, clock: null, sheets: [sheet], die: queue(...dice) } as never, { op: 'roll', sheetId: 'герой', tag: 'навык' } as never);
  if (out.kind !== 'done') throw new Error('бросок спросил');
  return String(out.log.at(-1));
};

group('правило броска видит сам бросок: @бросок и его части', () => {
  const hope = system(
    { dice: [{ sides: 12, name: 'надежда' }, { sides: 12, name: 'страх' }] },
    { bonus: { expr: '@навык' }, degrees: [
      { label: 'крит', if: { expr: '@бросок.parts.надежда == @бросок.parts.страх' } },
      { label: 'со страхом', if: { expr: '@бросок.parts.страх > @бросок.parts.надежда' } },
      { label: 'с надеждой', if: { expr: 'да' } },
    ] },
  );

  test('части кости: «со страхом», когда страх выше надежды', () => {
    eq(click(hope, [3, 9]).endsWith('· со страхом'), true);
  });

  test('части кости: «крит» на равных', () => {
    eq(click(hope, [7, 7]).endsWith('· крит'), true);
  });

  test('натуральная кость без прибавки: 20 — крит, хотя итог с навыком больше', () => {
    const lead = system({ dice: [{ sides: 20 }] }, { bonus: { expr: '@навык' }, degrees: [{ label: 'крит', if: { expr: '@бросок.natural == 20' } }] });
    eq(click(lead, [20]).endsWith('= 22 · крит'), true);
    eq(click(lead, [19]).endsWith('= 21'), true);
  });

  test('грани набора: две шестёрки — крит, по лучшей кости — успех', () => {
    const pool = system({ dice: [{ sides: 6 }], read: 'best' }, { number: 'count', fields: [{ table: 'лист', column: 'навык', threshold: { expr: '4' } }], degrees: [
      { label: 'крит', if: { expr: 'сколько(@бросок.dice.rolls, 6) >= 2' } },
      { label: 'успех', if: { expr: '@успех' } },
    ] }, []);
    eq(click(pool, [6, 6]).endsWith('· крит'), true);
    eq(click(pool, [6, 2]).endsWith('· успех'), true);
  });

  test('@бросок без точки — итог броска, как @выпало', () => {
    const lead = system({ dice: [{ sides: 20 }] }, { bonus: { expr: '@навык' }, degrees: [{ label: 'много', if: { expr: '@бросок == @выпало и @бросок >= 10' } }] });
    eq(click(lead, [9]).endsWith('= 11 · много'), true);
  });

  test('поле листа «бросок» при ступенях правила — ошибка «Проблем»', () => {
    const named = system({ dice: [{ sides: 20 }] }, { degrees: [{ label: 'крит', if: { expr: '@бросок.natural == 20' } }] }, [{ key: 'бросок', label: 'Бросок', kind: 'number' }]);
    deepEq(errorsOf(lintSystem(named)).map(one => one.text).filter(text => text.includes('«бросок»')).length, 1);
  });
});

group('ступени «Проверки» списком: видят её успех, степени и бросок по имени', () => {
  const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
  const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };
  const duel = {
    id: 'д', name: 'д',
    constants: { двойная: { label: 'Двойная', kind: 'die', dice: [{ sides: 12, name: 'надежда' }, { sides: 12, name: 'страх' }] } },
    tables: {
      лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }] },
      приём: { shape: 'book', use: 'action', label: 'Приём' },
    },
    effects: { удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [
      { id: 'бросок', type: 'roll', die: 'двойная', bonus: { expr: '1' }, by: { expr: '@действующий' } },
      { type: 'each', of: 'цели' },
      { id: 'итог', type: 'check', value: { expr: '@бросок' }, versus: { expr: '15' }, degrees: [
        { label: 'крит', if: { expr: '@бросок.parts.надежда == @бросок.parts.страх' } },
        { label: 'успех со страхом', if: { expr: '@успех и @бросок.parts.страх > @бросок.parts.надежда' } },
        { label: 'успех с надеждой', if: { expr: '@успех' } },
        { label: 'провал со страхом', if: { expr: '@степени < 0 и @бросок.parts.страх > @бросок.parts.надежда' } },
        { label: 'провал с надеждой', if: { expr: 'да' } },
      ] },
    ] } },
  } as unknown as System;
  const deck = { records: [{ id: 'удар', table: 'приём', label: 'Удар', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] }] } as unknown as Compendium;
  const fighter = (id: string) => ({ id, systemId: 'д', name: id, values: {}, has: [{ of: 'удар' }], effects: [] } as unknown as Sheet);
  const degreeOf = (dice: number[]) => {
    const out = exchange({ system: duel, compendium: deck, die: queue(...dice), sheets: [fighter('герой'), fighter('враг')], actionId: 'удар:0', fromId: 'герой', toId: 'враг' } as never);
    return (out.reports.flatMap(entry => entry.report.trace).find(t => t.step === 'итог') as unknown as { degree?: string }).degree;
  };

  test('первая подходящая сверху', () => {
    eq(degreeOf([5, 10]), 'успех со страхом');
    eq(degreeOf([10, 5]), 'успех с надеждой');
    eq(degreeOf([6, 6]), 'крит');
    eq(degreeOf([2, 7]), 'провал со страхом');
    eq(degreeOf([7, 2]), 'провал с надеждой');
  });

  test('«успех» и «степени» в условии ступени — не ошибка «Проблем»', () => {
    deepEq(errorsOf(lintSystem(duel, deck)).map(one => one.text), []);
  });
});

group('ступени «Проверки» списком: проверка «Проблем» и правки степени', () => {
  const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
  const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };
  const make = (degrees: unknown, extra: Record<string, unknown> = {}) => ({
    id: 'д', name: 'д',
    constants: { двойная: { label: 'Двойная', kind: 'die', dice: [{ sides: 12, name: 'надежда' }, { sides: 12, name: 'страх' }] } },
    tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }] }, приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: { удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [
      { id: 'бросок', type: 'roll', die: 'двойная', by: { expr: '@действующий' } },
      { type: 'each', of: 'цели' },
      { id: 'итог', type: 'check', value: { expr: '@бросок' }, versus: { expr: '15' }, degrees },
    ] } },
    ...extra,
  } as unknown as System);
  const deck = { records: [{ id: 'удар', table: 'приём', label: 'Удар', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] }] } as unknown as Compendium;
  const problems = (sys: System) => lintSystem(sys, deck).map(one => one.text);

  test('опечатка в имени в условии ступени — ошибка «Проблем», а не отказ за столом', () => {
    const texts = errorsOf(lintSystem(make([{ label: 'со страхом', if: { expr: '@успех и @брсок.parts.страх > 1' } }]), deck)).map(one => one.text);
    eq(texts.some(text => text.includes('брсок')), true);
  });

  test('битая формула в условии ступени — ошибка «Проблем»', () => {
    eq(errorsOf(lintSystem(make([{ label: 'крит', if: { expr: '@успех и (' } }]), deck)).length > 0, true);
  });

  test('шаг эффекта по имени «успех» рядом со ступенями списком — предупреждение', () => {
    const sys = make([{ label: 'ок', if: { expr: '@успех' } }]);
    const steps = (sys.effects as Record<string, { steps: unknown[] }>).удар!.steps;
    steps.splice(1, 0, { id: 'успех', type: 'roll', fixed: { expr: '1' } });
    eq(problems(sys).some(text => text.includes('«успех» в условиях ступеней проверки')), true);
  });

  test('старая форма ступеней таблицей работает, как прежде', () => {
    const sys = make({ table: 'исходы', of: 'margin' });
    (sys.tables as Record<string, unknown>).исходы = { label: 'Исходы', key: 'range', rows: [{ from: -99, to: -1, cells: { value: 'провал' } }, { from: 0, to: 99, cells: { value: 'успех' } }] };
    const out = exchange({ system: sys, compendium: deck, die: queue(9, 9), sheets: [
      { id: 'а', systemId: 'д', name: 'а', values: {}, has: [{ of: 'удар' }], effects: [] }, { id: 'б', systemId: 'д', name: 'б', values: {}, has: [{ of: 'удар' }], effects: [] },
    ], actionId: 'удар:0', fromId: 'а', toId: 'б' } as never);
    eq((out.reports.flatMap(entry => entry.report.trace).find(t => t.step === 'итог') as unknown as { degree?: string }).degree, 'успех');
  });
});

group('правило броска: @бросок в «Успех, если» и «Степенях»', () => {
  test('успех по натуральной кости и степени по частям', () => {
    const sys = system({ dice: [{ sides: 20 }] }, { bonus: { expr: '@навык' }, success: { expr: '@бросок.natural >= 15' }, margin: { expr: '@бросок.natural - 15' } });
    eq(click(sys, [16]).endsWith('успех · степеней: 1'), true);
    eq(click(sys, [3]).includes('провал'), true);
  });

  test('поле листа «бросок» при «Успех, если» без ступеней — тоже ошибка', () => {
    const named = system({ dice: [{ sides: 20 }] }, { success: { expr: '@бросок.natural >= 15' } }, [{ key: 'бросок', label: 'Бросок', kind: 'number' }]);
    eq(errorsOf(lintSystem(named)).some(one => one.text.includes('«бросок»')), true);
  });
});
