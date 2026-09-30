import { group, test, eq, ok } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import { newPass } from '../src/engine/calc.ts';

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const sys = {
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

const rule = {
  steps: [{
    id: 'try', type: 'threshold',
    roll: { die: { constant: 'pool_die' }, bonus: { expr: '0' }, check: null },
    versus: { expr: '2' },
  }],
};

const run = (sheet, ...dice) => {
  const ctx = () => ({
    system: sys, sheet, params: {}, item: null,
    die: queue(...dice), pass: newPass(sys, sheet),
  });
  return resolveRule(packRule(rule, ctx()), ctx());
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
