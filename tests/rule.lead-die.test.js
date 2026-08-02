import { group, test, eq, deepEq, throws } from './harness.js';
import { dieConstant, rollLead } from '../src/engine/lead-die.js';

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
  });

  test('результат броска — чистые данные', () => {
    const r = rollLead(daggerheart, queue(7, 4));
    deepEq(JSON.parse(JSON.stringify(r)), r);
  });
});
