import { group, test, eq } from './harness.ts';
import { exchange } from './play.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sys: any = {
  id: 'стороны',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хп', label: 'Хиты', kind: 'number', default: 20 },
    { key: 'сила', label: 'Мод Силы', kind: 'number' },
  ] } },
  effects: {},
};

const атакующий = { id: 'атакующий', values: { хп: 30, сила: 5 }, effects: [] };
const цель = { id: 'цель', values: { хп: 20, сила: 1 }, effects: [] };

const runRule = (sys: any, rule: any, sender: any, target: any, die: () => number) => {
  const full: any = {
    ...sys, tables: { ...sys.tables, приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: { ...sys.effects, 'правило': { label: 'правило', activation: 'manual', ...rule } },
  };
  const book: any = { records: [{ id: 'правило', table: 'приём', label: 'правило', bindings: [{ label: 'правило', effect: 'правило', args: {} }] }] };
  const from = { ...sender, id: 'отправитель-теста', has: [...(sender.has ?? []), { of: 'правило' }], effects: sender.effects ?? [] };
  const out = exchange({ system: full, compendium: book, die, sheets: [from, target], actionId: 'правило:0', fromId: from.id, toId: target.id });
  const report = out.reports[0]!.report;
  return { sheet: out.sheets.find((s: any) => s.id === target.id)!, trace: report.trace as any[], stopped: report.stopped as any };
};

const hit = (rule: any) => runRule(sys, rule, атакующий, цель, queue(4));

group('чей лист считает слагаемое', () => {
  test('прибавка ВНУТРИ числа считается отправителем — его Силой', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' }, bonus: { expr: '#сила' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', value: { expr: '@урон' } },
      ],
    };
    eq(hit(rule).sheet.values.хп, 11, '20 − (4 + Сила АТАКУЮЩЕГО 5)');
  });

  test('та же прибавка В ВЫРАЖЕНИИ считается целью — её Силой', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'set', value: { expr: '@получатель.хп - (#урон + @получатель.сила)' } },
      ],
    };
    eq(hit(rule).sheet.values.хп, 15, '20 − (4 + Сила ЦЕЛИ 1) — другое число, и молча');
  });

  test('имя с хозяином «отправитель» берёт его Силу', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'set',
          value: { expr: '@получатель.хп - (#урон + @отправитель.сила)' } },
      ],
    };
    eq(hit(rule).sheet.values.хп, 11, '20 − (4 + Сила АТАКУЮЩЕГО 5): та же формула, другая сторона');
  });

  test('в одном выражении живут оба листа', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'amount', source: 'roll', dice: { const: '1d8' } },
        { type: 'apply', target: { tag: 'хп' }, direction: 'set',

          value: { expr: '@получатель.хп - #урон - @отправитель.сила + @отправитель.сила' } },
      ],
    };

    eq(hit(rule).sheet.values.хп, 16, '20 − 4 − 5 + 5: оба вхождения имени считает отправитель');
  });
});
