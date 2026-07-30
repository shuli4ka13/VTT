import { group, test, eq, ok, deepEq, throws } from './harness.js';
import { send, receive } from '../src/events/envelope.js';
import { rollNotation, rollCheck } from '../src/engine/dice.js';
import { calc, newPass } from '../src/engine/calc.js';
import { serializeSheet } from '../src/model/serialize.js';
import { system } from '../src/model/system.js';
import { arven, mirra } from '../src/model/sheets.js';
import { compendium } from '../src/model/compendium.js';

// Кубик с заранее известными гранями — иначе тест нечем закрепить.
const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const ctx = (sheet, die) => ({ system, sheet, compendium, die });

group('кубики', () => {
  test('нотация NdM бросает нужное число костей', () => {
    const r = rollNotation('2d6', queue(3, 4));
    deepEq(r.rolls, [3, 4]);
    eq(r.total, 7);
  });

  test('обычный бросок — одна кость', () => {
    const r = rollCheck({ sides: 20, bonus: 6, mode: 'normal' }, queue(15));
    deepEq(r.rolls, [15]);
    eq(r.kept, 15);
    eq(r.total, 21);
  });

  test('преимущество — две кости, берётся лучшая', () => {
    const r = rollCheck({ sides: 20, bonus: 0, mode: 'advantage' }, queue(4, 17));
    deepEq(r.rolls, [4, 17]);
    eq(r.kept, 17);
  });

  test('помеха — две кости, берётся худшая', () => {
    const r = rollCheck({ sides: 20, bonus: 0, mode: 'disadvantage' }, queue(4, 17));
    eq(r.kept, 4);
  });

  test('битая нотация — внятная ошибка', () => {
    throws(() => rollNotation('котик', queue()), 'котик');
  });
});

group('событийный конверт', () => {
  group('отправитель', () => {
    test('собирает конверт, ничего не зная о получателе', () => {
      const env = send('longsword', ctx(arven, queue(15, 5)));
      eq(env.kind, 'attack');
      eq(env.from, 'arven');
      eq(env.versus, 'ac', 'в конверте лежит ТЕГ, а не посчитанный класс брони цели');
      eq(env.attack.total, 21, 'отправитель бросил свой бросок по своей системе');
      eq(env.onHit.damage.base, 8, 'своя часть урона: 1d8=5 плюс своя Сила 3');
    });

    test('конверт — чистые данные и переживает сериализацию', () => {
      const env = send('longsword', ctx(arven, queue(15, 5)));
      deepEq(JSON.parse(JSON.stringify(env)), env);
    });

    test('в конверте нет ни одного значения получателя', () => {
      const env = send('longsword', ctx(arven, queue(15, 5)));
      const text = JSON.stringify(env);
      ok(!text.includes('mirra'), 'отправитель вообще не упоминает цель');
    });

    test('сложность спасброска считается отправителем по СВОЕЙ системе', () => {
      const env = send('poison-spray', ctx(mirra, queue(3, 4)));
      eq(env.kind, 'save');
      eq(env.saveTag, 'dex_save');
      eq(env.dc, 13, '8 + бонус мастерства 2 + Харизма 3');
      eq(env.onFail.damage.base, 7);
    });

    test('неизвестное действие — внятная ошибка', () => {
      throws(() => send('нетакого', ctx(arven, queue())), 'нетакого');
    });

    test('числовой бонус эффекта попадает в бросок атаки', () => {
      const blessed = {
        id: 'blessed', label: 'Благословение', duration: { kind: 'scene' },
        modifiers: [{ kind: 'roll', target: 'attack_roll', op: 'add', value: 4, stacking: 'sum', condition: null }],
      };
      const book = { ...compendium, effects: [...compendium.effects, blessed] };
      const sheet = { ...arven, effects: [{ effectId: 'blessed' }] };

      const plain = send('longsword', ctx(arven, queue(10, 5)));
      const boosted = send('longsword', { system, sheet, compendium: book, die: queue(10, 5) });

      eq(plain.attack.total, 16, 'кость 10 плюс свой бонус атаки 6');
      eq(boosted.attack.total, 20, 'та же кость, но плюс 4 от эффекта');
    });

    test('действия лежат в компендиуме, а не в системе', () => {
      eq(system.actions, undefined, 'система больше не объявляет действий');
      deepEq(compendium.actions.map(a => a.id), ['longsword', 'poison-spray']);
    });
  });

  group('получатель считает сам', () => {
    test('попадание определяется классом брони получателя, а не отправителя', () => {
      const env = send('longsword', ctx(arven, queue(9, 5))); // бросок атаки 9+6 = 15
      eq(receive(env, ctx(mirra, queue())).report.check.success, true, 'у Мирры класс брони 14');
      eq(receive(env, ctx(arven, queue())).report.check.success, false, 'у Арвен в кольчуге 16');
    });

    test('один и тот же конверт по двум получателям даёт разный исход', () => {
      const env = send('longsword', ctx(arven, queue(9, 5)));
      const a = receive(env, ctx(mirra, queue()));
      const b = receive(env, ctx(arven, queue()));
      ok(a.report.check.success !== b.report.check.success);
      eq(a.report.versus.value, 14);
      eq(b.report.versus.value, 16);
    });

    test('попадание снимает хиты у получателя', () => {
      const env = send('longsword', ctx(arven, queue(15, 5)));
      const { sheet } = receive(env, ctx(mirra, queue()));
      eq(sheet.values.hp_current, 13, '21 минус 8');
    });

    test('промах не меняет ничего', () => {
      const env = send('longsword', ctx(mirra, queue(2, 5))); // 2 + 1 = 3, мимо всех
      const { sheet, report } = receive(env, ctx(arven, queue()));
      eq(report.check.success, false);
      eq(sheet.values.hp_current, 44);
    });

    test('чарник получателя не мутируется — возвращается новый', () => {
      const env = send('longsword', ctx(arven, queue(15, 5)));
      const before = serializeSheet(mirra);
      const { sheet } = receive(env, ctx(mirra, queue()));
      eq(serializeSheet(mirra), before, 'исходный чарник остался прежним');
      ok(sheet !== mirra);
    });

    test('новый чарник остаётся законным DTO', () => {
      const env = send('longsword', ctx(arven, queue(15, 5)));
      const { sheet } = receive(env, ctx(mirra, queue()));
      serializeSheet(sheet);
    });
  });

  group('спасбросок отыгрывается на стороне получателя', () => {
    const poisonAt = () => send('poison-spray', ctx(mirra, queue(3, 4)));

    test('получатель бросает своим спасброском против присланной сложности', () => {
      const { report } = receive(poisonAt(), ctx(arven, queue(5)));
      eq(report.save.bonus, 1, 'спасбросок Ловкости Арвен');
      eq(report.save.total, 6);
      eq(report.check.success, false);
    });

    test('провал снимает хиты и вешает эффект', () => {
      const { sheet } = receive(poisonAt(), ctx(arven, queue(5)));
      eq(sheet.values.hp_current, 37, '44 минус 7');
      deepEq(sheet.effects, [{ effectId: 'poisoned' }]);
    });

    test('успех не делает ничего', () => {
      const { sheet, report } = receive(poisonAt(), ctx(arven, queue(19)));
      eq(report.check.success, true);
      eq(sheet.values.hp_current, 44);
      deepEq(sheet.effects, []);
    });

    test('свои модификаторы броска получатель применяет сам', () => {
      // Помеха на спасброски — эффект получателя, отправитель о нём не знает.
      const shaken = {
        id: 'shaken', label: 'Потрясён', duration: { kind: 'scene' },
        modifiers: [{ kind: 'roll', target: 'save_roll', effect: 'disadvantage', method: 'rerollBest', condition: null }],
      };
      const book = { items: compendium.items, effects: [...compendium.effects, shaken] };
      const sheet = { ...arven, effects: [{ effectId: 'shaken' }] };
      const { report } = receive(poisonAt(), { system, sheet, compendium: book, die: queue(19, 5) });
      deepEq(report.save.rolls, [19, 5]);
      eq(report.save.kept, 5, 'взята худшая кость');
      eq(report.check.success, false);
    });

    test('хиты не уходят ниже нуля', () => {
      const weak = { ...arven, values: { ...arven.values, hp_current: 3 } };
      const { sheet } = receive(poisonAt(), ctx(weak, queue(5)));
      eq(sheet.values.hp_current, 0);
    });

    test('повторное наложение того же эффекта не дублируется', () => {
      const already = { ...arven, effects: [{ effectId: 'poisoned' }] };
      const { sheet } = receive(poisonAt(), ctx(already, queue(5)));
      eq(sheet.effects.length, 1);
    });
  });

  group('критерий приёмки №5', () => {
    test('событие от одного чарника меняет значение у второго, расчёт — у получателя', () => {
      const before = calc(system, mirra, 'hp_current', newPass(system, mirra, { compendium }));
      const env = send('longsword', ctx(arven, queue(15, 5)));
      const { sheet, report } = receive(env, ctx(mirra, queue()));
      const after = calc(system, sheet, 'hp_current', newPass(system, sheet, { compendium }));

      ok(after < before, 'значение у получателя изменилось');
      eq(report.versus.tag, 'ac');
      eq(report.versus.value, 14, 'класс брони посчитан ПОЛУЧАТЕЛЕМ по его чарнику');
      ok(!('versusValue' in env), 'отправитель этого значения не знал');
    });
  });
});

group('конверт не даёт целиться в бессмыслицу', () => {
  const die = (...v) => { const q = [...v]; return () => q.shift(); };

  test('сравнивать бросок с текстовым полем нельзя — внятная ошибка, а не тихое «мимо»', () => {
    const book = {
      ...compendium,
      actions: [{
        id: 'bogus', kind: 'action', label: 'Бессмыслица',
        envelope: {
          kind: 'attack',
          roll: { die: 20, bonus: '#attack_bonus', target: 'attack_roll' },
          versus: 'race',   // текстовое поле
          onHit: { damage: { dice: '1d8' }, applyTo: 'hp_current' },
        },
      }],
    };
    const env = send('bogus', { system, sheet: arven, compendium: book, die: die(15) });
    throws(() => receive(env, { system, sheet: mirra, compendium: book, die: die() }), 'race');
  });

  test('урон нельзя лить в вычисляемое поле — его считает движок, а не событие', () => {
    const book = {
      ...compendium,
      actions: [{
        id: 'bogus2', kind: 'action', label: 'Бессмыслица',
        envelope: {
          kind: 'attack',
          roll: { die: 20, bonus: '#attack_bonus', target: 'attack_roll' },
          versus: 'ac',
          onHit: { damage: { dice: '1d8' }, applyTo: 'ac' },   // формульное поле
        },
      }],
    };
    const env = send('bogus2', { system, sheet: arven, compendium: book, die: die(20, 5) });
    throws(() => receive(env, { system, sheet: mirra, compendium: book, die: die() }), 'ac');
  });
});

group('в действии можно писать выражения, а не только ссылку', () => {
  const die = (...v) => { const q = [...v]; return () => q.shift(); };
  const withAction = envelope => ({
    ...compendium,
    actions: [{ id: 'custom', kind: 'action', label: 'Своё', envelope }],
  });

  test('бонус атаки — выражение, а не один тег', () => {
    const book = withAction({
      kind: 'attack',
      roll: { die: 20, bonus: '#attack_bonus + 2', target: 'attack_roll' },
      versus: 'ac',
      onHit: { damage: { dice: '1d8' }, applyTo: 'hp_current' },
    });
    const env = send('custom', { system, sheet: arven, compendium: book, die: die(10, 4) });
    eq(env.attack.total, 18, 'кость 10 плюс бонус атаки 6 плюс двойка из выражения');
  });

  test('бонус урона задаётся выражением', () => {
    const book = withAction({
      kind: 'attack',
      roll: { die: 20, bonus: '#attack_bonus', target: 'attack_roll' },
      versus: 'ac',
      onHit: { damage: { dice: '1d8', bonus: '#str_mod * 2' }, applyTo: 'hp_current' },
    });
    const env = send('custom', { system, sheet: arven, compendium: book, die: die(10, 4) });
    eq(env.onHit.damage.base, 10, 'кость 4 плюс удвоенная Сила 6');
  });

  test('сложность спасброска — выражение', () => {
    const book = withAction({
      kind: 'save',
      saveTag: 'dex_save',
      dc: '8 + #prof_bonus + #cha_mod',
      onFail: { damage: { dice: '2d6' }, applyTo: 'hp_current' },
      onSuccess: null,
    });
    const env = send('custom', { system, sheet: mirra, compendium: book, die: die(3, 4) });
    eq(env.dc, 13, '8 плюс бонус мастерства 2 плюс Харизма 3');
  });

  test('битое выражение в действии — внятная ошибка', () => {
    const book = withAction({
      kind: 'attack',
      roll: { die: 20, bonus: '#attack_bonus +', target: 'attack_roll' },
      versus: 'ac',
      onHit: { damage: { dice: '1d8' }, applyTo: 'hp_current' },
    });
    throws(() => send('custom', { system, sheet: arven, compendium: book, die: die(10, 4) }));
  });
});
