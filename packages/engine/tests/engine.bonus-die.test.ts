import { group, test, eq, deepEq } from './harness.ts';
import { rollLead } from './kit.ts';
import type { DieConstant, RollEdit } from '../src/model/types.ts';

const к20: DieConstant = { label: 'Кость проверки', kind: 'die', dice: [{ count: 1, sides: 20 }] };

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => rest.shift() ?? 1;
};

const edit = (label: string, ops: object[]): RollEdit => ({ label, ops } as RollEdit);

group('кость сверх и порог кости', () => {
  const advantage = edit('Преимущество', [{ op: 'addDie' }, { op: 'keepBest', n: 1 }]);
  const blessing = edit('Благословение', [{ op: 'bonusDie', sides: 4 }]);

  test('благословение складывается с преимуществом: лучшая к20 плюс к4', () => {
    const rolled = rollLead(к20, queue(7, 19, 3), [advantage, blessing]);
    deepEq(rolled.rolls, [7, 19, 3], 'кинуты обе к20 и к4');
    eq(rolled.total, 22, 'оставили 19 и прибавили кость сверх 3');
  });

  test('«считать не меньше 10» поднимает низкий бросок и не трогает высокий', () => {
    const reliable = edit('Надёжный талант', [{ op: 'floorDie', least: 10 }]);
    eq(rollLead(к20, queue(4), [reliable]).total, 10);
    eq(rollLead(к20, queue(17), [reliable]).total, 17);
  });

  test('порог кости срабатывает после переброса и до выбора лучшей', () => {
    const both = edit('Надёжный с преимуществом', [
      { op: 'addDie' }, { op: 'keepBest', n: 1 }, { op: 'floorDie', least: 10 },
    ]);
    eq(rollLead(к20, queue(3, 5), [both]).total, 10);
  });
});
