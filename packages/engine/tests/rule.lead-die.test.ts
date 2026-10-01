import { group, test, eq, deepEq, throws } from './harness.ts';
import { dieConstant, rollLead, unfoldDice } from '../src/engine/lead-die.ts';

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
      const { grown: _grown, keeps: _keeps, reading: _reading, plus: _plus, applied: _applied, ...seen } = rollLead(d20, queue(14));
      deepEq(seen, {
        edits: [], versusShift: 0, degreeShift: 0, read: 'sum', entries: [{ value: 14, sides: 20 }],
        rolls: [14], raw: [14], kept: 14, total: 14, parts: {},
        tally: { dice: 1, atMax: 0, atMin: 0 },
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

  group('правки броска приезжают записями словаря', () => {

    const advantage = {
      label: 'Преимущество',
      ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }],
    };
    const disadvantage = {
      label: 'Помеха',
      ops: [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }],
    };

    test('преимущество: добавить кость плюс оставить лучшую', () => {
      const r = rollLead(d20, queue(4, 17), [advantage]);
      deepEq(r.rolls, [4, 17]);
      eq(r.kept, 17);
      eq(r.total, 17);
      deepEq(r.edits, ['Преимущество'], 'журналу нужно ИМЯ автора, не примитивы');
    });

    test('помеха: та же добавленная кость, оставлена худшая', () => {
      eq(rollLead(d20, queue(4, 17), [disadvantage]).total, 4);
    });

    test('на составном броске правка тоже работает — сумма из трёх костей', () => {

      const r = rollLead(daggerheart, queue(7, 4, 9), [{ label: 'Прилив', ops: [{ op: 'addDie' }] }]);
      eq(r.rolls.length, 3);
      eq(r.total, 20);
      deepEq(r.parts, { hope: 7, fear: 4 }, 'добавленная кость — ничья, в части не лезет');
    });

    test('пул Blades: та же правка даёт лишнюю кость, чтение уже читает лучшую', () => {
      const pool = { kind: 'die', dice: [{ count: 2, sides: 6 }], read: 'best' };
      const r = rollLead(pool, queue(3, 5, 6), [{ label: 'Помощь', ops: [{ op: 'addDie' }] }]);
      deepEq(r.rolls, [3, 5, 6]);
      eq(r.total, 6);
    });

    test('ступень кости: Savage Worlds — к6 становится к8', () => {
      const trait = { kind: 'die', dice: [{ count: 1, sides: 6 }] };
      const asked: number[] = [];
      const spy = (sides: number) => { asked.push(sides); return 3; };
      rollLead(trait, spy, [{ label: 'Ступень', ops: [{ op: 'dieStep', by: 1 }] }]);
      deepEq(asked, [8], 'кинута кость следующей величины, а не прежняя');
    });

    test('сдвиг порога не трогает кости — его применяет сравнивающий', () => {
      const r = rollLead(d20, queue(11), [{ label: 'Фора', ops: [{ op: 'shiftVersus', by: -2 }] }]);
      eq(r.total, 11, 'бросок как был');
      eq(r.versusShift, -2, 'сдвиг уехал наверх, к порогу');
    });

    test('взрыв — правка РЕЗУЛЬТАТА: максимум кидается ещё раз и прибавляется', () => {
      const d6 = { kind: 'die', dice: [{ count: 1, sides: 6 }] };
      const r = rollLead(d6, queue(6, 6, 2), [{ label: 'Взрыв', ops: [{ op: 'explode' }] }]);
      eq(r.total, 14, '6 + 6 + 2');
      deepEq(r.tally, { dice: 1, atMax: 1, atMin: 0 },
        'счёт снят с НАТУРАЛЬНОГО броска: после взрыва максимума уже не видно');
    });

    test('неизвестный примитив — ошибка перечисляет реестр', () => {
      throws(() => rollLead(d20, queue(1), [{ label: 'Чудо', ops: [{ op: 'котик' }] }]), 'котик');
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
    const poolDef = { label: 'Пул', kind: 'die', dice: [{ count: { expr: '@pool' }, sides: 6 }] };

    test('unfoldDice разрешает счёт числом, исходник не трогает', () => {
      const solved = unfoldDice(poolDef, () => 3);
      deepEq(solved.dice, [{ count: 3, sides: 6 }]);
      deepEq(poolDef.dice, [{ count: { expr: '@pool' }, sides: 6 }], 'константа системы неизменна');
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

group('переворот цифр — правка результата, к100', () => {
  const d100 = { label: 'к100', kind: 'die', dice: [{ count: 1, sides: 100 }] };
  const low = { label: 'Переворот', ops: [{ op: 'flip', prefer: 'low' }] };
  const high = { label: 'Переворот против', ops: [{ op: 'flip', prefer: 'high' }] };

  test('71 становится 17, когда меньше — лучше', () => {
    const r = rollLead(d100, queue(71), [low]);
    eq(r.total, 17);
    deepEq(r.rolls, [17]);
    deepEq(r.edits, ['Переворот']);
  });

  test('17 остаётся 17: переворот берётся только когда он выгоден', () => {
    eq(rollLead(d100, queue(17), [low]).total, 17);
  });

  test('«в большую» — та же правка в другую сторону: 17 становится 71', () => {
    eq(rollLead(d100, queue(17), [high]).total, 71);
  });

  test('однозначное число дополняется нулём: 5 ↔ 50', () => {
    eq(rollLead(d100, queue(5), [high]).total, 50);
    eq(rollLead(d100, queue(50), [low]).total, 5);
  });

  test('сотня остаётся сотней, десятка переворачивается в единицу', () => {
    eq(rollLead(d100, queue(100), [low]).total, 100);
    eq(rollLead(d100, queue(10), [low]).total, 1);
  });

  test('кость не из степеней десяти переворот не трогает: к20 остаётся как есть', () => {
    eq(rollLead(d20, queue(17), [high]).total, 17);
  });

  test('переворот адресуется части броска', () => {
    const twin = {
      kind: 'die',
      dice: [{ count: 1, sides: 100, name: 'своя' }, { count: 1, sides: 100, name: 'чужая' }],
    };
    const r = rollLead(twin, queue(71, 82), [{ label: 'Своя', ops: [{ op: 'flip', part: 'своя' }] }]);
    deepEq(r.parts, { своя: 17, чужая: 82 });
  });

  test('счёт единиц и максимумов снят до переворота', () => {
    const r = rollLead(d100, queue(1), [high]);
    eq(r.total, 10, 'единица перевернулась в десятку');
    deepEq(r.tally, { dice: 1, atMax: 0, atMin: 1 }, 'а натуральная единица в счёте осталась');
  });
});

group('переброс с обязательным новым результатом', () => {
  const lucky = { label: 'Удача', ops: [{ op: 'reroll', n: 1 }] };

  test('единица перебрасывается, и берётся новое, даже если оно хуже некуда', () => {
    eq(rollLead(d20, queue(1, 14), [lucky]).total, 14);
    eq(rollLead(d20, queue(1, 1), [lucky]).total, 1, 'перебрасывается один раз');
  });

  test('не единица остаётся как есть', () => {
    eq(rollLead(d20, queue(5), [lucky]).total, 5);
  });

  test('порог переброса задаётся: не выше 2', () => {
    eq(rollLead(d20, queue(2, 9), [{ label: 'Щедрая удача', ops: [{ op: 'reroll', n: 2 }] }]).total, 9);
  });

  test('счёт единиц снят с натурального броска', () => {
    deepEq(rollLead(d20, queue(1, 14), [lucky]).tally, { dice: 1, atMax: 0, atMin: 1 });
  });

  test('переброс адресуется части броска', () => {
    const r = rollLead(daggerheart, queue(1, 1, 9), [{ label: 'Надежда', ops: [{ op: 'reroll', n: 1, part: 'hope' }] }]);
    deepEq(r.parts, { hope: 9, fear: 1 });
  });
});
