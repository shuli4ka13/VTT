import { group, test, eq, ok } from './harness.ts';
import { exchange } from '../src/events/exchange.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'ответ', name: 'ответ',
  tables: { лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }] } },
  effects: {
    урон: {
      label: 'Урон', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
      steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '@event.amount' } }],
    },
    лечение: {
      label: 'Лечение', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }],
      steps: [{ type: 'apply', target: { tag: 'хп' }, direction: 'add', targetModifiers: false, value: { expr: '@event.amount' } }],
    },
    сопротивление: {
      label: 'Сопротивление', activation: 'passive', duration: { kind: 'permanent' },
      modifiers: [{ kind: 'value', target: 'event:урон', op: 'mul', value: { expr: '0.5' } }],
    },
    касание: {
      label: 'Вампирское касание', activation: 'manual',
      steps: [
        { id: 'нанесено', type: 'emit', event: 'урон', args: { сколько: { const: 10 } } },
        { type: 'emit', event: 'лечение', to: 'sender', args: { сколько: { expr: 'округлить вниз(@нанесено.amount / 2)' } } },
      ],
    },
  },
  records: { приём: { kind: 'action', label: 'Приём' } },
} as unknown as System;

const book = { records: [{ id: 'касание', rk: 'приём', label: 'Касание', bindings: [{ label: 'Касание', effect: 'касание', args: {} }] }] } as unknown as Compendium;
const sheet = (id: string, хп: number, effects: string[] = []): Sheet =>
  ({ id, systemId: 'ответ', name: id, values: { хп }, has: [{ of: 'касание' }], effects: effects.map(effectId => ({ effectId })) } as unknown as Sheet);

const touch = (target: Sheet) => exchange({
  system, compendium: book, die: () => 1, sheets: [sheet('вампир', 10), target], actionId: 'касание:0', fromId: 'вампир', toId: target.id,
});

group('ответ отправителю посреди цепочки', () => {
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

  test('в журнале есть ответный вызов у отправителя', () => {
    const out = touch(sheet('жертва', 20));
    ok(out.reports.some(r => r.toId === 'вампир' && r.report.reply), JSON.stringify(out.reports.map(r => [r.fromId, r.toId])));
  });
});
