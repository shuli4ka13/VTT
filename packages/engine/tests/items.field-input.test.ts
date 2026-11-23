import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = flattenSystem({
  id: 'с', name: 'с',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'выстрелов', label: 'Выстрелов', kind: 'number', default: 0 }] },
    оружие: { shape: 'book', use: 'item', label: 'Оружие', columns: [
      { key: 'ammo_max', label: 'Боезапас', kind: 'number' },
      { key: 'ammo', label: 'Патроны', kind: 'number', expr: { expr: '@ammo_max' } },
    ], bindings: [{ label: 'Выстрел', effect: 'выстрел', args: { патроны: { expr: '@item.ammo' } } }] },
  },
  effects: {
    выстрел: { label: 'Выстрел', activation: 'manual', params: [
      { key: 'действующий', label: 'Кто действует', kind: 'sheet' },
      { key: 'патроны', label: 'Патроны', kind: 'field' },
    ], cost: [
      { type: 'branch', if: { expr: '@патроны < 1' } }, { type: 'stop', note: { expr: '"патронов нет"' } }, { type: 'end' },
    ], steps: [
      { type: 'apply', target: { expr: '@патроны' }, direction: 'subtract', value: { expr: '1' } },
      { type: 'apply', target: { expr: '@действующий.выстрелов' }, direction: 'add', value: { expr: '1' } },
    ] },
  },
} as unknown as System);
const book = { records: [{ id: 'кольт', table: 'оружие', label: 'Кольт', cells: { ammo_max: 2 } }] } as unknown as Compendium;
const hero = (has: Sheet['has']): Sheet => ({ id: 'г', systemId: 'с', name: 'Герой', values: {}, has, effects: [] } as unknown as Sheet);
const ids = () => { let n = 0; return () => `в${++n}`; };
const shoot = (sheet: Sheet, action: string) => perform({ system, compendium: book, clock: null, sheets: [sheet], die: () => 1, newId: ids() }, { op: 'act', intent: { actionId: action, fromId: 'г', toIds: [] } } as never);

describe('вход-ссылка: кнопка вещи передаёт клетку этой вещи, эффект о вещи не знает', () => {
  it('выстрел пишет в патроны своего ствола', () => {
    const out = shoot(hero([{ of: 'кольт', id: 'к1' }, { of: 'кольт', id: 'к2', values: { ammo: 1 } }]), 'кольт@к2:0');
    if (out.kind !== 'done') throw new Error(out.kind);
    expect(out.sheets[0]!.has).toEqual([{ of: 'кольт', id: 'к1' }, { of: 'кольт', id: 'к2', values: { ammo: 0 } }]);
    expect(out.sheets[0]!.values['выстрелов']).toBe(1);
  });

  it('пустой ствол — отказ по значению входа', () => {
    expect(() => shoot(hero([{ of: 'кольт', values: { ammo: 0 } }]), 'кольт:0')).toThrow(/патронов нет/);
  });

  it('ссылку можно передать дальше в вызов: «Потратить» спишет из той же клетки', () => {
    const relayed = flattenSystem({
      ...system,
      tables: { ...system.tables, оружие: { ...system.tables!.оружие!, bindings: [{ label: 'Выстрел', effect: 'через', args: { патроны: { expr: '@item.ammo' } } }] } },
      effects: {
        ...system.effects,
        через: { label: 'Через', activation: 'manual', params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'патроны', label: 'Патроны', kind: 'field' }], steps: [
          { type: 'emit', effect: 'выстрел', args: { действующий: { expr: '@действующий' }, патроны: { expr: '@патроны' } } },
        ] },
      },
    } as unknown as System);
    const out = perform({ system: relayed, compendium: book, clock: null, sheets: [hero([{ of: 'кольт', values: { ammo: 2 } }])], die: () => 1, newId: ids() }, { op: 'act', intent: { actionId: 'кольт:0', fromId: 'г', toIds: [] } } as never);
    if (out.kind !== 'done') throw new Error(out.kind);
    expect(out.sheets[0]!.has).toEqual([{ of: 'кольт', values: { ammo: 1 } }]);
  });

  it('вход, который ссылается сам на себя, — отказ словами, а не падение', () => {
    const looped = flattenSystem({
      ...system,
      tables: { ...system.tables, оружие: { ...system.tables!.оружие!, bindings: [{ label: 'Выстрел', effect: 'выстрел', args: { патроны: { expr: '@патроны' } } }] } },
    } as unknown as System);
    expect(() => perform({ system: looped, compendium: book, clock: null, sheets: [hero([{ of: 'кольт', values: { ammo: 2 } }])], die: () => 1, newId: ids() }, { op: 'act', intent: { actionId: 'кольт:0', fromId: 'г', toIds: [] } } as never)).toThrow(/ссылается сам на себя/);
  });

  it('проверка мира не ругается', () => {
    expect(errorsOf(lintSystem(system, book)).map(p => p.text)).toEqual([]);
  });
});
