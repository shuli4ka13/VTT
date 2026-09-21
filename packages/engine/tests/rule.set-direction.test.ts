import { group, test, eq } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';

const TOUGH = {
  ...system,
  effects: {
    ...system.effects,
    tough: {
      label: 'Толстая кожа', activation: 'passive', duration: { kind: 'permanent' },
      modifiers: [{ kind: 'value', target: 'incoming:hp_current', op: 'mul', value: 0.5, stacking: 'max', condition: null }],
    },
  },
} as any;

const run = (steps: any[], target: any, sys: any = TOUGH) => {
  const packed = packRule({ params: [], steps } as any, {
    system: sys, sheet: arven, pass: newPass(sys, arven, { compendium }),
    die: () => 1, params: {}, props: null, owner: 'тест',
  });
  return resolveRule(packed, {
    system: sys, sheet: target, pass: newPass(sys, target, { compendium }),
    die: () => 1, owner: 'тест',
  });
};

const stony = { ...mirra, values: { ...mirra.values, hp_current: 22 }, effects: [{ effectId: 'tough' }] };
const eight = { id: 'dmg', type: 'amount', source: 'item', fixed: { const: 8 } };

group('направление «задать» и сопротивления цели', () => {
  test('сопротивление режет РАЗНИЦУ, а не итоговое значение поля', () => {
    const r = run([
      eight,
      { type: 'apply', target: { tag: 'hp_current' }, direction: 'set',
        value: { expr: '#hp_current - #dmg', of: 'target' }, targetModifiers: true },
    ], stony);
    eq(r.sheet.values.hp_current, 18, '22 − floor(8 × 0.5) = 18, а не floor(14 × 0.5) = 7');
    eq(r.trace[1]!.incoming, 8);
    eq(r.trace[1]!.amount, 4);
  });

  test('«вычесть» с тем же числом даёт тот же итог: направления равноправны', () => {
    const r = run([
      eight,
      { type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract',
        value: { ref: 'dmg' }, targetModifiers: true },
    ], stony);
    eq(r.sheet.values.hp_current, 18);
  });

  test('без сопротивлений «задать» пишет ровно то, что сказано', () => {
    const r = run([
      eight,
      { type: 'apply', target: { tag: 'hp_current' }, direction: 'set',
        value: { expr: '#hp_current - #dmg', of: 'target' }, targetModifiers: false },
    ], stony);
    eq(r.sheet.values.hp_current, 14);
  });

  test('«задать» вверх — лечение: сопротивление режет прибавку', () => {
    const r = run([
      { type: 'apply', target: { tag: 'hp_current' }, direction: 'set',
        value: { const: 30 }, targetModifiers: true },
    ], { ...stony, values: { ...stony.values, hp_max: 40 } });
    eq(r.sheet.values.hp_current, 26, '22 + floor(8 × 0.5)');
  });

  test('текстовое поле «задать» по-прежнему просто присваивает', () => {
    const r = run([
      { type: 'apply', target: { tag: 'alignment' }, direction: 'set', value: { const: 'хаотично-добрый' } },
    ], stony);
    eq(r.sheet.values.alignment, 'хаотично-добрый');
  });
});
