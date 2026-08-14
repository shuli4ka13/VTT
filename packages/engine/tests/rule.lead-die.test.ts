import { group, test, eq, deepEq, throws } from './harness.ts';
import { dieConstant, rollLead, unfoldDice } from '../src/engine/lead-die.ts';

// Ведущая кость — константа системы: что бросается для действий в этом мире.
// Определение описывает и состав броска, и что возвращается. Инвариант из
// разбора: total ЕСТЬ ВСЕГДА — порог сравнивает его одинаково в 5e и
// в Daggerheart; именованные части лежат СВЕРХ него, и смотрит на них только
// тот шаг, которому они нужны.

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const d20 = { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] };
const daggerheart = {
  label: 'Кости дуальности', kind: 'die',
  dice: [
    { count: 1, sides: 12, name: 'hope', label: 'Надежда' },
    { count: 1, sides: 12, name: 'fear', label: 'Страх' },
  ],
};

group('ведущая кость', () => {
  group('словарь констант системы', () => {
    const sys = { constants: { lead_die: d20, luck: { kind: 'number', value: 3 } } };

    test('константа-кость достаётся по имени', () => {
      eq(dieConstant(sys, 'lead_die'), d20);
    });

    test('неизвестная константа — внятная ошибка', () => {
      throws(() => dieConstant(sys, 'котик'), 'котик');
    });

    test('константа не той породы — ошибка: числом не бросают', () => {
      throws(() => dieConstant(sys, 'luck'), 'luck');
    });

    test('система вовсе без констант — ошибка называет раздел', () => {
      throws(() => dieConstant({ id: 'голая' }, 'lead_die'), 'констант');
    });
  });

  group('total есть всегда', () => {
    test('одна к20: total равен выпавшему, именованных частей нет', () => {
      deepEq(rollLead(d20, queue(14)), {
        rolls: [14], kept: 14, total: 14, parts: {}, mode: 'normal',
        read: 'sum', tally: { dice: 1, atMax: 0, atMin: 0 },
      });
    });

    test('Daggerheart: две к12 с именами — total суммой, части сверх него', () => {
      const r = rollLead(daggerheart, queue(7, 4));
      eq(r.total, 11, 'порогу нужна одна цифра, и она есть всегда');
      deepEq(r.parts, { hope: 7, fear: 4 }, 'именованные части — сверх total');
      deepEq(r.rolls, [7, 4]);
    });

    test('несколько костей без имён складываются в total', () => {
      const r = rollLead({ kind: 'die', dice: [{ count: 2, sides: 6 }] }, queue(3, 4));
      eq(r.total, 7);
      deepEq(r.parts, {});
    });
  });

  group('размер кости живёт в данных', () => {
    test('бросается ровно то, что объявлено: смена sides меняет бросок без правки формул', () => {
      const asked = [];
      const spy = sides => { asked.push(sides); return 1; };
      rollLead({ kind: 'die', dice: [{ count: 1, sides: 10 }] }, spy);
      deepEq(asked, [10], 'движок спросил кость из данных, а не зашитую');
    });
  });

  group('режим броска', () => {
    test('преимущество на одиночной кости: две, берётся лучшая', () => {
      const r = rollLead(d20, queue(4, 17), 'advantage');
      deepEq(r.rolls, [4, 17]);
      eq(r.kept, 17);
      eq(r.total, 17);
      eq(r.mode, 'advantage');
    });

    test('помеха на одиночной кости: две, берётся худшая', () => {
      const r = rollLead(d20, queue(4, 17), 'disadvantage');
      eq(r.total, 4);
    });

    test('на составном броске режим не отыгрывается — честно помечено в результате', () => {
      // Что значит «преимущество» для пары Надежда/Страх, решает система,
      // а не движок; пока — в докe производственных отличий.
      const r = rollLead(daggerheart, queue(7, 4), 'advantage');
      eq(r.mode, 'normal', 'молча выбрать за систему было бы хуже, чем не выбрать');
      eq(r.total, 11);
    });

    test('на чтении, отличном от суммы, режим тоже не отыгрывается', () => {
      // «Преимущество для пула» — вопрос правок заявки следующего этапа
      // (+1 кость в Blades), а не выбора лучшей из двух СУММ пулов.
      const pool = { kind: 'die', dice: [{ count: 2, sides: 6 }], read: 'best' };
      const r = rollLead(pool, queue(3, 5), 'advantage');
      eq(r.mode, 'normal');
      eq(r.total, 5);
    });
  });

  group('чтение — как кости становятся числом', () => {
    const pool = read => ({ label: 'Пул', kind: 'die', dice: [{ count: 4, sides: 6 }], read });

    test('лучшая: Blades — пул d6, оставить старшую', () => {
      const r = rollLead(pool('best'), queue(3, 5, 2, 5));
      eq(r.total, 5);
      eq(r.kept, 5, 'оставленная кость видна журналу');
      eq(r.read, 'best');
      deepEq(r.rolls, [3, 5, 2, 5], 'выпавшее не переставляется — журнал честный');
    });

    test('худшая: ноль костей Blades ляжет сюда правкой заявки, чтение уже умеет', () => {
      eq(rollLead(pool('worst'), queue(3, 5, 2, 5)).total, 2);
    });

    test('оставить N: Traveller boon — 3d6, две лучшие суммой', () => {
      const boon = { kind: 'die', dice: [{ count: 3, sides: 6 }], read: { kind: 'best', keep: 2 } };
      const r = rollLead(boon, queue(3, 5, 2));
      eq(r.total, 8);
      eq(r.kept, null, 'две кости одной не покажешь');
    });

    test('счёт успехов: Shadowrun — кость не ниже пяти', () => {
      const r = rollLead(pool({ kind: 'count', atLeast: 5 }), queue(6, 5, 2, 1));
      eq(r.total, 2, 'total — прочитанное число, а не сумма');
      eq(r.kept, null);
      deepEq(r.tally, { dice: 4, atMax: 1, atMin: 1 }, 'глитчам следующего этапа есть на что смотреть');
    });

    test('счёту успехов нужен порог на кость — без него внятная ошибка', () => {
      throws(() => rollLead(pool({ kind: 'count' }), queue(1, 1, 1, 1)), 'порог');
    });

    test('неизвестное чтение — ошибка перечисляет реестр', () => {
      throws(() => rollLead(pool('котик'), queue(1, 1, 1, 1)), 'котик');
    });

    test('пустой пул — честный ноль, а не падение', () => {
      const r = rollLead({ kind: 'die', dice: [{ count: 0, sides: 6 }], read: 'best' }, queue());
      eq(r.total, 0);
      eq(r.kept, null);
    });
  });

  group('счёт костей — ссылка: пул собирается из листа', () => {
    const poolDef = { label: 'Пул', kind: 'die', dice: [{ count: { tag: 'pool' }, sides: 6 }] };

    test('unfoldDice разрешает счёт числом, исходник не трогает', () => {
      const solved = unfoldDice(poolDef, () => 3);
      deepEq(solved.dice, [{ count: 3, sides: 6 }]);
      deepEq(poolDef.dice, [{ count: { tag: 'pool' }, sides: 6 }], 'константа системы неизменна');
    });

    test('без разрешателя — внятная ошибка, а не тихий мусор', () => {
      throws(() => unfoldDice(poolDef), 'ссылка');
    });

    test('нецелый и отрицательный счёт — ошибка называет виновника', () => {
      throws(() => unfoldDice(poolDef, () => 2.5), 'целым');
      throws(() => unfoldDice(poolDef, () => -1), 'целым');
    });

    test('rollLead с неразвёрнутой ссылкой — ошибка отсылает к развёртке', () => {
      throws(() => rollLead(poolDef, queue(1)), 'unfoldDice');
    });
  });

  test('результат броска — чистые данные', () => {
    const r = rollLead(daggerheart, queue(7, 4));
    deepEq(JSON.parse(JSON.stringify(r)), r);
  });
});
