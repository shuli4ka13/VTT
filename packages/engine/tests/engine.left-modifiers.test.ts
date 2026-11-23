import { group, test, eq, deepEq } from './harness.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { errorsOf, lintSystem } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', columns: [{ key: 'защита', label: 'Защита', kind: 'number' }] } },
  effects: {
    слабость: {
      label: 'Слабость', activation: 'passive', duration: { kind: 'turns', max: 3 },
      modifiers: [{ kind: 'value', target: 'защита', op: 'add', value: { expr: '0 - @left' } }],
    },
  },
} as unknown as System;
const compendium = { records: [] } as unknown as Compendium;
const sheet = (left: number): Sheet => ({ id: 'я', systemId: 'x', name: 'я', values: { защита: 5 }, has: [], effects: [{ effectId: 'слабость', turnsLeft: left }] } as unknown as Sheet);
const read = (s: Sheet): unknown => calc(system, s, 'защита', newPass(system, s, { compendium }));

group('«@left» в правке висящего', () => {
  test('правка тает вместе со сроком', () => {
    deepEq([read(sheet(3)), read(sheet(1))], [2, 4]);
  });

  test('не ошибка «Проблем»', () => {
    eq(errorsOf(lintSystem(system, compendium)).map(p => p.text).join('\n'), '');
  });
});
