import { group, test, eq, ok } from './harness.ts';
import { slots } from '../src/engine/steps/threshold.ts';
import { runSteps } from './legacy.ts';
import { exchange } from './play.ts';

const queue = (...values) => { let i = 0; return () => values[i++] ?? 1; };

const sys = {
  id: 'направление-успеха',
  constants: { lead_die: { label: 'Сотка', kind: 'die', dice: [{ count: 1, sides: 100 }] } },
  tables: {},
};
const sheet = { id: 'испытуемый', values: {}, effects: [] };

const run = (successWhen, rolled, versus, extra = {}) => {
  const rule = {
    steps: [{
      id: 'try', type: 'threshold',
      ...(successWhen ? { successWhen } : {}),
      roll: { die: { constant: 'lead_die' }, bonus: { expr: '0' }, check: null },
      versus: { expr: `${JSON.stringify(versus)}` },
      ...extra,
    }],
  };
  const ran = runSteps(sys as never, [sheet as never], sheet.id, rule.steps as never, queue(rolled));
  return ran as unknown as { results: Record<string, any>; stopped: unknown };
};

group('порог: направление успеха объявляется слотом', () => {
  test('умолчание — как было: не меньше порога, равенство в пользу бросающего', () => {
    ok(run(null, 15, 15).results.try.success, 'ровно порог — взят');
    ok(!run(null, 14, 15).results.try.success, 'недобор — не взят');
  });

  test('notOver — бросок «вниз»: d100 не выше навыка (CoC, GURPS)', () => {
    ok(run('notOver', 40, 40).results.try.success, 'ровно навык — успех');
    const good = run('notOver', 15, 40);
    ok(good.results.try.success);
    eq(good.results.try.margin, 25, 'запас — в пользу бросающего, а не «total − versus»');
    const bad = run('notOver', 41, 40);
    ok(!bad.results.try.success);
    eq(bad.results.try.margin, -1, 'перебор — недобор со знаком минус');
  });

  test('over и under — миры, где равенство это провал', () => {
    ok(!run('over', 15, 15).results.try.success);
    ok(run('over', 16, 15).results.try.success);
    ok(!run('under', 40, 40).results.try.success);
    ok(run('under', 39, 40).results.try.success);
  });

  test('обрыв цепочки следует направлению: не взял «вниз» — стоп', () => {
    ok(run('notOver', 90, 40).stopped, 'провал броска вниз обрывает цепочку');
    ok(!run('notOver', 10, 40).stopped, 'успех — цепочка живёт');
  });

  test('порог на стороне цели бросает цель и следует направлению', () => {
    const world = {
      id: 'спасбросок', name: 'спасбросок',
      constants: { lead_die: { label: 'Сотка', kind: 'die', dice: [{ count: 1, sides: 100 }] } },
      tables: {
        лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }] },
        приём: { shape: 'book', use: 'action', label: 'Приём' },
      },
      effects: {
        спас: {
          label: 'Спасбросок', activation: 'manual',
          steps: [{
            id: 'try', type: 'threshold', side: 'target', successWhen: 'notOver',
            roll: { die: { constant: 'lead_die' }, bonus: { expr: '0' }, check: null },
            versus: { expr: '40' },
          }],
        },
      },
    };
    const book = { records: [{ id: 'спас', table: 'приём', label: 'Спас', bindings: [{ label: 'Спас', effect: 'спас', args: {} }] }] };
    const mk = (id: string) => ({ id, systemId: 'спасбросок', name: id, values: {}, has: [{ of: 'спас' }], effects: [] });
    const out = exchange({
      system: world as never, compendium: book as never, die: queue(15), sheets: [mk('бросающий') as never, mk('цель') as never],
      actionId: 'спас:0', fromId: 'бросающий', toId: 'цель',
    });
    const trace = out.reports[0]!.report.trace.find(t => t.step === 'try') as { success: boolean; margin: number; natural: number };
    ok(trace.success, 'цель бросила 15 против 40 «вниз» — спаслась');
    eq(trace.margin, 25);
  });

  test('направление — слот-выбор в реестре: конструктор нарисует его сам', () => {
    const slot = slots.find(s => s.key === 'successWhen');
    ok(slot, 'слот объявлен модулем шага, а не зашит в UI');
    eq(slot.kind, 'choice');
    ok(slot.options.includes('notOver'), 'бросок «вниз» доступен из выпадашки');
    eq(slot.options[0], 'atLeast', 'первым — прежнее умолчание: заготовки не меняют поведения');
  });
});
