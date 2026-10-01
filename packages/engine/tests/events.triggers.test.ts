import { group, test, eq, ok, deepEq } from './harness.ts';
import { exchange } from './play.ts';
import { serializeSheet } from '../src/model/serialize.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const thorny = (uses = 3) => ({
  ...system,
  effects: {
    ...system.effects,
    thorns: {
      ...system.effects.thorns,
      duration: { kind: 'uses', max: uses },
      args: { dice: '1d4', apply_to: 'hp_current' },
    },
  },
});

const spiked = (sheet, usesLeft = 3) => ({ ...sheet, effects: [{ effectId: 'thorns', usesLeft }] });

const hitBy = (sys, sheet, dice) => exchange({
  system: sys, compendium, die: queue(...dice),
  sheets: [arven, sheet], actionId: 'longsword-item:0', fromId: 'arven', toId: 'mirra',
});

group('триггерные эффекты: ответка получателя', () => {
  test('попали — триггер отвечает записью в обратную сторону', () => {
    const r = hitBy(thorny(), spiked(mirra), [15, 5, 3]);
    eq(r.reports.length, 2, 'удар и ровно одна ответка');
    const reply = r.reports[1];
    eq(reply.fromId, 'mirra', 'отвечает тот, на ком висел триггер');
    eq(reply.toId, 'arven', 'а целью становится исходный отправитель');
    eq(reply.report.reply, true, 'запись помечена как ответка');
    eq(reply.report.effect, 'thorns');
  });

  test('промахнулись — триггер молчит: условие смотрит в трассу вызова', () => {
    const r = hitBy(thorny(), spiked(mirra), [2, 5]);
    eq(r.reports.length, 1);
  });

  test('ответку считает ЕЁ получатель, своей системой и своим листом', () => {
    const sys = thorny();
    const before = arven.values.hp_current;
    const { sheets, reports } = exchange({
      system: sys, compendium, die: queue(15, 5, 3),
      sheets: [arven, spiked(mirra)], actionId: 'longsword-item:0',
      fromId: 'arven', toId: 'mirra',
    });

    eq(reports.length, 2, 'ход — цепочка: удар и ответка');
    const back = sheets.find(s => s.id === 'arven');
    eq(back.values.hp_current, before - 3, 'урон шипов посчитан у Арвен');
    eq(reports[1].report.reply, true, 'вторая запись журнала помечена как ответка');
  });

  test('ответка не будит ответку: каскад ограничен глубиной 1', () => {
    const sys = thorny();
    const { reports } = exchange({
      system: sys, compendium, die: queue(15, 5, 3),
      sheets: [spiked(arven), spiked(mirra)], actionId: 'longsword-item:0',
      fromId: 'arven', toId: 'mirra',
    });
    eq(reports.length, 2, 'удар и одна ответка — и всё');
  });

  test('триггер слушает КОНКРЕТНЫЙ эффект, а не любой вызов', () => {
    const sys = thorny();

    const healer = { ...arven, has: [...arven.has, { of: 'healing-word' }] };
    const { reports } = exchange({
      system: sys, compendium, die: queue(2),
      sheets: [spiked(healer), spiked(mirra)], actionId: 'healing-word:0',
      fromId: 'arven', toId: 'mirra',
    });
    eq(reports.filter(r => r.report.kind === 'effect').length, 1, 'на лечение шипы не отвечают');
  });
});

group('длительность: счётчик срабатываний', () => {
  test('сработал — минус одно; остаток живёт в записи на листе', () => {
    const r = hitBy(thorny(), spiked(mirra, 3), [15, 5, 3]);
    deepEq(r.sheets.find(s => s.id === 'mirra').effects, [{ effectId: 'thorns', usesLeft: 2 }]);
  });

  test('журнал показывает израсходованное срабатывание', () => {
    const r = hitBy(thorny(), spiked(mirra, 3), [15, 5, 3]);
    ok(r.reports.some(x => x.report.spent.includes('thorns')), 'report.spent называет thorns');
  });

  test('на нуле эффект спадает сам', () => {
    const r = hitBy(thorny(), spiked(mirra, 1), [15, 5, 3]);
    deepEq(r.sheets.find(s => s.id === 'mirra').effects, [], 'последнее срабатывание унесло эффект с листа');
    eq(r.reports.length, 2, 'но само срабатывание состоялось');
  });

  test('промах счётчик не тратит', () => {
    const r = hitBy(thorny(), spiked(mirra, 3), [2, 5]);
    deepEq(r.sheets.find(s => s.id === 'mirra').effects, [{ effectId: 'thorns', usesLeft: 3 }]);
  });

  test('остаток — скаляр: лист остаётся законным DTO (критерий №1)', () => {
    const r = hitBy(thorny(), spiked(mirra, 3), [15, 5, 3]);
    const json = serializeSheet(r.sheets.find(s => s.id === 'mirra'));
    deepEq(JSON.parse(json).effects, [{ effectId: 'thorns', usesLeft: 2 }]);
  });

  test('счётчик — личное число персонажа: у двоих он тратится независимо', () => {
    const sys = thorny();
    const hit = sheet => hitBy(sys, sheet, [15, 5, 3]).sheets.find(s => s.id === 'mirra');

    eq(hit(spiked(mirra, 3)).effects[0].usesLeft, 2);
    eq(hit(spiked(mirra, 1)).effects.length, 0, 'у второго осталось одно — и оно ушло');
  });
});

group('шаг «состояние» в режиме «снять»', () => {
  test('лечащее заклинание снимает отравление тем же конвейером', () => {
    const poisoned = { ...arven, effects: [{ effectId: 'poisoned' }] };
    const healer = { ...mirra, has: [...mirra.has, { of: 'healing-word' }] };
    const { sheets, reports } = exchange({
      system, compendium, die: queue(2),
      sheets: [healer, poisoned], actionId: 'healing-word:0',
      fromId: 'mirra', toId: 'arven',
    });

    const cured = sheets.find(s => s.id === 'arven');
    deepEq(cured.effects, [], 'яд снят');
    const main = reports.find(r => r.report.kind === 'effect');
    deepEq(main.report.removed, ['poisoned'], 'и это видно в журнале');
    ok(cured.values.hp_current > poisoned.values.hp_current
      || cured.values.hp_current === arven.values.hp_max, 'заодно подлечило');
  });
});
