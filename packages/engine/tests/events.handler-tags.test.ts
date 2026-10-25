import { group, test, eq, ok } from './harness.ts';
import { exchange } from './play.ts';
import { errorsOf, lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  constants: { к6: { label: 'к6', kind: 'die', dice: [{ count: 1, sides: 6 }] } },
  tables: {
    лист: { shape: 'single', columns: [{ key: 'счёт', label: 'Счёт', kind: 'number' }] },
    кнопки: {
      shape: 'book', use: 'action', label: 'Кнопки', columns: [],
      bindings: [
        { label: 'Защита', effect: 'бросок', args: { метка: { expr: '"защита"' } } },
        { label: 'Атака', effect: 'бросок', args: { метка: { expr: '"атака"' } } },
      ],
    },
  },
  effects: {
    бросок: {
      label: 'Бросок', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'метка', kind: 'text' }],
      steps: [{ id: 'к', type: 'roll', die: 'к6', count: { expr: '1' }, tags: [{ expr: '@метка' }], by: { expr: '@действующий' } }],
    },
    слух: {
      label: 'Слух', activation: 'passive', duration: { kind: 'permanent' },
      on: [
        { on: 'rolled', if: { expr: '@бросающий == @носитель' }, tags: ['защита'], steps: [{ type: 'apply', target: { expr: '@носитель.счёт' }, direction: 'add', value: { expr: '1' } }] },
        { on: 'rolled', if: { expr: '@бросающий == @носитель' }, notTags: ['защита'], steps: [{ type: 'apply', target: { expr: '@носитель.счёт' }, direction: 'add', value: { expr: '10' } }] },
      ],
    },
  },
} as unknown as System;

const compendium = { records: [{ id: 'кнопки', table: 'кнопки', label: 'Кнопки', cells: {} }] } as unknown as Compendium;
const me = (): Sheet => ({ id: 'я', systemId: 'x', name: 'я', values: { счёт: 0 }, has: [{ of: 'кнопки' }], effects: [{ effectId: 'слух' }] } as unknown as Sheet);
const score = (action: string): unknown => exchange({ system, compendium, die: () => 3, sheets: [me()], actionId: action, fromId: 'я', toIds: [] }).sheets[0]!.values.счёт;

group('подписка на бросок с фильтром меток', () => {
  test('«все метки» — слышит только бросок с меткой', () => {
    eq(score('кнопки:0'), 1);
  });

  test('«без меток» — не слышит бросок с такой меткой', () => {
    eq(score('кнопки:1'), 10);
  });

  test('правка броска добавляет метку: подписка «без меток» её видит', () => {
    const shaky = structuredClone(system) as System & { effects: Record<string, any> };
    shaky.effects.дрожь = {
      label: 'Дрожь', activation: 'passive', duration: { kind: 'permanent' },
      modifiers: [{ kind: 'edit', call: 'roll', param: 'tags', value: { expr: '"защита"' }, if: { expr: '@бросающий == @носитель' } }],
    };
    const sheet = { ...me(), effects: [{ effectId: 'слух' }, { effectId: 'дрожь' }] } as Sheet;
    eq(exchange({ system: shaky, compendium, die: () => 3, sheets: [sheet], actionId: 'кнопки:1', fromId: 'я', toIds: [] }).sheets[0]!.values.счёт, 1);
  });

  test('метки у подписки не на бросок — ошибка «Проблем»', () => {
    const bad = structuredClone(system) as System & { effects: Record<string, any> };
    bad.effects.слух.on[0].on = 'before:бросок';
    ok(errorsOf(lintSystem(bad, compendium)).some(p => p.text.includes('метки броска фильтруют только')));
  });
});
