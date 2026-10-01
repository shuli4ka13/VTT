import { group, test, eq, deepEq } from './harness.ts';
import { rollLead } from '../src/engine/lead-die.ts';
import { resolveRoll } from '../src/engine/modifiers.ts';
import { newPass } from '../src/engine/calc.ts';
import type { System, Sheet, DieConstant } from '../src/model/types.ts';

const pool: DieConstant = { label: 'к6', kind: 'die', dice: [{ count: 2, sides: 6 }], read: { kind: 'count', atLeast: 5 } } as DieConstant;
const tape = (...values: number[]) => () => values.shift() ?? 1;

const system = {
  id: 'с', name: 'с',
  tables: { лист: { shape: 'single', columns: [{ key: 'грань', label: 'Грань', kind: 'number', default: 3 }] } },
  effects: {},
  roll_edits: { выжать: { label: 'Выжать', ops: [{ op: 'addDie', count: { expr: '@грань' } }, { op: 'explode', apart: true }] } },
} as unknown as System;
const sheet = { id: 'а', systemId: 'с', name: 'А', values: { грань: 3 }, has: [], effects: [] } as unknown as Sheet;

group('правка броска с формулой и подрыв шестёрок', () => {
  test('число добавленных костей — из листа того, кто бросает', () => {
    const { edits } = resolveRoll(system, sheet, [], newPass(system, sheet), [
      { kind: 'edit', call: 'roll', param: 'edits', edit: 'выжать', source: { type: 'claim', id: 'выжать', modifiers: [] } } as never,
    ]);
    deepEq(edits[0]!.ops[0], { op: 'addDie', count: 3 });
  });

  test('подрыв: шестёрка даёт ещё кость, и каждая считается отдельно', () => {
    const edits = [{ label: 'подрыв', ops: [{ op: 'explode', apart: true }] }];
    const rolled = rollLead(pool, tape(6, 2, 5), edits as never);
    deepEq(rolled.rolls, [6, 2, 5]);
    eq(rolled.total, 2, 'шестёрка и подорванная пятёрка — два успеха');
  });
});

group('линт видит формулы в правках броска', () => {
  test('опечатка в поле — ошибка с адресом правки', async () => {
    const { lintSystem, errorsOf } = await import('../src/model/lint.ts');
    const bad = { ...system, roll_edits: { выжать: { label: 'Выжать', ops: [{ op: 'addDie', count: { expr: '@гран' } }] } } } as unknown as System;
    const errors = errorsOf(lintSystem(bad));
    eq(errors.some(e => e.where.section === 'roll_edits' && e.text.includes('гран')), true);
    eq(errorsOf(lintSystem(system)).length, 0);
  });
});
