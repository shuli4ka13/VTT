import { group, test, eq, ok, throws } from './harness.ts';
import { exchange } from './play.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const mine = { expr: '@roller == @holder' };
const count = (op: string, value: string, tags: string[] = []) => ({ kind: 'edit', call: 'roll', param: 'count', op, value: { expr: value }, tags, if: mine });
const hanging = (modifiers: unknown[]) => ({ label: 'Правило', activation: 'passive', duration: { kind: 'permanent' }, modifiers });

const make = (effects: Record<string, unknown>, tags: unknown[] = ['урон', 'крит'], by = true): System => ({
  id: 'м', name: 'м',
  constants: { к6: { label: 'к6', kind: 'die', dice: [{ count: 1, sides: 6 }] } },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'счёт', label: 'Счёт', kind: 'number' }] },
    броски: { label: 'Броски', key: 'word', rows: [{ value: 'урон' }, { value: 'крит' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }],
      steps: [
        { id: 'к', type: 'roll', die: 'к6', count: { expr: '2' }, ...(by ? { by: { expr: '@действующий' } } : {}), tags },
        { type: 'apply', target: { expr: '@действующий.счёт' }, direction: 'add', value: { expr: '@к.total' } },
      ],
    },
    ...effects,
  },
}) as unknown as System;

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as unknown as Compendium;
const me = (effects: string[]): Sheet => ({ id: 'я', systemId: 'м', name: 'я', values: { счёт: 0 }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })) }) as unknown as Sheet;
const play = (system: System, effects: string[]) => exchange({ system, compendium: book, die: () => 1, sheets: [me(effects)], actionId: 'приём:0', fromId: 'я', toIds: [] });
const dice = (system: System, effects: string[]): unknown => play(system, effects).sheets[0]!.values.счёт;

group('правка «кубики»: умножить число костей', () => {
  test('по меткам «урон» и «крит» костей вдвое; без метки «крит» — как было', () => {
    const rule = { крит: hanging([count('mul', '2', ['урон', 'крит'])]) };
    eq(dice(make(rule), ['крит']), 4);
    eq(dice(make(rule, ['урон']), ['крит']), 2);
  });

  test('умножение идёт после «добавить кость», в каком бы порядке ни висели правки', () => {
    const first = { крит: hanging([count('mul', '2')]), плюс: hanging([count('add', '1')]) };
    eq(dice(make(first), ['крит', 'плюс']), 6);
    eq(dice(make(first), ['плюс', 'крит']), 6);
  });

  test('кости прибавки-кости умножаются тоже, число прибавки — нет', () => {
    const die = { kind: 'edit', call: 'roll', param: 'bonus', die: 'к6', if: mine };
    const flat = { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '5' }, if: mine };
    eq(dice(make({ крит: hanging([count('mul', '2')]), метка: hanging([die]) }), ['крит', 'метка']), 6);
    eq(dice(make({ крит: hanging([count('mul', '2')]), точность: hanging([flat]) }), ['крит', 'точность']), 9);
  });

  test('в журнале у броска видно, чья правка сработала', () => {
    const log = play(make({ крит: { ...hanging([count('mul', '2')]), label: 'Крит' } }), ['крит']).log.join(' · ');
    ok(log.includes('[1, 1, 1, 1]') && log.includes('(Крит)'), log);
  });

  test('бросок без «кто бросает» правок не получает — костей столько же', () => {
    eq(dice(make({ крит: hanging([count('mul', '2')]) }, ['урон', 'крит'], false), ['крит']), 2);
  });

  test('«Проблемы» замечают бросок без «кто бросает», до которого правка «кубики» по метке не дойдёт', () => {
    const rule = { крит: hanging([count('mul', '2', ['урон', 'крит'])]) };
    const found = (system: System) => lintSystem(system, book).filter(problem => problem.text.includes('кто бросает'));
    eq(found(make(rule, ['урон', 'крит'], false)).map(problem => problem.level).join(), 'warn');
    eq(found(make(rule, ['урон', 'крит'], true)).length, 0);
    eq(found(make(rule, ['урон'], false)).length, 0);
  });

  test('«Проблемы»: умножить и прибавить — можно, другое действие у «кубиков» — ошибка', () => {
    const texts = (op: string) => errorsOf(lintSystem(make({ крит: hanging([count(op, '2')]) }), book)).map(problem => problem.text).filter(text => text.includes('кубики к броску'));
    eq(texts('mul').join(' | '), '');
    eq(texts('add').join(' | '), '');
    eq(texts('set').length, 1);
    throws(() => play(make({ крит: hanging([count('set', '2')]) }), ['крит']), 'прибавляются или умножаются');
    throws(() => play(make({ крит: hanging([count('mul', '1.5')]) }), ['крит']), 'на целое не меньше нуля');
  });
});
