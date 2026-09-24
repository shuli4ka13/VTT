import { group, test, eq, ok, throws } from './harness.ts';
import { resolveRule, packRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';
import { launchOf, activationFor } from '../src/model/effect-kinds.ts';
import type { System, Sheet, Effect } from '../src/model/types.ts';

const system = {
  id: 'x', name: 'x',
  fields: [{ tag: 'hp', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 10 } }],
  effects: {},
  constants: { d20: { kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  tables: { levels: { label: 'Ступени', key: 'range', columns: [{ key: 'value', label: 'ступень', kind: 'text' }],
    rows: [{ from: 0, to: 9, cells: { value: 'провал' } }, { from: 10, to: 99, cells: { value: 'успех' } }] } },
} as unknown as System;
const sheet = { id: 'a', systemId: 'x', name: 'А', values: { hp: 10 }, equipped: [], actions: [], effects: [] } as unknown as Sheet;
const compendium = { items: [], actions: [] };

const run = (steps: object[], die: number) => {
  const effect = { label: 'e', activation: 'manual', steps } as unknown as Effect;
  const ctx = { system, sheet, compendium, die: () => die, pass: newPass(system, sheet, { compendium }), owner: 'тест' };
  const packed = packRule(effect, ctx as never);
  return resolveRule(packed, { ...ctx, pass: newPass(system, sheet, { compendium }) } as never);
};

group('условие шага по числу и степени', () => {
  const hit = { id: 'hit', type: 'threshold', roll: { die: { constant: 'd20' }, bonus: { expr: '5' } }, versus: { expr: '1' } };

  test('«выпало на костях» — без прибавок: крит при natural ≥ 20', () => {
    const crit = { type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { expr: '7' }, when: { expr: '@hit.natural >= 20' } };
    eq(run([hit, crit], 20).sheet.values.hp, 3);
    eq(run([hit, crit], 15).sheet.values.hp, 10, 'итог 15+5=20, но на костях 15 — не крит');
  });

  test('atMost и оба края', () => {
    const low = { type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { expr: '1' }, when: { expr: '@hit.natural <= 1' } };
    eq(run([hit, low], 1).sheet.values.hp, 9);
    eq(run([hit, low], 2).sheet.values.hp, 10);
    const mid = { type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { expr: '1' }, when: { expr: 'все(@hit.natural >= 5, @hit.natural <= 10)' } };
    eq(run([hit, mid], 7).sheet.values.hp, 9);
    eq(run([hit, mid], 11).sheet.values.hp, 10);
  });

  test('«has» сравнивает степень по имени, «not» переворачивает', () => {
    const scaled = { ...hit, degrees: { table: 'levels', of: 'total' } };
    const onWin = { type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { expr: '2' }, when: { expr: 'есть(@hit.degree, "успех")' } };
    eq(run([scaled, onWin], 10).sheet.values.hp, 8);
    eq(run([scaled, onWin], 2).sheet.values.hp, 10);
    const unlessWin = { ...onWin, when: { expr: 'не(есть(@hit.degree, "успех"))' } };
    eq(run([scaled, unlessWin], 2).sheet.values.hp, 8);
  });

  test('число против не-числа — внятная ошибка', () => {
    const bad = { type: 'apply', target: { tag: 'hp' }, direction: 'subtract', value: { expr: '1' }, when: { expr: '@hit.success >= 1' } };
    throws(() => run([hit, bad], 10), 'должен быть числом');
  });
});

group('три вида запуска', () => {
  test('вид запуска выводится из подписок, activationFor пишет «кнопкой» или «висит»', () => {
    eq(launchOf({ activation: 'manual' }).kind, 'manual');
    eq(launchOf({ activation: 'passive' }).kind, 'passive');
    const triggered = launchOf({ activation: 'passive' , on: [{ on: '', to: 'other', steps: [] }] });
    eq(triggered.kind, 'auto'); eq(triggered.ask, false); eq(triggered.moment, 'after');
    const reaction = launchOf({ activation: 'passive' , on: [{ on: '', phase: 'before', ask: true, steps: [] }] });
    eq(reaction.kind, 'auto'); eq(reaction.ask, true); eq(reaction.moment, 'before');
    eq(activationFor(triggered), 'passive');
    eq(activationFor(reaction), 'passive');
    eq(activationFor({ kind: 'manual', moment: 'after', ask: false }), 'manual');
    ok(launchOf(undefined).kind === 'manual');
  });
});
