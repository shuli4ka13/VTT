import { group, test, eq, ok } from './harness.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'ответ', name: 'ответ',
  tables: { лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }] } , приём: { shape: 'book', use: 'action', label: 'Приём' } },
  effects: {
    урон: {
      label: 'Урон',
      params: [{ key: 'лист', label: 'Лист', kind: 'sheet' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
      steps: [{ type: 'apply', target: { expr: '@лист.хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '@сколько' } }],
    },
    лечение: {
      label: 'Лечение',
      params: [{ key: 'лист', label: 'Лист', kind: 'sheet' }, { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
      steps: [{ type: 'apply', target: { expr: '@лист.хп' }, direction: 'add', targetModifiers: false, value: { expr: '@сколько' } }],
    },
    сопротивление: {
      label: 'Сопротивление', activation: 'passive', duration: { kind: 'permanent' },
      modifiers: [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, if: { expr: '@лист == @носитель' } }],
    },
    касание: {
      label: 'Вампирское касание', activation: 'manual',
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }],
      steps: [
        { type: 'each', of: 'цели', as: 'цель' },
        { id: 'нанесено', type: 'emit', event: 'урон', args: { лист: { expr: '@цель' }, сколько: { const: 10 } } },
        { type: 'emit', event: 'лечение', args: { лист: { expr: '@действующий' }, сколько: { expr: 'округлить вниз(@нанесено.amount / 2)' } } },
      ],
    },
  },
} as unknown as System;

const book = { records: [{ id: 'касание', table: 'приём', label: 'Касание', bindings: [{ label: 'Касание', effect: 'касание', args: {} }] }] } as unknown as Compendium;
const sheet = (id: string, хп: number, effects: string[] = []): Sheet =>
  ({ id, systemId: 'ответ', name: id, values: { хп }, has: [{ of: 'касание' }], effects: effects.map(effectId => ({ effectId })) } as unknown as Sheet);

const touch = (target: Sheet) => exchange({
  system, compendium: book, die: () => 1, sheets: [sheet('вампир', 10), target], actionId: 'касание:0', fromId: 'вампир', toId: target.id,
});

group('ответ действующему посреди цепочки', () => {
  test('урон цели 10, вампир лечится на половину нанесённого — 5', () => {
    const out = touch(sheet('жертва', 20));
    eq(out.sheets.find(s => s.id === 'жертва')!.values.хп, 10);
    eq(out.sheets.find(s => s.id === 'вампир')!.values.хп, 15);
  });

  test('лечится от нанесённого после сопротивления цели: 10 × ½ = 5, лечение 2', () => {
    const out = touch(sheet('жертва', 20, ['сопротивление']));
    eq(out.sheets.find(s => s.id === 'жертва')!.values.хп, 15);
    eq(out.sheets.find(s => s.id === 'вампир')!.values.хп, 12);
  });

  test('в журнале действия записаны оба вызова: урон цели и лечение действующего', () => {
    const out = touch(sheet('жертва', 20));
    eq(out.reports.length, 1);
    eq(out.reports[0]!.report.emitted.map(e => `${e.event}:${e.amount}`).join(','), 'урон:10,лечение:5');
  });
});
