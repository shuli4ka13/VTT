import { group, test, eq, ok, throws } from './harness.ts';
import { send, receive } from '../src/events/envelope.ts';
import { compile } from '../src/formula/index.ts';
import type { System } from '../src/model/types.ts';

const система = {
  id: 'ф', name: 'ф',
  fields: [
    { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 100, min: 0 } },
    { tag: 'порог', label: 'Крит от', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'сила', label: 'Сила', value: { kind: 'stored', type: 'number', default: 3 } },
  ],
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }],
      steps: [
        { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { expr: '0' } },
        {
          id: 'урон', type: 'amount', source: 'item',
          fixed: { expr: 'кинуть(#кость, #бросок.natural >= #порог ? 2 : 1) + #сила' },
        },
        { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    },
  },
  records: {
    оружие: {
      kind: 'item', label: 'Оружие', props: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }],
      bindings: [{ label: 'Удар', effect: 'удар', args: { кость: { prop: 'кость' } } }],
    },
  },
} as unknown as System;

const книга = {
  records: [{ id: 'меч', rk: 'оружие', label: 'Меч', props: { кость: '1к8' } }],
} as never;

const лист = (порог: number) => ({
  id: 'я', systemId: 'ф', kind: 'pc', name: 'я',
  values: { порог }, has: [{ of: 'меч' }], effects: []
} as never);

const бей = (порог: number, выпало: number) => {
  const мир = { system: система, compendium: книга, die: () => выпало };
  const конверт = send('меч:0', { ...мир, sheet: лист(порог) });
  const итог = receive(конверт, { ...мир, sheet: лист(порог) });
  return итог.report.trace.find((t: Record<string, unknown>) => t.type === 'amount') as Record<string, unknown>;
};

group('кость бросается прямо в формуле', () => {
  test('кость берётся из записи, прибавка и свитч — в той же строке', () => {
    eq(бей(20, 5).total, 5 + 3, 'одна кость плюс сила');
    eq(бей(20, 20).total, 20 + 20 + 3, 'двадцатка при пороге 20 — две кости');
    eq(бей(19, 19).total, 19 + 19 + 3, 'у кого крит от 19 — девятнадцать тоже крит');
    eq(бей(20, 19).total, 19 + 3, 'у остальных девятнадцать — обычный удар');
  });

  test('без кубика «кинуть» отказывает словами, а не молча', () => {
    const беда = throws(() => compile('кинуть(1)').evaluate(() => 0));
    ok(String(беда.message).includes('кинуть'), String(беда.message));
  });

  test('сколько раз кинуть — должно быть числом', () => {
    const беда = throws(() => compile('кинуть(1, 2)').evaluate(() => 0, {
      roll: () => { throw new Error('не должно дойти'); },
    }));
    ok(беда instanceof Error);
  });
});
