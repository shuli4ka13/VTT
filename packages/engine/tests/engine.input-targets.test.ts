import { group, test, eq, deepEq } from './harness.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { errorsOf, lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'сила', label: 'Сила', kind: 'number' }, { key: 'ловкость', label: 'Ловкость', kind: 'number' }] },
    характеристики: {
      label: 'Характеристики',
      columns: [{ key: 'поле', label: 'Поле', kind: 'field' }],
      rows: [{ value: 'Сила', cells: { поле: 'сила' } }, { value: 'Ловкость', cells: { поле: 'ловкость' } }],
    },
  },
  effects: {
    усиление: {
      label: 'Усиление', activation: 'passive', duration: { kind: 'permanent' }, reapply: 'stack',
      params: [{ key: 'что', kind: 'choice', from: 'характеристики' }, { key: 'сколько', kind: 'number', default: 1 }],
      modifiers: [{ kind: 'value', target: '{@что.поле}', op: 'add', value: { expr: '@сколько' } }],
    },
    прямо: {
      label: 'Прямо', activation: 'passive', duration: { kind: 'permanent' },
      params: [{ key: 'куда', kind: 'field' }],
      modifiers: [{ kind: 'value', target: '{@куда}', op: 'add', value: { expr: '5' } }],
    },
  },
} as unknown as System;

const compendium = { records: [] } as unknown as Compendium;
const sheet = (effects: object[]): Sheet => ({ id: 'я', systemId: 'x', name: 'я', values: { сила: 3, ловкость: 3 }, has: [], effects } as unknown as Sheet);
const read = (s: Sheet, tag: string): unknown => calc(system, s, tag, newPass(system, s, { compendium }));

group('мишень правки висящего — из его входа', () => {
  test('«{@что.поле}» — поле из строки выбора; другое поле не тронуто', () => {
    const s = sheet([{ effectId: 'усиление', inst: 'а', args: { что: 'Ловкость', сколько: 2 } }]);
    deepEq([read(s, 'сила'), read(s, 'ловкость')], [3, 5]);
  });

  test('два наложения на разные поля — каждое своё', () => {
    const s = sheet([{ effectId: 'усиление', inst: 'а', args: { что: 'Ловкость', сколько: 2 } }, { effectId: 'усиление', inst: 'б', args: { что: 'Сила' } }]);
    deepEq([read(s, 'сила'), read(s, 'ловкость')], [4, 5]);
  });

  test('«{@куда}» — вход-поле', () => {
    eq(read(sheet([{ effectId: 'прямо', args: { куда: 'сила' } }]), 'сила'), 8);
  });

  test('пустой вход — правка не действует', () => {
    eq(read(sheet([{ effectId: 'прямо' }]), 'сила'), 3);
  });

  test('проверка системы: мишень из входа — не ошибка; чужой вход — ошибка', () => {
    deepEq(errorsOf(lintSystem(system, compendium)).map(p => p.text), []);
    const bad = structuredClone(system) as System & { effects: Record<string, any> };
    bad.effects.прямо.modifiers[0].target = '{@нечто}';
    eq(errorsOf(lintSystem(bad, compendium)).some(p => p.text.includes('нечто')), true);
  });
});
