import { group, test, eq, ok } from './harness.ts';
import { exchange } from './play.ts';
import { times, parse, notationOf } from '../src/core/dice.ts';

const multiplyNotation = (notation: unknown, n: number): string => notationOf(times(parse(String(notation)), Math.max(1, Math.floor(n)))).replace('к', 'd');
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хиты', label: 'Хиты', kind: 'number', default: 30 },
    { key: 'броня', label: 'Броня', kind: 'number', default: 10 },
  ] } },
  effects: {},
  constants: { к20: { label: 'Кость проверки', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
} as unknown as System;

const sheet = (id: string): Sheet => ({
  id, systemId: 'x', name: id, values: { хиты: 30, броня: 10 },
  has: [{ of: 'е' }], effects: [],
} as unknown as Sheet);

const book = { records: [{ id: 'е', table: 'действие', label: 'е', bindings: [{ label: 'е', effect: 'е', args: {} }] }] } as unknown as Compendium;

const resolve = (stepList: unknown[], rolls: number[]) => {
  let at = 0;
  const die = () => rolls[at++] ?? 1;
  const sys = {
    ...system,
    tables: { ...system.tables, действие: { shape: 'book', use: 'action', label: 'Действие' } },
    effects: { е: { label: 'e', activation: 'manual', steps: stepList } },
  } as unknown as System;
  const out = exchange({ system: sys, compendium: book, die, sheets: [sheet('а'), sheet('б')], actionId: 'е:0', fromId: 'а', toId: 'б' });
  const report = out.reports.find(r => r.toId === 'б')!.report;
  const target = out.sheets.find(x => x.id === 'б')!;
  return { out: { sheet: target, trace: report.trace as Record<string, unknown>[] }, used: at };
};
const damageDice = (trace: Record<string, unknown>[]) => (trace.find(line => line.step === 'урон') as { rolls: number[] }).rolls;

const steps = [
  { id: 'удар', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { expr: '@получатель.броня' } },
  {
    id: 'урон', type: 'amount', source: 'roll', dice: { const: '2d6' },
    double: { expr: '@удар.natural >= 20' },
  },
  { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@урон' } },
];

const play = (rolls: number[]) => resolve(steps, rolls);

group('крит: кости удваиваются до броска', () => {
  test('запись костей умножается, а не дописывается', () => {
    eq(multiplyNotation('2d6', 2), '4d6');
    eq(multiplyNotation('к8', 2), '2d8');
    eq(multiplyNotation('1к20', 3), '3d20');
  });

  test('на двадцатке кидается вдвое больше костей, и лишних бросков нет', () => {
    const crit = play([20, 4, 4, 4, 4]);
    eq(damageDice(crit.out.trace).length, 4, 'четыре кости вместо двух');
    eq(crit.used, 5, 'один бросок проверки и четыре кости урона — ни одного лишнего');
    eq(crit.out.sheet.values.хиты, 14);
  });

  test('без двадцатки — обычные две кости и ни одного лишнего броска', () => {
    const plain = play([19, 4, 4]);
    eq(damageDice(plain.out.trace).length, 2);
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
      { id: 'удар', type: 'threshold', roll: { die: { constant: 'к20' }, bonus: { expr: '9' } }, versus: { expr: '@получатель.броня' } },
      { id: 'урон', type: 'amount', source: 'roll', dice: { const: '2d6' }, double: { expr: '@удар.natural >= 20' } },
      { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@урон' } },
    ];
    const rolls = damageDice(resolve(withBonus, [15, 3, 3]).out.trace);
    eq(rolls.length, 2, 'итог 15+9=24, но на костях 15 — не крит');
  });
});

group('доля величины: половина при удачном спасброске', () => {
  const chain = (times: number) => [
    { id: 'спас', type: 'threshold', side: 'target', roll: { die: { constant: 'к20' } }, versus: { expr: '10' }, continueOn: 'always' },
    { id: 'урон', type: 'amount', source: 'roll', dice: { const: '2d6' }, scale: { times, when: { expr: '@спас.success' } } },
    { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@урон' } },
  ];

  const run = (rolls: number[], times = 0.5) => resolve(chain(times), rolls);

  test('спасся — половина, провалил — полный урон, кости кидаются один раз', () => {
    const saved = run([5, 5, 15]);
    eq(saved.out.sheet.values.хиты, 25, 'урон 10 пополам');
    const failed = run([5, 5, 3]);
    eq(failed.out.sheet.values.хиты, 20, 'урон 10 целиком');
    eq(saved.used, 3, 'две кости урона и один спасбросок');
  });

  test('доля округляется вниз и видна в трассе', () => {
    const saved = run([3, 4, 15]);
    eq(saved.out.sheet.values.хиты, 27, 'семь пополам — три');
    const trace = saved.out.trace.find(line => line.step === 'урон') as { share?: number; full?: number };
    eq(trace?.share, 0.5);
    eq(trace?.full, 7);
  });

  test('чужая доля тоже работает: треть', () => {
    eq(run([6, 6, 15], 1 / 3).out.sheet.values.хиты, 26);
  });
});
