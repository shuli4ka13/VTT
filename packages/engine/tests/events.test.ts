import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { exchange } from './play.ts';
import { rollNotation } from './kit.ts';
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

const savingBy = target => ({ ...system, effects: { ...system.effects, save: { ...system.effects.save, steps: system.effects.save.steps.map(step =>
  (step.id === 'save_бросок' ? { ...step, bonus: { expr: '@цель.dex_save' } } : step)) } } });

const hit = (actionId, from, to, die, sys = system, book = compendium) => {
  const targets = Array.isArray(to) ? to : [to];
  const out = exchange({ system: sys, compendium: book, die, sheets: [from, ...targets], actionId, fromId: from.id, toIds: targets.map(t => t.id) });
  const sheetOf = t => out.sheets.find(s => s.id === t.id);
  const reportOf = t => out.reports.find(r => r.toId === t.id).report;
  const stepOf = id => out.reports.flatMap(r => r.report.trace).find(t => t.step === id);
  return { out, sheetOf, reportOf, stepOf };
};

group('вызов действия', () => {
  group('действующий', () => {
    test('неизвестное действие — внятная ошибка', () => {
      throws(() => hit('нетакого', arven, mirra, queue()), 'нетакого');
    });

    test('сложность спасброска считается действующим по СВОЕЙ системе', () => {
      const { reportOf } = hit('poison-spray:0', mirra, arven, queue(5, 3, 4), savingBy());
      eq(reportOf(arven).trace[1].versus, 13, '8 + бонус мастерства 2 + Харизма 3');
      eq(reportOf(arven).trace[0].bonus, 1, 'а спасбросок Ловкости посчитан целью');
    });

    test('числовой бонус эффекта попадает в бросок атаки', () => {
      const blessedSys = { ...system, effects: { ...system.effects,
        blessed: {
          label: 'Благословение', activation: 'passive', duration: { kind: 'permanent' },
          modifiers: [{ kind: 'edit', call: 'roll', param: 'bonus', tags: ['атака'], op: 'add', value: { expr: '4' }, if: { expr: '@бросающий == @носитель' } }],
        } } };
      const sheet = { ...arven, effects: [{ effectId: 'blessed' }] };

      const plain = hit('longsword-item:0', arven, mirra, queue(10, 5));
      const boosted = hit('longsword-item:0', sheet, mirra, queue(10, 5), blessedSys);

      eq(plain.stepOf('hit_бросок').total, 16, 'кость 10 плюс свой бонус атаки 6');
      eq(boosted.stepOf('hit_бросок').total, 20, 'та же кость, но плюс 4 от эффекта');
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

  group('цель считает сам', () => {
    test('попадание определяется классом брони цели, а не действующего', () => {
      const other = { ...arven, id: 'arven2' };
      const { reportOf } = hit('longsword-item:0', arven, [mirra, other], queue(9, 5, 5));
      eq(reportOf(mirra).trace[0].success, true, 'у Мирры класс брони 14');
      eq(reportOf(other).trace[0].success, false, 'у Арвен в кольчуге 16');
    });

    test('один и тот же бросок по двум целям даёт разный исход', () => {
      const other = { ...arven, id: 'arven2' };
      const { reportOf } = hit('longsword-item:0', arven, [mirra, other], queue(9, 5, 5));
      const a = reportOf(mirra), b = reportOf(other);
      ok(a.trace[0].success !== b.trace[0].success);
      eq(a.trace[0].versus, 14);
      eq(b.trace[0].versus, 16);
    });

    test('попадание снимает хиты у цели', () => {
      const { sheetOf } = hit('longsword-item:0', arven, mirra, queue(15, 5));
      eq(sheetOf(mirra).values.hp_current, 13, '21 минус 8');
    });

    test('промах не меняет ничего', () => {
      const { sheetOf, reportOf } = hit('longsword-item:0', mirra, arven, queue(2, 5));
      eq(reportOf(arven).stopped.reason, 'stop');
      eq(reportOf(arven).trace.find(entry => entry.type === 'check').success, false, 'стоп сработал, потому что проверка не прошла');
      eq(sheetOf(arven).values.hp_current, 44);
    });

    test('лист цели не мутируется — возвращается новый', () => {
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

  group('спасбросок отыгрывается на стороне цели', () => {
    const poison = (target, die) => hit('poison-spray:0', mirra, target, die, savingBy());

    test('цель бросает своим спасброском против присланной сложности', () => {
      const { reportOf } = poison(arven, queue(5, 3, 4));
      eq(reportOf(arven).trace[0].bonus, 1, 'спасбросок Ловкости Арвен — посчитан ЕЮ');
      eq(reportOf(arven).trace[0].total, 6);
      eq(reportOf(arven).trace[1].success, false);
    });

    test('провал снимает хиты и вешает эффект', () => {
      const { sheetOf } = poison(arven, queue(5, 3, 4));
      eq(sheetOf(arven).values.hp_current, 37, '44 минус 7');
      deepEq(sheetOf(arven).effects, [...arven.effects, { effectId: 'poisoned' }]);
    });

    test('успех не делает ничего — стоп в блоке «Если» после удавшегося спаса', () => {
      const { sheetOf, reportOf } = poison(arven, queue(19));
      eq(reportOf(arven).stopped.reason, 'stop');
      eq(reportOf(arven).trace.find(entry => entry.type === 'check').success, true, 'стоп сработал, потому что спас удался');
      eq(sheetOf(arven).values.hp_current, 44);
      deepEq(sheetOf(arven).effects, arven.effects);
    });

    test('свои модификаторы броска цель применяет сам', () => {
      const shakenSys = { ...system, effects: { ...system.effects,
        shaken: {
          label: 'Потрясён', activation: 'passive', duration: { kind: 'permanent' },
          modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['спасбросок'], edit: 'disadvantage', if: { expr: '@бросающий == @носитель' } }],
        } } };
      const sheet = { ...arven, effects: [{ effectId: 'shaken' }] };
      const { reportOf } = hit('poison-spray:0', mirra, sheet, queue(19, 5, 3, 4), { ...savingBy(), effects: { ...savingBy().effects, shaken: shakenSys.effects.shaken } });
      deepEq(reportOf(sheet).trace[0].rolls, [19, 5]);
      eq(reportOf(sheet).trace[0].kept, 5, 'взята худшая кость');
      eq(reportOf(sheet).trace[1].success, false);
    });

    test('хиты не уходят ниже нуля', () => {
      const weak = { ...arven, values: { ...arven.values, hp_current: 3 } };
      const { sheetOf } = poison(weak, queue(5, 3, 4));
      eq(sheetOf(weak).values.hp_current, 0);
    });

    test('повторное наложение того же эффекта не дублируется', () => {
      const already = { ...arven, effects: [{ effectId: 'poisoned' }] };
      const { sheetOf } = poison(already, queue(5, 3, 4));
      eq(sheetOf(already).effects.length, 1);
    });
  });

  group('критерий приёмки №5', () => {
    test('вызов с одного листа меняет значение у второго, расчёт — у цели', () => {
      const before = calc(system, mirra, 'hp_current', newPass(system, mirra, { compendium }));
      const { sheetOf, reportOf } = hit('longsword-item:0', arven, mirra, queue(15, 5));
      const sheet = sheetOf(mirra);
      const after = calc(system, sheet, 'hp_current', newPass(system, sheet, { compendium }));

      ok(after < before, 'значение у цели изменилось');
      eq(reportOf(mirra).trace[0].versus, 14, 'класс брони посчитан ЦЕЛЬЮ');
    });
  });
});

const PARAMETRIC = {
  label: 'Параметрический удар', activation: 'manual',
  params: [
    { key: 'действующий', kind: 'sheet' },
    { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } },
    { key: 'bonus', label: 'Бонус проверки', kind: 'number' },
    { key: 'versus', label: 'Против чего', kind: 'number', optional: true },
    { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
    { key: 'damage_bonus', label: 'Бонус урона', kind: 'number' },
  ],
  steps: [
    { type: 'each', of: 'цели' },
    { id: 'hit_бросок', type: 'roll', die: 'lead_die', bonus: { expr: '@bonus' }, tags: ['атака'],
      by: { expr: '@действующий' } },
    { id: 'hit', type: 'check', value: { expr: '@hit_бросок' }, versus: { expr: '@versus or @цель.ac' } },
    { type: 'branch', if: { expr: 'not @hit.success' } }, { type: 'stop' }, { type: 'end' },
    { id: 'dmg', type: 'roll', die: { expr: '@damage_dice' }, bonus: { expr: '@damage_bonus' } },
    { type: 'apply', target: { expr: '@цель.hp_current' }, direction: 'subtract',
      value: { expr: '@dmg' } },
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
    const book = withStrike({ bonus: { expr: '@носитель.attack_bonus' }, versus: { expr: '@носитель.race' }, damage_bonus: { expr: '0' } });
    throws(() => hit('bogus:0', arven, mirra, queue(15, 5, 5), paramSys, book), 'race');
  });
});

group('в параметрах эффекта живут выражения, а не только ссылки', () => {
  const withStrike = args => paramBook('custom', args);

  test('бонус проверки — выражение, а не один тег', () => {
    const book = withStrike({ bonus: { expr: '@носитель.attack_bonus + 2' }, damage_bonus: { expr: '@носитель.str_mod' } });
    const { stepOf } = hit('custom:0', arven, mirra, queue(10, 4), paramSys, book);
    eq(stepOf('hit_бросок').total, 18, 'кость 10 плюс бонус атаки 6 плюс двойка из выражения');
  });

  test('бонус урона задаётся выражением', () => {
    const book = withStrike({ bonus: { expr: '@носитель.attack_bonus' }, damage_bonus: { expr: '@носитель.str_mod * 2' } });
    const { reportOf } = hit('custom:0', arven, mirra, queue(10, 4), paramSys, book);
    eq(reportOf(mirra).trace.find(t => t.step === 'dmg').total, 10, 'кость 4 плюс удвоенная Сила 6');
  });

  test('битое выражение в параметре — внятная ошибка', () => {
    const book = withStrike({ bonus: { expr: '@носитель.attack_bonus +' }, damage_bonus: { expr: '0' } });
    throws(() => hit('custom:0', arven, mirra, queue(10, 4), paramSys, book));
  });
});
