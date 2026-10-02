import { group, test, eq, throws } from './harness.ts';
import { exchange } from './play.ts';
import { withColumn } from '../src/model/sheet-columns.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sys: any = {
  id: 'выражения',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хп', label: 'Текущие ХП', kind: 'number', default: 20 },
    { key: 'максхп', label: 'Максимум ХП', kind: 'number', default: 30 },
    { key: 'сила', label: 'Мод Силы', kind: 'number', default: 3 },
  ] } },
  effects: {},
};

const sheet = { id: 'цель', values: { хп: 20, максхп: 30, сила: 3 }, effects: [] };

const runRule = (sys: any, rule: any, sender: any, target: any, die: () => number) => {
  const full: any = {
    ...sys, tables: { ...sys.tables, приём: { shape: 'book', use: 'action', label: 'Приём' } },
    effects: { ...sys.effects, 'правило': { label: 'правило', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true }], ...rule, steps: [{ type: 'each', of: 'цели', as: 'цель' }, ...rule.steps] } },
  };
  const book: any = { records: [{ id: 'правило', table: 'приём', label: 'правило', bindings: [{ label: 'правило', effect: 'правило', args: {} }] }] };
  const from = { ...sender, id: 'действующий-теста', has: [...(sender.has ?? []), { of: 'правило' }], effects: sender.effects ?? [] };
  const out = exchange({ system: full, compendium: book, die, sheets: [from, target], actionId: 'правило:0', fromId: from.id, toId: target.id });
  const report = out.reports[0]!.report;
  return { sheet: out.sheets.find((s: any) => s.id === target.id)!, trace: report.trace as any[], stopped: report.stopped as any };
};

const run = (expr: string, ...dice: number[]) => {
  const rule: any = {
    steps: [
      { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d8')" } },
      { type: 'apply', target: { expr: '@цель.хп' }, direction: 'set', value: { expr } },
    ],
  };
  return runRule(sys, rule, sheet, sheet, queue(...dice));
};

group('новое значение поля — выражение', () => {
  test('поле минус брошенная кость: имя шага работает как имя поля', () => {
    eq(run('@цель.хп - @урон', 5).sheet.values.хп, 15, '20 − 5');
  });

  test('вычесть сумму: скобки считаются, а не подразумеваются', () => {
    eq(run('@цель.хп - (@урон + @цель.сила)', 5).sheet.values.хп, 12, '20 − (5 + 3)');
  });

  test('знаки внутри выражения работают как в математике, а не «направлением»', () => {
    eq(run('@цель.хп - @урон + @цель.сила', 5).sheet.values.хп, 18, '20 − 5 + 3 — ровно как написано');
  });

  test('поле в выражении не обязательно: «станет 0»', () => {
    eq(run('0', 5).sheet.values.хп, 0);
  });

  test('и «станет максимумом» — лечение до полного', () => {
    eq(run('@цель.максхп', 5).sheet.values.хп, 30);
  });

  test('делить тоже можно: половина от максимума', () => {
    eq(run('@цель.максхп / 2', 5).sheet.values.хп, 15);
  });

  test('одноимённое поле не мешает шагу: голое имя — это шаг, поле читается только через лист', () => {
    const collide: any = withColumn(sys as never, { key: 'урон', label: 'Урон в листе', kind: 'number', default: 100 });
    const rule: any = {
      steps: [
        { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d8')" } },
        { type: 'apply', target: { expr: '@цель.хп' }, direction: 'set', value: { expr: '@урон' } },
      ],
    };
    const sh = { ...sheet, values: { ...sheet.values, урон: 100 } };
    const r = runRule(collide, rule, sh, sh, queue(5));
    eq(r.sheet.values.хп, 5, 'считался шаг: поле урон видно только как @цель.урон');
  });

  test('имя, которого нет ни у поля, ни у шага, — внятная ошибка', () => {
    throws(() => run('@цель.нетакого', 5), 'нетакого');
  });
});
