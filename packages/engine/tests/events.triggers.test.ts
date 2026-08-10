import { group, test, eq, ok, deepEq } from './harness.ts';
import { receive, send } from '../src/events/envelope.ts';
import { exchange } from '../src/events/exchange.ts';
import { serializeSheet } from '../src/model/serialize.ts';
import { system } from '../src/model/system.ts';
import { arven, mirra } from '../src/model/sheets.ts';
import { compendium } from '../src/model/compendium.ts';

// Trigger Event: эффект, который вызывает ДРУГОЙ чарник.
//
// Сцена: на Мирре висят «Шипы». Арвен бьёт её мечом. Когда Мирра всё
// досчитала, её триггер отвечает — обычным конвертом в обратную сторону,
// и считает его Арвен, у себя и своей системой. Принцип «отправитель
// не считает за получателя» не тронут: ответка это тот же конверт.

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

// «Шипы» есть в образце, но без аргументов: их заполняет автор системы,
// потому что у триггерного эффекта нет записи компендиума, которая
// заполнила бы их за него.
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

group('триггерные эффекты: ответка получателя', () => {
  test('попали — триггер отвечает конвертом в обратную сторону', () => {
    const sys = thorny();
    const env = send('longsword-item:0', { system: sys, sheet: arven, compendium, die: queue(15, 5) });
    const out = receive(env, { system: sys, sheet: spiked(mirra), compendium, die: queue(3) });

    eq(out.replies.length, 1, 'ровно одна ответка');
    const reply = out.replies[0];
    eq(reply.from, 'mirra', 'отвечает тот, на ком висел триггер');
    eq(reply.to, 'arven', 'а целью становится исходный отправитель');
    eq(reply.reply, true, 'конверт помечен как ответка');
    eq(reply.effect, 'thorns');
  });

  test('промахнулись — триггер молчит: условие смотрит в трассу события', () => {
    const sys = thorny();
    // Бросок 2 плюс бонус 6 = 8, КД Мирры 14 — мимо.
    const env = send('longsword-item:0', { system: sys, sheet: arven, compendium, die: queue(2, 5) });
    const out = receive(env, { system: sys, sheet: spiked(mirra), compendium, die: queue() });
    eq(out.replies.length, 0);
  });

  test('ответку считает ЕЁ получатель, своей системой и своим листом', () => {
    const sys = thorny();
    const before = arven.values.hp_current;
    const { sheets, reports } = exchange({
      system: sys, compendium, die: queue(15, 5, 3),
      sheets: [arven, spiked(mirra)], actionId: 'longsword-item:0',
      fromId: 'arven', toId: 'mirra',
    });

    eq(reports.length, 2, 'ход — цепочка: конверт и ответка');
    const back = sheets.find(s => s.id === 'arven');
    eq(back.values.hp_current, before - 3, 'урон шипов посчитан у Арвен');
    eq(reports[1].report.reply, true, 'вторая запись журнала помечена как ответка');
  });

  test('ответка не будит ответку: каскад ограничен глубиной 1', () => {
    // У ОБОИХ шипы. Без ограничения они обменивались бы уроном вечно.
    const sys = thorny();
    const { reports } = exchange({
      system: sys, compendium, die: queue(15, 5, 3),
      sheets: [spiked(arven), spiked(mirra)], actionId: 'longsword-item:0',
      fromId: 'arven', toId: 'mirra',
    });
    eq(reports.length, 2, 'удар и одна ответка — и всё');
  });

  test('триггер слушает КОНКРЕТНЫЙ эффект, а не любое событие', () => {
    const sys = thorny();
    // Мирра лечит Арвен — это эффект «heal», а шипы слушают «strike».
    const healer = { ...arven, actions: [...arven.actions, 'healing-word'] };
    const { reports } = exchange({
      system: sys, compendium, die: queue(2),
      sheets: [spiked(healer), spiked(mirra)], actionId: 'healing-word:0',
      fromId: 'arven', toId: 'mirra',
    });
    eq(reports.length, 1, 'на лечение шипы не отвечают');
  });
});

group('длительность: счётчик срабатываний', () => {
  test('сработал — минус одно; остаток живёт в записи на листе', () => {
    const sys = thorny();
    const env = send('longsword-item:0', { system: sys, sheet: arven, compendium, die: queue(15, 5) });
    const out = receive(env, { system: sys, sheet: spiked(mirra, 3), compendium, die: queue(3) });

    deepEq(out.sheet.effects, [{ effectId: 'thorns', usesLeft: 2 }]);
    deepEq(out.report.spent, ['thorns'], 'журнал показывает израсходованное срабатывание');
  });

  test('на нуле эффект спадает сам', () => {
    const sys = thorny();
    const env = send('longsword-item:0', { system: sys, sheet: arven, compendium, die: queue(15, 5) });
    const out = receive(env, { system: sys, sheet: spiked(mirra, 1), compendium, die: queue(3) });

    deepEq(out.sheet.effects, [], 'последнее срабатывание унесло эффект с листа');
    eq(out.replies.length, 1, 'но само срабатывание состоялось');
  });

  test('промах счётчик не тратит', () => {
    const sys = thorny();
    const env = send('longsword-item:0', { system: sys, sheet: arven, compendium, die: queue(2, 5) });
    const out = receive(env, { system: sys, sheet: spiked(mirra, 3), compendium, die: queue() });
    deepEq(out.sheet.effects, [{ effectId: 'thorns', usesLeft: 3 }]);
  });

  test('остаток — скаляр: чарник остаётся законным DTO (критерий №1)', () => {
    const sys = thorny();
    const env = send('longsword-item:0', { system: sys, sheet: arven, compendium, die: queue(15, 5) });
    const out = receive(env, { system: sys, sheet: spiked(mirra, 3), compendium, die: queue(3) });
    const json = serializeSheet(out.sheet);
    deepEq(JSON.parse(json).effects, [{ effectId: 'thorns', usesLeft: 2 }]);
  });

  test('счётчик — личное число персонажа: у двоих он тратится независимо', () => {
    const sys = thorny();
    const hit = sheet => receive(
      send('longsword-item:0', { system: sys, sheet: arven, compendium, die: queue(15, 5) }),
      { system: sys, sheet, compendium, die: queue(3) }).sheet;

    eq(hit(spiked(mirra, 3)).effects[0].usesLeft, 2);
    eq(hit(spiked(mirra, 1)).effects.length, 0, 'у второго осталось одно — и оно ушло');
  });
});

group('шаг «состояние» в режиме «снять»', () => {
  test('лечащее заклинание снимает отравление тем же конвейером', () => {
    const poisoned = { ...arven, effects: [{ effectId: 'poisoned' }] };
    const healer = { ...mirra, actions: [...mirra.actions, 'healing-word'] };
    const { sheets, reports } = exchange({
      system, compendium, die: queue(2),
      sheets: [healer, poisoned], actionId: 'healing-word:0',
      fromId: 'mirra', toId: 'arven',
    });

    const cured = sheets.find(s => s.id === 'arven');
    deepEq(cured.effects, [], 'яд снят');
    deepEq(reports[0].report.removed, ['poisoned'], 'и это видно в журнале');
    ok(cured.values.hp_current > poisoned.values.hp_current
      || cured.values.hp_current === arven.values.hp_max, 'заодно подлечило');
  });
});
