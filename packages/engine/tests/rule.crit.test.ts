import { group, test, eq, ok } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';
import { multiplyNotation } from '../src/engine/dice.ts';
import type { System, Sheet, Effect } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  fields: [
    { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 30 } },
    { tag: 'броня', label: 'Броня', value: { kind: 'stored', type: 'number', default: 10 } },
  ],
  effects: {},
  constants: { к20: { label: 'Кость проверки', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
} as unknown as System;

const sheet = (id: string): Sheet => ({
  id, systemId: 'x', kind: 'pc', name: id, values: { хиты: 30, броня: 10 },
  equipped: [], actions: [], effects: [],
} as unknown as Sheet);

const steps = [
  { id: 'удар', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { tag: 'броня' } },
  {
    id: 'урон', type: 'amount', source: 'roll', dice: { const: '2d6' },
    double: { ref: 'удар.natural', atLeast: 20 },
  },
  { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { ref: 'урон' } },
];

const play = (rolls: number[]) => {
  let at = 0;
  const die = () => rolls[at++] ?? 1;
  const effect = { label: 'e', activation: 'manual', steps } as unknown as Effect;
  const from = sheet('а');
  const to = sheet('б');
  const packed = packRule(effect, {
    system, sheet: from, pass: newPass(system, from, { compendium: { items: [], actions: [] } }),
    die, owner: 'тест',
  } as never);
  const out = resolveRule(packed, {
    system, sheet: to, pass: newPass(system, to, { compendium: { items: [], actions: [] } }),
    die, owner: 'тест',
  } as never);
  return { packed, out, used: at };
};

group('крит: кости удваиваются до броска', () => {
  test('запись костей умножается, а не дописывается', () => {
    eq(multiplyNotation('2d6', 2), '4d6');
    eq(multiplyNotation('к8', 2), '2d8');
    eq(multiplyNotation('1к20', 3), '3d20');
  });

  test('на двадцатке кидается вдвое больше костей, и лишних бросков нет', () => {
    const crit = play([20, 4, 4, 4, 4]);
    const packedDice = (crit.packed[1] as unknown as { rolled: { rolls: number[] } }).rolled.rolls;
    eq(packedDice.length, 4, 'четыре кости вместо двух');
    eq(crit.used, 5, 'один бросок проверки и четыре кости урона — ни одного лишнего');
    eq(crit.out.sheet.values.хиты, 14);
  });

  test('без двадцатки — обычные две кости и ни одного лишнего броска', () => {
    const plain = play([19, 4, 4]);
    const packedDice = (plain.packed[1] as unknown as { rolled: { rolls: number[] } }).rolled.rolls;
    eq(packedDice.length, 2);
    eq(plain.used, 3);
    eq(plain.out.sheet.values.хиты, 22);
  });

  test('в трассе видно, что кости удвоены', () => {
    const crit = play([20, 1, 1, 1, 1]);
    const trace = crit.out.trace.find(line => line.step === 'урон') as { doubled?: boolean };
    ok(trace?.doubled === true, JSON.stringify(trace));
    const plain = play([5, 1, 1]);
    const quiet = plain.out.trace.find(line => line.step === 'урон') as { doubled?: boolean };
    eq(quiet?.doubled, undefined);
  });

  test('условие смотрит на кости, а не на итог с прибавкой', () => {
    const withBonus = [
      { id: 'удар', type: 'threshold', roll: { die: { constant: 'к20' }, bonus: { const: 9 } }, versus: { tag: 'броня' } },
      { id: 'урон', type: 'amount', source: 'roll', dice: { const: '2d6' }, double: { ref: 'удар.natural', atLeast: 20 } },
      { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { ref: 'урон' } },
    ];
    let at = 0;
    const die = () => [15, 3, 3][at++] ?? 1;
    const from = sheet('а');
    const packed = packRule({ label: 'e', activation: 'manual', steps: withBonus } as unknown as Effect, {
      system, sheet: from, pass: newPass(system, from, { compendium: { items: [], actions: [] } }),
      die, owner: 'тест',
    } as never);
    const rolls = (packed[1] as unknown as { rolled: { rolls: number[] } }).rolled.rolls;
    eq(rolls.length, 2, 'итог 15+9=24, но на костях 15 — не крит');
  });
});
