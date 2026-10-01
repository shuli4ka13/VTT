import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { exchange } from './play.ts';
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

const hit = (actionId, from, to, die, sys = system, book = compendium) => {
  const targets = Array.isArray(to) ? to : [to];
  const out = exchange({ system: sys, compendium: book, die, sheets: [from, ...targets], actionId, fromId: from.id, toIds: targets.map(t => t.id) });
  const sheetOf = t => out.sheets.find(s => s.id === t.id);
  const reportOf = t => out.reports.find(r => r.toId === t.id).report;
  return { out, sheetOf, reportOf };
};

group('вызов действия', () => {
  group('отправитель', () => {
    test('неизвестное действие — внятная ошибка', () => {
      throws(() => hit('нетакого', arven, mirra, queue()), 'нетакого');
    });

    test('сложность спасброска считается отправителем по СВОЕЙ системе', () => {
      const { reportOf } = hit('poison-spray:0', mirra, arven, queue(3, 4, 5));
      eq(reportOf(arven).trace[0].versus.value, 13, '8 + бонус мастерства 2 + Харизма 3');
      eq(reportOf(arven).trace[0].bonus, 1, 'а спасбросок Ловкости посчитан целью');
    });

    test('числовой бонус эффекта попадает в бросок атаки', () => {
      const blessedSys = { ...system, effects: { ...system.effects,
        blessed: {
          label: 'Благословение', activation: 'passive', duration: { kind: 'permanent' },
          modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['атака'], op: 'add', value: { expr: '4' }, stacking: 'sum' }],
        } } };
      const sheet = { ...arven, effects: [{ effectId: 'blessed' }] };

      const plain = hit('longsword-item:0', arven, mirra, queue(10, 5));
      const boosted = hit('longsword-item:0', sheet, mirra, queue(10, 5), blessedSys);

      eq(plain.reportOf(mirra).trace[0].total, 16, 'кость 10 плюс свой бонус атаки 6');
      eq(boosted.reportOf(mirra).trace[0].total, 20, 'та же кость, но плюс 4 от эффекта');
    });

    test('записи лежат в компендиуме, а автоматизация — в системе', () => {
      eq(system.actions, undefined, 'система не объявляет действий');
      eq(compendium.effects, undefined, 'а компендиум не объявляет эффектов');
      ok(compendium.records.every(a => !a.steps), 'ни у одной записи нет шагов');
      ok(Object.keys(system.effects).length, 'шаги живут в библиотеке эффектов системы');

      const sword = compendium.records.find(i => i.id === 'longsword-item');
      ok(!sword.activities, 'у меча нет своей активности');
      ok(system.tables[sword.table].bindings.length, 'зато у его рода есть привязка');
    });
  });

  group('получатель считает сам', () => {
    test('попадание определяется классом брони получателя, а не отправителя', () => {
      const other = { ...arven, id: 'arven2' };
      const { reportOf } = hit('longsword-item:0', arven, [mirra, other], queue(9, 5, 5));
      eq(reportOf(mirra).trace[0].success, true, 'у Мирры класс брони 14');
      eq(reportOf(other).trace[0].success, false, 'у Арвен в кольчуге 16');
    });

    test('один и тот же бросок по двум получателям даёт разный исход', () => {
      const other = { ...arven, id: 'arven2' };
      const { reportOf } = hit('longsword-item:0', arven, [mirra, other], queue(9, 5, 5));
      const a = reportOf(mirra), b = reportOf(other);
      ok(a.trace[0].success !== b.trace[0].success);
      eq(a.trace[0].versus.value, 14);
      eq(b.trace[0].versus.value, 16);
    });

    test('попадание снимает хиты у получателя', () => {
      const { sheetOf } = hit('longsword-item:0', arven, mirra, queue(15, 5));
      eq(sheetOf(mirra).values.hp_current, 13, '21 минус 8');
    });

    test('промах не меняет ничего', () => {
      const { sheetOf, reportOf } = hit('longsword-item:0', mirra, arven, queue(2, 5));
      eq(reportOf(arven).stopped.reason, 'threshold-miss');
      eq(sheetOf(arven).values.hp_current, 44);
    });

    test('лист получателя не мутируется — возвращается новый', () => {
      const before = serializeSheet(mirra);
      const { sheetOf } = hit('longsword-item:0', arven, mirra, queue(15, 5));
      eq(serializeSheet(mirra), before, 'исходный лист остался прежним');
      ok(sheetOf(mirra) !== mirra);
    });

    test('новый лист остаётся законным DTO', () => {
      const { sheetOf } = hit('longsword-item:0', arven, mirra, queue(15, 5));
      serializeSheet(sheetOf(mirra));
    });
  });

  group('спасбросок отыгрывается на стороне получателя', () => {
    const poison = (target, die) => hit('poison-spray:0', mirra, target, die);

    test('получатель бросает своим спасброском против присланной сложности', () => {
      const { reportOf } = poison(arven, queue(3, 4, 5));
      eq(reportOf(arven).trace[0].bonus, 1, 'спасбросок Ловкости Арвен — посчитан ЕЮ');
      eq(reportOf(arven).trace[0].total, 6);
      eq(reportOf(arven).trace[0].success, false);
    });

    test('провал снимает хиты и вешает эффект', () => {
      const { sheetOf } = poison(arven, queue(3, 4, 5));
      eq(sheetOf(arven).values.hp_current, 37, '44 минус 7');
      deepEq(sheetOf(arven).effects, [...arven.effects, { effectId: 'poisoned' }]);
    });

    test('успех не делает ничего — и в журнале это обрыв порога, не промах', () => {
      const { sheetOf, reportOf } = poison(arven, queue(3, 4, 19));
      eq(reportOf(arven).stopped.reason, 'threshold-held');
      eq(sheetOf(arven).values.hp_current, 44);
      deepEq(sheetOf(arven).effects, arven.effects);
    });

    test('свои модификаторы броска получатель применяет сам', () => {
      const shakenSys = { ...system, effects: { ...system.effects,
        shaken: {
          label: 'Потрясён', activation: 'passive', duration: { kind: 'permanent' },
          modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['спасбросок'], edit: 'disadvantage' }],
        } } };
      const sheet = { ...arven, effects: [{ effectId: 'shaken' }] };
      const { reportOf } = hit('poison-spray:0', mirra, sheet, queue(3, 4, 19, 5), shakenSys);
      deepEq(reportOf(sheet).trace[0].rolls, [19, 5]);
      eq(reportOf(sheet).trace[0].kept, 5, 'взята худшая кость');
      eq(reportOf(sheet).trace[0].success, false);
    });

    test('хиты не уходят ниже нуля', () => {
      const weak = { ...arven, values: { ...arven.values, hp_current: 3 } };
      const { sheetOf } = poison(weak, queue(3, 4, 5));
      eq(sheetOf(weak).values.hp_current, 0);
    });

    test('повторное наложение того же эффекта не дублируется', () => {
      const already = { ...arven, effects: [{ effectId: 'poisoned' }] };
      const { sheetOf } = poison(already, queue(3, 4, 5));
      eq(sheetOf(already).effects.length, 1);
    });
  });

  group('критерий приёмки №5', () => {
    test('вызов с одного листа меняет значение у второго, расчёт — у получателя', () => {
      const before = calc(system, mirra, 'hp_current', newPass(system, mirra, { compendium }));
      const { sheetOf, reportOf } = hit('longsword-item:0', arven, mirra, queue(15, 5));
      const sheet = sheetOf(mirra);
      const after = calc(system, sheet, 'hp_current', newPass(system, sheet, { compendium }));

      ok(after < before, 'значение у получателя изменилось');
      deepEq(reportOf(mirra).trace[0].versus, { tag: 'ac', value: 14 }, 'класс брони посчитан ПОЛУЧАТЕЛЕМ');
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
  records: [...compendium.records, { id, table: 'weapon', label: 'Своё', cells: { damage_dice: '1d6' },
      bindings: [{ label: 'Удар', effect: 'parametric', args }] }],
});

group('действие не даёт целиться в бессмыслицу', () => {
  const withStrike = args => paramBook('bogus', args);

  test('сравнивать бросок с текстовым полем нельзя — внятная ошибка, а не тихое «мимо»', () => {
    const book = withStrike({ bonus: '#attack_bonus', versus: '@получатель.race', damage_bonus: '0' });
    throws(() => hit('bogus:0', arven, mirra, queue(15, 5, 5), paramSys, book), 'race');
  });
});

group('в параметрах эффекта живут выражения, а не только ссылки', () => {
  const withStrike = args => paramBook('custom', args);

  test('бонус проверки — выражение, а не один тег', () => {
    const book = withStrike({ bonus: '#attack_bonus + 2', versus: '@получатель.ac', damage_bonus: '#str_mod' });
    const { reportOf } = hit('custom:0', arven, mirra, queue(10, 4), paramSys, book);
    eq(reportOf(mirra).trace[0].total, 18, 'кость 10 плюс бонус атаки 6 плюс двойка из выражения');
  });

  test('бонус урона задаётся выражением', () => {
    const book = withStrike({ bonus: '#attack_bonus', versus: '@получатель.ac', damage_bonus: '#str_mod * 2' });
    const { reportOf } = hit('custom:0', arven, mirra, queue(10, 4), paramSys, book);
    eq(reportOf(mirra).trace[1].total, 10, 'кость 4 плюс удвоенная Сила 6');
  });

  test('битое выражение в параметре — внятная ошибка', () => {
    const book = withStrike({ bonus: '#attack_bonus +', versus: '@получатель.ac', damage_bonus: '0' });
    throws(() => hit('custom:0', arven, mirra, queue(10, 4), paramSys, book));
  });
});
