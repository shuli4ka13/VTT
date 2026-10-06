import { group, test, eq, throws } from './harness.ts';
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
    effects: { ...sys.effects, 'правило': { label: 'правило', activation: 'manual', params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }], ...rule, steps: [{ type: 'each', of: 'цели' }, ...rule.steps] } },
  };
  const book: any = { records: [{ id: 'правило', table: 'приём', label: 'правило', bindings: [{ label: 'правило', effect: 'правило', args: {} }] }] };
  const from = { ...sender, id: 'действующий-теста', has: [...(sender.has ?? []), { of: 'правило' }], effects: sender.effects ?? [] };
  const out = exchange({ system: full, compendium: book, die, sheets: [from, target], actionId: 'правило:0', fromId: from.id, toId: target.id });
  const report = out.reports[0]!.report;
  return { sheet: out.sheets.find((s: any) => s.id === target.id)!, trace: report.trace as any[], stopped: report.stopped as any };
};

const hit = (rule: any) => runRule(sys, rule, атакующий, цель, queue(4));

const sub = { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '@урон' } };
const setHp = (expr: string) => ({ type: 'apply', target: { expr: '@цель.хп' }, direction: 'set', value: { expr } });

group('чей лист считает слагаемое: имя листа называет автор', () => {
  test('прибавка внутри числа — Сила действующего, если так написано', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d8') + @действующий.сила" } },
        sub,
      ],
    };
    eq(hit(rule).sheet.values.хп, 11, '20 − (4 + Сила АТАКУЮЩЕГО 5)');
  });

  test('та же прибавка силой цели — другое число', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d8')" } },
        setHp('@цель.хп - (@урон + @цель.сила)'),
      ],
    };
    eq(hit(rule).sheet.values.хп, 15, '20 − (4 + Сила ЦЕЛИ 1)');
  });

  test('в одном выражении живут оба листа, каждый под своим именем', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d8')" } },
        setHp('@цель.хп - @урон - @действующий.сила + @цель.сила'),
      ],
    };
    eq(hit(rule).sheet.values.хп, 12, '20 − 4 − 5 + 1');
  });

  test('голое имя поля — ошибка словами: чьё поле?', () => {
    const rule: any = {
      steps: [
        { id: 'урон', type: 'roll', fixed: { expr: "кинуть('1d8')" } },
        setHp('@цель.хп - (@урон + @сила)'),
      ],
    };
    throws(() => hit(rule), 'чьё поле');
  });
});
