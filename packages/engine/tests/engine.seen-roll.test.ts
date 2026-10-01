import { group, test, eq, deepEq } from './harness.ts';
import { rollLead, seeRoll } from '../src/engine/lead-die.ts';
import type { DieConstant } from '../src/model/types.ts';

const queue = (...values: number[]) => () => values.shift() ?? 1;
const d20: DieConstant = { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } as DieConstant;
const pool: DieConstant = { label: 'пул', kind: 'die', dice: [{ count: 3, sides: 6 }], read: { kind: 'count', atLeast: 5 } } as unknown as DieConstant;

group('увидев кости: выпавшее остаётся', () => {
  test('докинуть одну и оставить лучшую — это преимущество задним числом', () => {
    const die = queue(7, 18);
    const first = rollLead(d20, die);
    const seen = seeRoll(first, { kind: 'add', count: 1, keep: 'best' }, die);
    deepEq(seen.rolls, [7, 18]);
    eq(seen.total, 18);
    eq(seen.kept, 18);
  });

  test('перебросить провалы пула: кости выше порога не трогаются', () => {
    const die = queue(2, 6, 4, 5, 3);
    const first = rollLead(pool, die);
    eq(first.total, 1, 'одна шестёрка — один успех');
    const seen = seeRoll(first, { kind: 'reroll', upTo: 4 }, die);
    deepEq(seen.rolls, [5, 6, 3]);
    eq(seen.total, 2);
  });

  test('прибавить число — итог растёт, натуральная кость нет', () => {
    const die = queue(12);
    const seen = seeRoll(rollLead(d20, die), { kind: 'plus', value: 4 }, die);
    eq(seen.total, 16);
    deepEq(seen.raw, [12]);
  });
});
