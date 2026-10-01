import { group, test, eq, ok } from './harness.ts';
import { exchange } from './play.ts';

const queue = (...values: number[]) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift()!;
  };
};

const sys: any = {
  id: 'пул-из-листа',
  constants: {
    pool_die: {
      label: 'Пул',
      kind: 'die',
      dice: [{ count: { expr: '@pool' }, sides: 6 }],
      read: { kind: 'count', atLeast: 5 },
    },
  },
  tables: { лист: { shape: 'single', columns: [
    { key: 'pool', label: 'Пул костей', kind: 'number', default: 4 },
  ] } },
};

const rule: any = {
  steps: [{
    id: 'try', type: 'threshold',
    roll: { die: { constant: 'pool_die' }, bonus: { expr: '0' }, check: null },
    versus: { expr: '2' },
  }],
};

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

const run = (sheet: any, ...dice: number[]) => {
  const out = runRule(sys, rule, sheet, { id: 'цель-теста', values: {}, effects: [] }, queue(...dice));
  const t = out.trace[0]!;
  return { results: { try: { total: t.total, success: t.success, margin: t.margin } } as any };
};

group('бросок пулом из листа', () => {
  const sheet = { id: 'бегущий', values: { pool: 4 }, effects: [] };

  test('костей бросается столько, сколько говорит поле; total — успехи', () => {
    const r = run(sheet, 6, 5, 2, 1);
    eq(r.results.try.total, 2, 'из [6, 5, 2, 1] успехов два');
    ok(r.results.try.success, 'два успеха против порога 2 — взят');
    eq(r.results.try.margin, 0, 'чистых успехов сверх порога нет');
  });

  test('пул меняется правкой ЛИСТА — система и правило не трогаются', () => {
    const narrow = { id: 'раненый', values: { pool: 2 }, effects: [] };
    const r = run(narrow, 6, 2);
    eq(r.results.try.total, 1, 'кинуто ровно две кости');
    ok(!r.results.try.success, 'одного успеха против двух мало');
  });
});
