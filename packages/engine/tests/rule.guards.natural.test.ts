import { group, test, eq, ok, throws } from './harness.ts';
import { exchange } from './play.ts';
import { launchOf, activationFor } from '../src/model/effect-kinds.ts';
import type { System, Sheet } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  effects: {},
  constants: { d20: { kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  tables: { лист: { shape: 'single', columns: [{ key: 'hp', label: 'Хиты', kind: 'number', default: 10 }] }, levels: { label: 'Ступени', key: 'range', columns: [{ key: 'value', label: 'ступень', kind: 'text' }],
    rows: [{ from: 0, to: 9, cells: { value: 'провал' } }, { from: 10, to: 99, cells: { value: 'успех' } }] } },
} as unknown as System;
const sheet = { id: 'a', systemId: 'x', name: 'А', values: { hp: 10 }, has: [], effects: [] } as unknown as Sheet;

const run = (steps: object[], die: number) => {
  const full = {
    ...system, tables: { ...system.tables, приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: { e: { label: 'e', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }], steps: [{ type: 'each', of: 'цели' }, ...steps] } },
  } as unknown as System;
  const book = { records: [{ id: 'e', table: 'приём', label: 'e', bindings: [{ label: 'e', effect: 'e', args: {} }] }] };
  const from = { ...sheet, id: 'from', has: [{ of: 'e' }] } as unknown as Sheet;
  const out = exchange({ system: full, compendium: book as never, die: () => die, sheets: [from, sheet], actionId: 'e:0', fromId: 'from', toId: 'a' });
  return { sheet: out.sheets.find(s => s.id === 'a')! };
};

group('условие шага по числу и степени', () => {
  const roll = { id: 'hit_бросок', type: 'roll', die: 'd20', bonus: { expr: '5' }, by: { expr: '@действующий' } };
  const hit = { id: 'hit', type: 'check', value: { expr: '@hit_бросок' }, versus: { expr: '1' } };
  const guard = [{ type: 'branch', if: { expr: 'not @hit.success' } }, { type: 'stop' }, { type: 'end' }];
  const when = (expr: string, step: object) => [{ type: 'branch', if: { expr } }, step, { type: 'end' }];
  const sub = (amount: string) => ({ type: 'apply', target: { expr: '@цель.hp' }, direction: 'subtract', value: { expr: amount } });

  test('«выпало на костях» — без прибавок: крит при natural ≥ 20', () => {
    const crit = when('@hit.natural >= 20', sub('7'));
    eq(run([roll, hit, ...guard, ...crit], 20).sheet.values.hp, 3);
    eq(run([roll, hit, ...guard, ...crit], 15).sheet.values.hp, 10, 'итог 15+5=20, но на костях 15 — не крит');
  });

  test('atMost и оба края', () => {
    const low = when('@hit.natural <= 1', sub('1'));
    eq(run([roll, hit, ...guard, ...low], 1).sheet.values.hp, 9);
    eq(run([roll, hit, ...guard, ...low], 2).sheet.values.hp, 10);
    const mid = when('@hit.natural >= 5 and @hit.natural <= 10', sub('1'));
    eq(run([roll, hit, ...guard, ...mid], 7).sheet.values.hp, 9);
    eq(run([roll, hit, ...guard, ...mid], 11).sheet.values.hp, 10);
  });

  test('«has» сравнивает степень по имени, «not» переворачивает', () => {
    const scaled = { ...hit, degrees: { table: 'levels', of: 'total' } };
    const onWin = when('has(@hit.degree, "успех")', sub('2'));
    eq(run([roll, scaled, ...guard, ...onWin], 10).sheet.values.hp, 8);
    eq(run([roll, scaled, ...guard, ...onWin], 2).sheet.values.hp, 10);
    const unlessWin = when('not has(@hit.degree, "успех")', sub('2'));
    eq(run([roll, scaled, ...guard, ...unlessWin], 2).sheet.values.hp, 8);
  });

  test('число против не-числа — внятная ошибка', () => {
    const bad = when('@hit.success >= 1', sub('1'));
    throws(() => run([roll, hit, ...guard, ...bad], 10), 'должен быть числом');
  });
});

group('три вида запуска', () => {
  test('вид запуска выводится из подписок, activationFor пишет «кнопкой» или «висит»', () => {
    eq(launchOf({ activation: 'manual' }).kind, 'manual');
    eq(launchOf({ activation: 'passive' }).kind, 'passive');
    const triggered = launchOf({ activation: 'passive' , on: [{ on: 'after:удар', steps: [] }] });
    eq(triggered.kind, 'auto'); eq(triggered.confirm, false); eq(triggered.moment, 'after');
    const reaction = launchOf({ activation: 'passive' , on: [{ on: 'before:удар', confirm: {}, steps: [] }] });
    eq(reaction.kind, 'auto'); eq(reaction.confirm, true); eq(reaction.moment, 'before');
    eq(activationFor(triggered), 'passive');
    eq(activationFor(reaction), 'passive');
    eq(activationFor({ kind: 'manual', moment: 'after', confirm: false }), 'manual');
    ok(launchOf(undefined).kind === 'manual');
  });
});
