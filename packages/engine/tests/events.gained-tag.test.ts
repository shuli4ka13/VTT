import { group, test, eq, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import { errorsOf, lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: {
    лист: { shape: 'single', columns: [{ key: 'счёт', label: 'Счёт', kind: 'number' }, { key: 'кто', label: 'Кто', kind: 'text' }] },
    кнопки: {
      shape: 'book', use: 'action', label: 'Кнопки', columns: [],
      bindings: [
        { label: 'Облить', effect: 'наложить', args: { что: { expr: '"мокрый"' } } },
        { label: 'Заморозить', effect: 'наложить', args: { что: { expr: '"холод"' } } },
        { label: 'Сухой', effect: 'наложить', args: { что: { expr: '"сухой"' } } },
      ],
    },
  },
  effects: {
    наложить: {
      label: 'Наложить', activation: 'manual',
      params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'что', label: 'Что', kind: 'effect' }],
      steps: [{ type: 'status', effect: { expr: '@что' }, to: { expr: '@действующий' } }],
    },
    мокрый: { label: 'Мокрый', activation: 'passive', tags: ['гасит горение'], duration: { kind: 'permanent' } },
    холод: { label: 'Холод', activation: 'passive', tags: ['гасит горение'], duration: { kind: 'permanent' } },
    сухой: { label: 'Сухой', activation: 'passive', duration: { kind: 'permanent' } },
    горение: {
      label: 'Горение', activation: 'passive', duration: { kind: 'permanent' },
      on: [{
        on: 'gained:гасит горение', if: { expr: '@лист == @носитель' },
        steps: [
          { type: 'apply', target: { expr: '@носитель.счёт' }, direction: 'add', value: { expr: '1' } },
          { type: 'apply', target: { expr: '@носитель.кто' }, direction: 'set', value: { expr: '@эффект' } },
        ],
      }],
    },
  },
} as unknown as System;

const compendium = { records: [{ id: 'кнопки', table: 'кнопки', label: 'Кнопки', cells: {} }] } as unknown as Compendium;
const me = (): Sheet => ({ id: 'я', systemId: 'x', name: 'я', values: { счёт: 0 }, has: [{ of: 'кнопки' }], effects: [{ effectId: 'горение' }] } as unknown as Sheet);
const after = (action: string): Record<string, unknown> => exchange({ system, compendium, die: () => 1, sheets: [me()], actionId: action, fromId: 'я', toIds: [] }).sheets[0]!.values;

group('«появилось» по метке эффекта', () => {
  test('эффект с меткой слышен подписке на метку, имя эффекта — в «@эффект»', () => {
    deepEq([after('кнопки:0').счёт, after('кнопки:0').кто], [1, 'мокрый']);
    deepEq([after('кнопки:1').счёт, after('кнопки:1').кто], [1, 'холод']);
  });

  test('эффект без метки не слышен', () => {
    eq(after('кнопки:2').счёт, 0);
  });

  test('подписка на метку, которая есть у эффектов, — не ошибка «Проблем»', () => {
    deepEq(errorsOf(lintSystem(system, compendium)).map(p => p.text), []);
  });
});
