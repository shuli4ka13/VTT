import { group, test, eq } from './harness.ts';
import { exchange } from './play.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';

const TOUGH = {
  ...system,
  effects: {
    ...system.effects,
    tough: {
      label: 'Толстая кожа', activation: 'passive', duration: { kind: 'permanent' },
      modifiers: [{ kind: 'value', target: 'incoming:hp_current', op: 'mul', value: { expr: '0.5' }, stacking: 'max' }],
    },
  },
} as any;

const runRule = (sys: any, rule: any, sender: any, target: any, die: () => number, base: any = { records: [] }) => {
  const full: any = {
    ...sys, tables: { ...sys.tables, приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: { ...sys.effects, 'правило': { label: 'правило', activation: 'manual', ...rule } },
  };
  const book: any = { ...base, records: [...base.records, { id: 'правило', table: 'приём', label: 'правило', bindings: [{ label: 'правило', effect: 'правило', args: {} }] }] };
  const from = { ...sender, id: 'отправитель-теста', has: [...(sender.has ?? []), { of: 'правило' }], effects: sender.effects ?? [] };
  const out = exchange({ system: full, compendium: book, die, sheets: [from, target], actionId: 'правило:0', fromId: from.id, toId: target.id });
  const report = out.reports[0]!.report;
  return { sheet: out.sheets.find((s: any) => s.id === target.id)!, trace: report.trace as any[], stopped: report.stopped as any };
};

const run = (steps: any[], target: any, sys: any = TOUGH) => runRule(sys, { params: [], steps }, arven, target, () => 1, compendium);

const stony = { ...mirra, values: { ...mirra.values, hp_current: 22 }, effects: [{ effectId: 'tough' }] };
const eight = { id: 'dmg', type: 'amount', source: 'item', fixed: { expr: '8' } };

group('направление «задать» и сопротивления цели', () => {
  test('сопротивление режет РАЗНИЦУ, а не итоговое значение поля', () => {
    const r = run([
      eight,
      { type: 'apply', target: { tag: 'hp_current' }, direction: 'set',
        value: { expr: '@получатель.hp_current - #dmg' }, targetModifiers: true },
    ], stony);
    eq(r.sheet.values.hp_current, 18, '22 − округлить вниз(8 × 0.5) = 18, а не округлить вниз(14 × 0.5) = 7');
    eq(r.trace[1]!.incoming, 8);
    eq(r.trace[1]!.amount, 4);
  });

  test('«вычесть» с тем же числом даёт тот же итог: направления равноправны', () => {
    const r = run([
      eight,
      { type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract',
        value: { expr: '@dmg' }, targetModifiers: true },
    ], stony);
    eq(r.sheet.values.hp_current, 18);
  });

  test('без сопротивлений «задать» пишет ровно то, что сказано', () => {
    const r = run([
      eight,
      { type: 'apply', target: { tag: 'hp_current' }, direction: 'set',
        value: { expr: '@получатель.hp_current - #dmg' }, targetModifiers: false },
    ], stony);
    eq(r.sheet.values.hp_current, 14);
  });

  test('«задать» вверх — лечение: сопротивление режет прибавку', () => {
    const r = run([
      { type: 'apply', target: { tag: 'hp_current' }, direction: 'set',
        value: { expr: '30' }, targetModifiers: true },
    ], { ...stony, values: { ...stony.values, hp_max: 40 } });
    eq(r.sheet.values.hp_current, 26, '22 + округлить вниз(8 × 0.5)');
  });

  test('текстовое поле «задать» по-прежнему просто присваивает', () => {
    const r = run([
      { type: 'apply', target: { tag: 'alignment' }, direction: 'set', value: { expr: '"хаотично-добрый"' } },
    ], stony);
    eq(r.sheet.values.alignment, 'хаотично-добрый');
  });
});
