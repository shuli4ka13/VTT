import { group, test, eq, throws } from './harness.ts';
import { compile } from '../src/formula/index.ts';
import { toolsOf, } from '../src/engine/refs.ts';
import { newPass } from '../src/engine/calc.ts';
import type { System, Sheet } from '../src/model/types.ts';

const system = { id: 'к', name: 'к', fields: [], effects: {} } as unknown as System;
const sheet = { id: 'а', systemId: 'к', name: 'а', values: {}, has: [], effects: [] } as unknown as Sheet;
const run = (expr: string, ...faces: number[]) =>
  compile(expr).evaluate(() => undefined, toolsOf(system, newPass(system, sheet), 'проба', () => faces.shift() ?? 1));

group('кинуть(кость, сколько, оставить)', () => {
  test('оставить лучшие: 3к10, две лучшие', () => eq(run('кинуть("1к10", 3, 2)', 4, 9, 7), 16));
  test('оставить худшие — со знаком минус: 2к6, худшая', () => eq(run('кинуть("1к6", 2, -1)', 5, 2), 2));
  test('без третьего аргумента — сумма, как раньше', () => eq(run('кинуть("1к6", 2)', 5, 2), 7));
  test('ноль оставить нельзя — ошибка словами', () => throws(() => run('кинуть("1к6", 2, 0)'), 'сколько костей оставить'));
});
