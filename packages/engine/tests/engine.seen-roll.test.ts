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

group('увидев кости: по ревью', () => {
  const adv = { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } as never;
  const apart = { label: 'Подрыв', ops: [{ op: 'explode', apart: true }] } as never;

  test('прибавка не делает натуральную кость натуральной двадцаткой', () => {
    const die = queue(17);
    const seen = seeRoll(rollLead(d20, die), { kind: 'plus', value: 3 }, die);
    eq(seen.total, 20);
    eq(seen.natural, 17);
  });

  test('перебросить трогает только взятые кости: отброшенная преимуществом остаётся', () => {
    const die = queue(3, 15, 9);
    const first = rollLead(d20, die, [adv]);
    eq(first.total, 15);
    const seen = seeRoll(first, { kind: 'reroll', upTo: 5 }, die);
    deepEq(seen.rolls, [3, 15], 'тройка отброшена — не перебрасывается');
  });

  test('переброс единиц виден в счёте единиц, даже когда были взрывы', () => {
    const die = queue(6, 1, 2, 4, 5);
    const first = rollLead({ ...pool, dice: [{ count: 3, sides: 6 }] } as DieConstant, die, [apart]);
    eq(first.tally.atMin, 1);
    const seen = seeRoll(first, { kind: 'reroll', upTo: 1 }, die);
    eq(seen.tally.atMin, 0, 'единицу перебросили — сбоя по ней нет');
    eq(seen.rolls.length, 4, 'взорванная шестёрка со своим довеском на месте');
  });

  test('подрыв во всём наборе не взрывает второй раз уже взорванное', () => {
    const die = queue(6, 3, 2, 5, 4);
    const first = rollLead({ ...pool, dice: [{ count: 2, sides: 6 }] } as DieConstant, die, [apart]);
    eq(first.rolls.length, 3, 'шестёрка дала довесок');
    const seen = seeRoll(first, { kind: 'add', count: 1, explode: true }, die);
    eq(seen.rolls.length, 4, 'добавлена одна кость, старая шестёрка второй довесок не получила');
  });
});
