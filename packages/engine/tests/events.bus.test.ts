import { group, test, eq, deepEq } from './harness.ts';
import { fireMoments } from './kit.ts';
import { exchange } from './play.ts';
import { subscribers, subscriberByKey } from '../src/events/bus.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const hp = (sign: 'add' | 'subtract', n: number) => ({ type: 'apply', target: { expr: '@носитель.хиты' }, direction: sign, value: { expr: `${JSON.stringify(n)}` } });

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] } },
  effects: {
    горит: {
      label: 'Горит', activation: 'passive', duration: { kind: 'permanent' },
      on: [
        { on: 'moment:turn-start', steps: [hp('subtract', 3)] },
        { on: 'moment:turn-end', steps: [hp('add', 1)] },
        { on: 'before:удар', if: { expr: '@цель == @носитель' }, confirm: true, steps: [] },
      ],
    },
    удар: { label: 'Удар', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }], steps: [{ type: 'each', of: 'цели' }] },
  },
} as unknown as System;

const sheet = (): Sheet => ({
  id: 'а', systemId: 'x', name: 'Арвен', values: { хиты: 20 },
  has: [], effects: [{ effectId: 'горит' }],
} as unknown as Sheet);

const world = { system, compendium: { records: [] }, die: () => 3 };

group('шина: одно состояние — несколько подписок', () => {
  test('каждая подписка отвечает на своё «что случилось»', () => {
    const start = fireMoments([{ moment: 'turn-start', sheetId: 'а' }], [sheet()], world as never);
    eq(start.sheets[0]!.values.хиты, 17, 'начало хода жжёт');
    const end = fireMoments([{ moment: 'turn-end', sheetId: 'а' }], start.sheets, world as never);
    eq(end.sheets[0]!.values.хиты, 18, 'конец хода отпускает');
  });

  test('у каждой подписки свой ключ, по нему её находит стол', () => {
    deepEq(subscribers(system, sheet()).map(s => s.key), ['горит', 'горит#1', 'горит#2']);
    eq(subscriberByKey(system, 'горит#2')?.handler.on, 'before:удар');
    eq(subscriberByKey(system, 'горит#9'), null);
  });

  test('действие будит только подписку с его «что случилось» и вопросом', () => {
    const book = { records: [{ id: 'удар', table: 'приём', label: 'Удар', cells: {}, bindings: [{ label: 'Удар', effect: 'удар', args: {} }] }] } as unknown as Compendium;
    const withAction = { ...system, tables: { ...system.tables, приём: { shape: 'book', use: 'action', label: 'Приём', columns: [] } } } as unknown as System;
    const striker = { id: 'б', systemId: 'x', name: 'б', values: { хиты: 20 }, has: [{ of: 'удар' }], effects: [] } as unknown as Sheet;
    const out = exchange({
      system: withAction, compendium: book, die: () => 3, sheets: [striker, sheet()], actionId: 'удар:0', fromId: 'б', toIds: ['а'],
      answer: () => [],
    });
    eq(out.questions.length, 1);
    eq(out.questions[0]!.window, 'target');
  });
});
