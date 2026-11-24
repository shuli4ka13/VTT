import { group, test, eq, ok, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import { aimOf } from '../src/core/act.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const targets = (extra: Record<string, unknown>) => ({ key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' }, ...extra });

const system = (aim: Record<string, unknown>, more: Record<string, unknown> = {}, params: unknown[] = []): System => ({
  id: 'п', name: 'п',
  constants: { к4: { label: 'к4', kind: 'die', dice: [{ count: 1, sides: 4 }] } },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'щит', label: 'Щит', kind: 'number' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Стрелы', effect: 'стрелы', args: {} }] },
  },
  effects: {
    стрелы: {
      label: 'Стрелы', activation: 'manual',
      params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, targets(aim), { key: 'круг', label: 'Круг', kind: 'number', ask: { by: 'actor' }, optional: true, default: 1 }, ...params],
      steps: [
        { type: 'each', of: 'цели' },
        { id: 'к', type: 'roll', die: 'к4', by: { expr: '@действующий' } },
        { type: 'apply', target: { expr: '@цель.хп' }, value: { expr: '@к.total' } },
      ],
    },
    ...more,
  },
}) as unknown as System;

const book = { records: [{ id: 'приём', table: 'приём', label: 'Стрелы', cells: {} }] } as unknown as Compendium;
const sheet = (id: string, effects: string[] = []): Sheet => ({ id, systemId: 'п', name: id, values: { хп: 20, щит: 0 }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) }) as unknown as Sheet;
const sheets = (effects: string[] = []) => [sheet('а'), sheet('б', effects), sheet('в')];
const hp = (played: { sheets: Sheet[] }, id: string): unknown => played.sheets.find(one => one.id === id)!.values.хп;

const three = { count: { expr: '2 + @круг' }, repeat: true };

group('цели по счёту и повторы', () => {
  test('один лист выбран трижды — три доставки, у каждой свой бросок', () => {
    const played = exchange({ system: system(three), compendium: book, die: queue(1, 2, 4), sheets: sheets(), actionId: 'приём:0', fromId: 'а', toIds: ['б', 'б', 'б'] });
    eq(hp(played, 'б'), 13);
  });

  test('выборы делятся между листами: два в одного, один в другого', () => {
    const played = exchange({ system: system(three), compendium: book, die: queue(1, 2, 4), sheets: sheets(), actionId: 'приём:0', fromId: 'а', toIds: ['б', 'в', 'б'] });
    eq(hp(played, 'б'), 15);
    eq(hp(played, 'в'), 18);
  });

  test('без «можно повторять» повтор листа — одна доставка, как прежде', () => {
    const played = exchange({ system: system({}), compendium: book, die: queue(3), sheets: sheets(), actionId: 'приём:0', fromId: 'а', toIds: ['б', 'б'] });
    eq(hp(played, 'б'), 17);
  });

  test('выборов больше, чем позволено, — отказ; счёт считается по ответу игрока', () => {
    const play = (toIds: string[], inputs?: Record<string, number>) => () => exchange({ system: system(three), compendium: book, die: () => 1, sheets: sheets(), actionId: 'приём:0', fromId: 'а', toIds, ...(inputs ? { inputs } : {}) });
    let refused = '';
    try { play(['б', 'б', 'б', 'в'])(); } catch (err) { refused = (err as Error).message; }
    ok(refused.includes('можно не больше 3'), refused);
    eq(hp(play(['б', 'б', 'б', 'в'], { круг: 2 })(), 'б'), 17);
  });

  test('стол узнаёт, сколько выбрать и можно ли повторять, до действия', () => {
    const world = { system: system(three), compendium: book, clock: null, sheets: sheets() };
    deepEq(aimOf(world, { actionId: 'приём:0', fromId: 'а', toIds: [] }), { count: 3, repeat: true });
    deepEq(aimOf(world, { actionId: 'приём:0', fromId: 'а', toIds: [], inputs: { круг: 3 } }), { count: 5, repeat: true });
    deepEq(aimOf({ ...world, system: system({}) }, { actionId: 'приём:0', fromId: 'а', toIds: [] }), { count: null, repeat: false });
    const blank = system({ count: { expr: '2 + @сила' }, repeat: true }, {}, [{ key: 'сила', label: 'Сила', kind: 'number', ask: { by: 'actor' } }]);
    deepEq(aimOf({ ...world, system: blank }, { actionId: 'приём:0', fromId: 'а', toIds: [] }), { count: null, repeat: true }, 'ответа ещё нет — счёт неизвестен, но «можно повторять» известно');
  });

  test('реакция цели спрашивается на каждой доставке своим вопросом; повтор по журналу сходится', () => {
    const guard = { заслон: { label: 'Заслон', activation: 'passive', duration: { kind: 'permanent' }, on: [{ on: 'before:стрелы', if: { expr: '@цель == @holder' }, confirm: {}, steps: [{ type: 'apply', target: { expr: '@holder.щит' }, direction: 'add', value: { expr: '1' } }] }] } };
    const played = exchange({
      system: system(three, guard), compendium: book, die: queue(1, 2), sheets: sheets(['заслон']), actionId: 'приём:0', fromId: 'а', toIds: ['б', 'б'],
      answer: question => question.offers.map(offer => offer.id),
    });
    eq(played.questions.length, 2);
    eq(new Set(played.questions.map(question => question.key)).size, 2);
    eq(played.sheets.find(one => one.id === 'б')!.values.щит, 2);
    eq(hp(played, 'б'), 17);
  });

  test('«Проблемы»: вход «для каждой цели» с повторами целей — ошибка', () => {
    const asked = { key: 'сила', label: 'Сила', kind: 'number', ask: { by: 'actor' }, perTarget: true };
    const found = errorsOf(lintSystem(system(three, {}, [asked]), book)).map(problem => problem.text).filter(text => text.includes('повтор'));
    eq(found.length, 1);
    eq(errorsOf(lintSystem(system({ count: { expr: '3' } }, {}, [asked]), book)).map(problem => problem.text).filter(text => text.includes('повтор')).length, 0);
  });
});
