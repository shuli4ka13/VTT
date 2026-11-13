import { describe, it, expect } from 'vitest';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import { lintSystem } from '../src/model/lint.ts';
import { serializeSheet } from '../src/model/serialize.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const ACTOR = { key: 'действующий', label: 'Кто действует', kind: 'sheet' };
const TARGETS = { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } };

const world = (hull: boolean): System => flattenSystem({
  id: 'к', name: 'к',
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }, { key: 'тело', label: 'Тело', kind: 'number', default: 6 }] },
    rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ sides: 20 }] } },
  sheets: {
    машина: { label: 'Машина', ...(hull ? { grants: ['корпус'] } : {}) },
    дрон: { label: 'Дрон', extends: 'машина' },
    человек: { label: 'Человек' },
  },
  effects: {
    урон: { label: 'Урон', activation: 'manual', params: [{ key: 'кому', label: 'Кому', kind: 'sheet', role: 'target' }, { key: 'сколько', label: 'Сколько урона', kind: 'number', role: 'amount' }],
      steps: [{ type: 'apply', target: { expr: '@кому.хп' }, direction: 'subtract', value: { expr: '@сколько' } }] },
    удар: { label: 'Удар', activation: 'manual', params: [ACTOR, TARGETS], steps: [
      { type: 'each', of: 'цели' },
      { id: 'бросок', type: 'roll', die: 'к20', by: { expr: '@действующий' }, tags: ['атака'] },
      { type: 'emit', effect: 'урон', args: { кому: { expr: '@цель' }, сколько: { expr: '@бросок.total' } } },
    ] },
    корпус: { label: 'Корпус', activation: 'passive', modifiers: [
      { kind: 'edit', call: 'урон', param: 'сколько', op: 'add', value: { expr: '0 - @сколько' }, if: { expr: '@кому == @носитель и @сколько <= @носитель.тело' } },
      { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '-3' }, if: { expr: '@бросающий == @носитель' }, tags: ['атака'] },
    ] },
  },
} as unknown as System);

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] } as Compendium;
const sheet = (id: string, of: string): Sheet => ({ id, systemId: 'к', name: id, of, values: {}, has: [{ of: 'приём' }], effects: [] } as unknown as Sheet);
const strike = (system: System, from: Sheet, to: Sheet, rolled: number) => {
  const out = act({ system, compendium: book, clock: null, sheets: [from, to], die: () => rolled, journal: emptyJournal() }, { actionId: 'приём:0', fromId: from.id, toIds: [to.id] });
  if (out.kind !== 'done') throw new Error('ждали конец действия');
  if (process.env.SHOW) console.log(out.log.join('\n'));
  return out;
};
const hp = (out: { sheets: Sheet[] }, id: string) => out.sheets.find(s => s.id === id)!.values.хп ?? 20;

describe('висящий эффект с правками, выданный типу листа', () => {
  it('правка вызова: слабый урон по машине и по её наследнику гасится, сильный проходит; без выдачи проходит любой', () => {
    expect(hp(strike(world(true), sheet('а', 'человек'), sheet('м', 'машина'), 5), 'м')).toBe(20);
    expect(hp(strike(world(true), sheet('а', 'человек'), sheet('д', 'дрон'), 5), 'д')).toBe(20);
    expect(hp(strike(world(true), sheet('а', 'человек'), sheet('м', 'машина'), 9), 'м')).toBe(11);
    expect(hp(strike(world(false), sheet('а', 'человек'), sheet('м', 'машина'), 5), 'м')).toBe(15);
    expect(hp(strike(world(true), sheet('а', 'человек'), sheet('ч', 'человек'), 5), 'ч')).toBe(15);
  });

  it('правка броска: бросок листа этого типа и наследника получает прибавку, чужой — нет', () => {
    expect(hp(strike(world(true), sheet('м', 'машина'), sheet('ч', 'человек'), 10), 'ч')).toBe(13);
    expect(hp(strike(world(true), sheet('д', 'дрон'), sheet('ч', 'человек'), 10), 'ч')).toBe(13);
    expect(hp(strike(world(false), sheet('м', 'машина'), sheet('ч', 'человек'), 10), 'ч')).toBe(10);
  });

  it('выданное типом в хранимый лист не пишется', () => {
    const out = strike(world(true), sheet('а', 'человек'), sheet('м', 'машина'), 9);
    expect(serializeSheet(out.sheets.find(s => s.id === 'м')!)).not.toContain('корпус');
  });

  it('«Проблемы»: выдача типом несуществующего эффекта — ошибка; эффект, выданный типу, не «не подключён»', () => {
    const broken = world(true);
    delete (broken.effects as Record<string, unknown>).корпус;
    expect(lintSystem(broken).some(one => one.level === 'error')).toBe(true);
    expect(lintSystem(world(true)).filter(one => one.level === 'error').map(one => one.text)).toEqual([]);
  });
});
