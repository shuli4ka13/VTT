import { group, test, eq, ok } from './harness.ts';
import { slots } from '../src/engine/steps/threshold.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';

// Направление успеха у порога — объявление системы, а не конвенция движка.
// «Больше — лучше, равенство в пользу бросающего» — это правило 5e, а не закон
// природы: CoC бросает d100 НЕ ВЫШЕ навыка, GURPS — 3d6 не выше умения,
// и есть миры, где равенство — провал. Слот-выбор successWhen делает
// направление данными — как BREAKS у шага «сравнение».

const queue = (...values) => { let i = 0; return () => values[i++] ?? 1; };

const sys = {
  id: 'направление-успеха',
  constants: { lead_die: { label: 'Сотка', kind: 'die', dice: [{ count: 1, sides: 100 }] } },
  fields: [],
};
const sheet = { id: 'испытуемый', values: {}, effects: [] };

const run = (successWhen, rolled, versus, extra = {}) => {
  const rule = {
    steps: [{
      id: 'try', type: 'threshold',
      ...(successWhen ? { successWhen } : {}),
      roll: { die: { constant: 'lead_die' }, bonus: { const: 0 }, check: null },
      versus: { const: versus },
      ...extra,
    }],
  };
  const packed = packRule(rule, { system: sys, sheet, params: {}, item: null, die: queue(rolled) });
  return resolveRule(packed, { system: sys, sheet, die: queue(rolled) });
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

  test('порог на стороне цели уносит направление в конверт', () => {
    const rule = {
      steps: [{
        id: 'try', type: 'threshold', side: 'target', successWhen: 'notOver',
        roll: { die: { constant: 'lead_die' }, bonus: { const: 0 }, check: null },
        versus: { const: 40 },
      }],
    };
    const packed = packRule(rule, { system: sys, sheet, params: {}, item: null, die: queue() });
    const done = resolveRule(packed, { system: sys, sheet, die: queue(15) });
    ok(done.results.try.success, 'цель бросила 15 против 40 «вниз» — спаслась');
    eq(done.results.try.margin, 25);
  });

  test('направление — слот-выбор в реестре: конструктор нарисует его сам', () => {
    const slot = slots.find(s => s.key === 'successWhen');
    ok(slot, 'слот объявлен модулем шага, а не зашит в UI');
    eq(slot.kind, 'choice');
    ok(slot.options.includes('notOver'), 'бросок «вниз» доступен из выпадашки');
    eq(slot.options[0], 'atLeast', 'первым — прежнее умолчание: заготовки не меняют поведения');
  });
});
