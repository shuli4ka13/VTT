import { group, test, eq, deepEq } from './harness.ts';
import { fireMoments } from './legacy.ts';
import { subscribers, subscriberByKey, listening } from '../src/events/bus.ts';
import type { System, Sheet } from '../src/model/types.ts';

const hp = (sign: 'add' | 'subtract', n: number) => ({ type: 'apply', target: { tag: 'хиты' }, direction: sign, value: { expr: `${JSON.stringify(n)}` } });

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] } },
  effects: {
    горит: {
      label: 'Горит', activation: 'passive', duration: { kind: 'permanent' },
      on: [
        { on: 'moment:turn-start', steps: [hp('subtract', 3)] },
        { on: 'moment:turn-end', steps: [hp('add', 1)] },
        { on: 'targeted', of: 'удар', confirm: true, steps: [] },
      ],
    },
    удар: { label: 'Удар', activation: 'manual', steps: [] },
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
    eq(subscriberByKey(system, 'горит#2')?.handler.of, 'удар');
    eq(subscriberByKey(system, 'горит#9'), null);
  });

  test('действие будит только подписку с его ролью, фазой и вопросом', () => {
    const asked = listening(system, sheet(), { shape: 'book', use: 'action', moment: 'targeted', confirm: true, effect: 'удар', emitted: [] });
    deepEq(asked.map(s => s.key), ['горит#2']);
    eq(listening(system, sheet(), { shape: 'book', use: 'action', moment: 'affected', confirm: false, effect: 'удар', emitted: [] }).length, 0);
  });
});
