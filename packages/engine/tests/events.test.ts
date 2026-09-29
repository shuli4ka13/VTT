import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { send, receive } from '../src/events/envelope.ts';
import { rollNotation } from '../src/engine/dice.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { serializeSheet } from '../src/model/serialize.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';

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

  test('битая нотация — внятная ошибка', () => {
    throws(() => rollNotation('котик', queue()), 'котик');
  });
});

group('конверт вызова', () => {
  group('отправитель', () => {
    test('собирает конверт, ничего не зная о получателе', () => {
      const env = send('longsword-item:0', ctx(arven, queue(15, 5)));
      eq(env.kind, 'effect');
      eq(env.effect, 'strike', 'конверт называет эффект, а не пересказывает его');
      eq(env.from, 'arven');
      eq(env.steps[0].rolled.total, 15, 'свой бросок сделан своей ведущей костью');
      deepEq(env.steps[0].versus, { expr: '@получатель.ac', of: 'target' }, 'в конверте лежит формула, а не посчитанный КД цели');
      eq(env.steps[1].rolled.total, 5, 'своя кость урона брошена');
    });

    test('конверт — чистые данные и переживает сериализацию', () => {
      const env = send('longsword-item:0', ctx(arven, queue(15, 5)));
      deepEq(JSON.parse(JSON.stringify(env)), env);
    });

    test('в конверте нет ни одного значения получателя', () => {
      const env = send('longsword-item:0', ctx(arven, queue(15, 5)));
      const text = JSON.stringify(env);
      ok(!text.includes('mirra'), 'отправитель вообще не упоминает цель');
    });

    test('сложность спасброска считается отправителем по СВОЕЙ системе', () => {
      const env = send('poison-spray:0', ctx(mirra, queue(3, 4)));
      deepEq(env.steps[0].versus, { const: 13 }, '8 + бонус мастерства 2 + Харизма 3');
      deepEq(env.steps[0].roll.bonus, { expr: '@получатель.dex_save', of: 'target' },
        'а чем спасаться — уехало выражением: его посчитает цель');
      eq(env.steps[1].rolled.total, 7, 'кости урона брошены отправителем');
    });

    test('неизвестное действие — внятная ошибка', () => {
      throws(() => send('нетакого', ctx(arven, queue())), 'нетакого');
    });

    test('числовой бонус эффекта попадает в бросок атаки', () => {
      const blessedSys = { ...system, effects: { ...system.effects,
        blessed: {
          label: 'Благословение', activation: 'passive', duration: { kind: 'permanent' },
          modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['атака'], op: 'add', value: { expr: '4' }, stacking: 'sum' }],
        } } };
      const sheet = { ...arven, effects: [{ effectId: 'blessed' }] };

      const plain = receive(send('longsword-item:0', ctx(arven, queue(10, 5))), ctx(mirra, queue()));
      const boosted = receive(send('longsword-item:0', { system: blessedSys, sheet, compendium, die: queue(10, 5) }),
        { system: blessedSys, sheet: mirra, compendium, die: queue() });

      eq(plain.report.trace[0].total, 16, 'кость 10 плюс свой бонус атаки 6');
      eq(boosted.report.trace[0].total, 20, 'та же кость, но плюс 4 от эффекта');
    });

    test('записи лежат в компендиуме, а автоматизация — в системе', () => {
      eq(system.actions, undefined, 'система не объявляет действий');
      eq(compendium.effects, undefined, 'а компендиум не объявляет эффектов');
      ok(compendium.records.every(a => !a.steps), 'ни у одной записи нет шагов');
      ok(Object.keys(system.effects).length, 'шаги живут в библиотеке эффектов системы');

      const sword = compendium.records.find(i => i.id === 'longsword-item');
      ok(!sword.activities, 'у меча нет своей активности');
      ok(system.records[sword.rk].bindings.length, 'зато у его рода есть привязка');
    });
  });

  group('получатель считает сам', () => {
    test('попадание определяется классом брони получателя, а не отправителя', () => {
      const env = send('longsword-item:0', ctx(arven, queue(9, 5)));
      eq(receive(env, ctx(mirra, queue())).report.trace[0].success, true, 'у Мирры класс брони 14');
      eq(receive(env, ctx(arven, queue())).report.trace[0].success, false, 'у Арвен в кольчуге 16');
    });

    test('один и тот же конверт по двум получателям даёт разный исход', () => {
      const env = send('longsword-item:0', ctx(arven, queue(9, 5)));
      const a = receive(env, ctx(mirra, queue()));
      const b = receive(env, ctx(arven, queue()));
      ok(a.report.trace[0].success !== b.report.trace[0].success);
      eq(a.report.trace[0].versus.value, 14);
      eq(b.report.trace[0].versus.value, 16);
    });

    test('попадание снимает хиты у получателя', () => {
      const env = send('longsword-item:0', ctx(arven, queue(15, 5)));
      const { sheet } = receive(env, ctx(mirra, queue()));
      eq(sheet.values.hp_current, 13, '21 минус 8');
    });

    test('промах не меняет ничего', () => {
      const env = send('longsword-item:0', ctx(mirra, queue(2, 5)));
      const { sheet, report } = receive(env, ctx(arven, queue()));
      eq(report.stopped.reason, 'threshold-miss');
      eq(sheet.values.hp_current, 44);
    });

    test('лист получателя не мутируется — возвращается новый', () => {
      const env = send('longsword-item:0', ctx(arven, queue(15, 5)));
      const before = serializeSheet(mirra);
      const { sheet } = receive(env, ctx(mirra, queue()));
      eq(serializeSheet(mirra), before, 'исходный лист остался прежним');
      ok(sheet !== mirra);
    });

    test('новый лист остаётся законным DTO', () => {
      const env = send('longsword-item:0', ctx(arven, queue(15, 5)));
      const { sheet } = receive(env, ctx(mirra, queue()));
      serializeSheet(sheet);
    });
  });

  group('спасбросок отыгрывается на стороне получателя', () => {
    const poisonAt = () => send('poison-spray:0', ctx(mirra, queue(3, 4)));

    test('получатель бросает своим спасброском против присланной сложности', () => {
      const { report } = receive(poisonAt(), ctx(arven, queue(5)));
      eq(report.trace[0].bonus, 1, 'спасбросок Ловкости Арвен — посчитан ЕЮ');
      eq(report.trace[0].total, 6);
      eq(report.trace[0].success, false);
    });

    test('провал снимает хиты и вешает эффект', () => {
      const { sheet } = receive(poisonAt(), ctx(arven, queue(5)));
      eq(sheet.values.hp_current, 37, '44 минус 7');
      deepEq(sheet.effects, [...arven.effects, { effectId: 'poisoned' }]);
    });

    test('успех не делает ничего — и в журнале это обрыв порога, не промах', () => {
      const { sheet, report } = receive(poisonAt(), ctx(arven, queue(19)));
      eq(report.stopped.reason, 'threshold-held');
      eq(sheet.values.hp_current, 44);
      deepEq(sheet.effects, arven.effects);
    });

    test('свои модификаторы броска получатель применяет сам', () => {

      const shakenSys = { ...system, effects: { ...system.effects,
        shaken: {
          label: 'Потрясён', activation: 'passive', duration: { kind: 'permanent' },
          modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['спасбросок'], edit: 'disadvantage' }],
        } } };
      const sheet = { ...arven, effects: [{ effectId: 'shaken' }] };
      const { report } = receive(poisonAt(), { system: shakenSys, sheet, compendium, die: queue(19, 5) });
      deepEq(report.trace[0].rolls, [19, 5]);
      eq(report.trace[0].kept, 5, 'взята худшая кость');
      eq(report.trace[0].success, false);
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
    test('вызов с одного листа меняет значение у второго, расчёт — у получателя', () => {
      const before = calc(system, mirra, 'hp_current', newPass(system, mirra, { compendium }));
      const env = send('longsword-item:0', ctx(arven, queue(15, 5)));
      const { sheet, report } = receive(env, ctx(mirra, queue()));
      const after = calc(system, sheet, 'hp_current', newPass(system, sheet, { compendium }));

      ok(after < before, 'значение у получателя изменилось');
      deepEq(report.trace[0].versus, { tag: 'ac', value: 14 }, 'класс брони посчитан ПОЛУЧАТЕЛЕМ');
    });
  });
});

const PARAMETRIC = {
  label: 'Параметрический удар', activation: 'manual',
  params: [
    { key: 'bonus', label: 'Бонус проверки', kind: 'number' },
    { key: 'versus', label: 'Против чего', kind: 'number' },
    { key: 'damage_bonus', label: 'Бонус урона', kind: 'number' },
  ],
  steps: [
    { id: 'hit', type: 'threshold',
      roll: { die: { constant: 'lead_die' }, bonus: { expr: '@bonus' }, tags: ['атака'] },
      versus: { expr: '@versus' } },
    { id: 'dmg', type: 'amount', source: 'roll',
      dice: { prop: 'damage_dice' }, bonus: { expr: '@damage_bonus' } },
    { type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract',
      value: { expr: '@dmg' }, targetModifiers: true },
  ],
};
const paramSys = { ...system, effects: { ...system.effects, parametric: PARAMETRIC } };
const paramBook = (id, args) => ({
  ...compendium,
  records: [...compendium.records, { id, rk: 'weapon', label: 'Своё', props: { damage_dice: '1d6' },
      bindings: [{ label: 'Удар', effect: 'parametric', args }] }],
});

group('конверт не даёт целиться в бессмыслицу', () => {
  const die = (...v) => { const q = [...v]; return () => q.shift(); };

  const withStrike = args => paramBook('bogus', args);

  test('сравнивать бросок с текстовым полем нельзя — внятная ошибка, а не тихое «мимо»', () => {
    const book = withStrike({ bonus: '#attack_bonus', versus: '@получатель.race', damage_bonus: '0' });
    const env = send('bogus:0', { system: paramSys, sheet: arven, compendium: book, die: die(15, 5) });
    throws(() => receive(env, { system: paramSys, sheet: mirra, compendium: book, die: die() }), 'race');
  });
});

group('в параметрах эффекта живут выражения, а не только ссылки', () => {
  const die = (...v) => { const q = [...v]; return () => q.shift(); };
  const withStrike = args => paramBook('custom', args);

  test('бонус проверки — выражение, а не один тег', () => {
    const book = withStrike({ bonus: '#attack_bonus + 2', versus: '@получатель.ac', damage_bonus: '#str_mod' });
    const env = send('custom:0', { system: paramSys, sheet: arven, compendium: book, die: die(10, 4) });
    const { report } = receive(env, { system: paramSys, sheet: mirra, compendium: book, die: die() });
    eq(report.trace[0].total, 18, 'кость 10 плюс бонус атаки 6 плюс двойка из выражения');
  });

  test('бонус урона задаётся выражением', () => {
    const book = withStrike({ bonus: '#attack_bonus', versus: '@получатель.ac', damage_bonus: '#str_mod * 2' });
    const env = send('custom:0', { system: paramSys, sheet: arven, compendium: book, die: die(10, 4) });
    const { report } = receive(env, { system: paramSys, sheet: mirra, compendium: book, die: die() });
    eq(report.trace[1].total, 10, 'кость 4 плюс удвоенная Сила 6');
  });

  test('битое выражение в параметре — внятная ошибка при отправке', () => {
    const book = withStrike({ bonus: '#attack_bonus +', versus: '@получатель.ac', damage_bonus: '0' });
    throws(() => send('custom:0', { system: paramSys, sheet: arven, compendium: book, die: die(10, 4) }));
  });
});
