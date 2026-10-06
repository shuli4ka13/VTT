import { group, test, eq, deepEq } from './harness.ts';
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

const ACTOR = { key: 'действующий', kind: 'sheet' };
const TARGETS = { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } };
const EACH = { type: 'each', of: 'цели' };

const resolve = (stepList: unknown[], rolls: number[]) => {
  let at = 0;
  const die = () => rolls[at++] ?? 1;
  const sys = {
    ...system,
    tables: { ...system.tables, действие: { shape: 'book', use: 'action', label: 'Действие' } },
    effects: { е: { label: 'e', activation: 'manual', params: [ACTOR, TARGETS], steps: [EACH, ...stepList] } },
  } as unknown as System;
  const out = exchange({ system: sys, compendium: book, die, sheets: [sheet('а'), sheet('б')], actionId: 'е:0', fromId: 'а', toId: 'б' });
  const report = out.reports.find(r => r.toId === 'б')!.report;
  const target = out.sheets.find(x => x.id === 'б')!;
  return { out: { sheet: target, trace: report.trace as Record<string, unknown>[] }, used: at };
};
const damageDice = (trace: Record<string, unknown>[]) => (trace.find(line => line.step === 'урон') as { rolls: number[] }).rolls;

const attack = (bonus?: string) => [
  { id: 'удар_бросок', type: 'roll', die: 'к20', ...(bonus ? { bonus: { expr: bonus } } : {}), by: { expr: '@действующий' }, against: { expr: '@цель' } },
  { id: 'удар', type: 'check', value: { expr: '@удар_бросок' }, versus: { expr: '@цель.броня' } },
];
const hurt = { type: 'apply', target: { expr: '@цель.хиты' }, direction: 'subtract', value: { expr: '@урон' } };
const damage = { id: 'урон', type: 'roll', fixed: { expr: "кинуть('2d6', если(@удар.natural >= 20, 2, 1))" } };

const steps = [...attack(), damage, hurt];

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

  test('в трассе урона видны все выпавшие кости', () => {
    const crit = play([20, 1, 2, 3, 4]);
    deepEq(damageDice(crit.out.trace), [1, 2, 3, 4]);
    const plain = play([15, 1, 2]);
    deepEq(damageDice(plain.out.trace), [1, 2]);
  });

  test('условие смотрит на кости, а не на итог с прибавкой', () => {
    const rolls = damageDice(resolve([...attack('9'), damage, hurt], [15, 3, 3]).out.trace);
    eq(rolls.length, 2, 'итог 15+9=24, но на костях 15 — не крит');
  });
});

group('доля величины: половина при удачном спасброске', () => {
  const chain = (times: number) => [
    { id: 'спас_бросок', type: 'roll', die: 'к20', by: { expr: '@цель' }, against: { expr: '@действующий' } },
    { id: 'спас', type: 'check', value: { expr: '@спас_бросок' }, versus: { expr: '10' }, continueOn: 'always' },
    { id: 'всего', type: 'roll', fixed: { expr: "кинуть('2d6')" } },
    { id: 'урон', type: 'roll', fixed: { expr: `если(@спас.success, округлить вниз(@всего * ${times}), @всего)` } },
    hurt,
  ];

  const run = (rolls: number[], times = 0.5) => resolve(chain(times), rolls);

  test('спасся — половина, провалил — полный урон, кости кидаются один раз', () => {
    const saved = run([15, 5, 5]);
    eq(saved.out.sheet.values.хиты, 25, 'урон 10 пополам');
    const failed = run([3, 5, 5]);
    eq(failed.out.sheet.values.хиты, 20, 'урон 10 целиком');
    eq(saved.used, 3, 'две кости урона и один спасбросок');
  });

  test('доля округляется вниз и видна в трассе', () => {
    const saved = run([15, 3, 4]);
    eq(saved.out.sheet.values.хиты, 27, 'семь пополам — три');
    const whole = saved.out.trace.find(line => line.step === 'всего') as { fixed?: number };
    const half = saved.out.trace.find(line => line.step === 'урон') as { fixed?: number };
    eq(whole?.fixed, 7);
    eq(half?.fixed, 3);
  });

  test('чужая доля тоже работает: треть', () => {
    eq(run([15, 6, 6], 1 / 3).out.sheet.values.хиты, 26);
  });
});
