import { group, test, eq } from './harness.ts';
import { rollLead } from './kit.ts';
import type { DieConstant } from '../src/model/types.ts';

const queue = (...values: number[]) => () => values.shift() ?? 1;

group('кость «вычитается из суммы»', () => {
  test('единственная часть со знаком минус вычитается', () => {
    const minus = { label: 'к100 минус', kind: 'die', dice: [{ count: 1, sides: 100, minus: true }] } as unknown as DieConstant;
    eq(rollLead(minus, queue(87)).total, -87);
  });

  test('часть со знаком минус вычитается из суммы остальных', () => {
    const mixed = { label: 'к20 − к6', kind: 'die', dice: [{ count: 1, sides: 20 }, { count: 1, sides: 6, minus: true }] } as unknown as DieConstant;
    eq(rollLead(mixed, queue(15, 4)).total, 11);
  });
});
