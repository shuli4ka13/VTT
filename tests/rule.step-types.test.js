import { group, test, eq, ok, deepEq, throws } from './harness.js';
import { packRule, resolveRule } from '../src/engine/rule.js';
import { newPass } from '../src/engine/calc.js';
import { targets, incomingTagOf } from '../src/engine/targets.js';
import { system } from '../src/model/system.js';
import { arven, mirra } from '../src/model/sheets.js';
import { compendium } from '../src/model/compendium.js';

// Встроенные типы шагов. Каждый тест гоняет шаг через ОБЕ фазы —
// packRule (отправитель) и resolveRule (получатель) — потому что разрез
// конверта и есть самое ломкое место каждого типа.

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

// Система тестов — срез 5e плюс ведущая кость. В данных системы она появится
// в фазе данных; здесь достраиваем локально, как и подобает тесту движка.
const SYS = {
  ...system,
  constants: { lead_die: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
};

// Арвен: бонус атаки 6, Сила +3, спасбросок Ловкости +1, хиты 44.
// Мирра: КД 14, сложность заклинаний 13, хиты 21.
const run = (steps, opts = {}) => {
  const {
    sys = SYS, sender = arven, die = queue(),
    targetSys = sys, targetSheet = mirra, targetDie = queue(),
    params = {}, paramDefs = [], item = null,
    book = compendium, targetBook = compendium,
  } = opts;
  const packed = packRule({ params: paramDefs, steps }, {
    system: sys, sheet: sender, pass: newPass(sys, sender, { compendium: book }),
    die, params, item, owner: 'тест',
  });
  deepEq(JSON.parse(JSON.stringify(packed)), packed, 'упакованная цепочка — чистые данные');
  return resolveRule(packed, {
    system: targetSys, sheet: targetSheet,
    pass: newPass(targetSys, targetSheet, { compendium: targetBook }),
    die: targetDie, owner: 'тест',
  });
};

const hit = (over = {}) => ({
  id: 'hit', type: 'threshold',
  roll: { die: { constant: 'lead_die' }, bonus: { expr: '#attack_bonus' }, check: 'attack_roll' },
  versus: { tag: 'ac' },
  ...over,
});

group('шаг «порог»', () => {
  test('отправитель бросает ведущую кость, против — считает получатель', () => {
    const out = run([hit()], { die: queue(10) });
    deepEq(out.results.hit, {
      success: true, margin: 2, total: 16,
      dice: { rolls: [10], kept: 10 }, parts: {},
    }, 'бросок 10 + бонус 6 против КД Мирры 14');
    eq(out.stopped, null);
    deepEq(out.trace[0].versus, { tag: 'ac', value: 14 });
  });

  test('провал обрывает цепочку, запись в журнале — «порог не взят»', () => {
    const out = run([hit(), { id: 'после', type: 'amount', source: 'roll', dice: { const: '1d8' } }],
      { die: queue(2, 5) });
    eq(out.stopped.reason, 'threshold-miss');
    eq(out.stopped.step, 'hit');
    eq(out.trace.length, 1, 'до шага «после» дело не дошло');
    eq(out.trace[0].success, false);
    eq(out.trace[0].margin, -6);
  });

  test('модификаторы броска отправителя отыгрываются при упаковке', () => {
    const poisoned = { ...arven, effects: [{ effectId: 'poisoned' }] }; // помеха на атаку
    const out = run([hit()], { sender: poisoned, die: queue(17, 4) });
    deepEq(out.results.hit.dice, { rolls: [17, 4], kept: 4 }, 'взята худшая кость');
  });

  test('порог на стороне цели: бросает получатель, своими модификаторами', () => {
    // Спасбросок — тот же тип шага, никакого специального «save» в движке.
    const save = {
      id: 'save', type: 'threshold', side: 'target',
      roll: { die: { constant: 'lead_die' }, bonus: { expr: '#dex_save', of: 'target' }, check: 'save_roll' },
      versus: { expr: '#spell_dc' },
      continueOn: 'fail',
    };
    // Сложность посчитана отправителем (Мирра, 13) и уехала числом.
    const failed = run([save], { sender: mirra, targetSheet: arven, targetDie: queue(5) });
    eq(failed.stopped, null, 'цель провалилась — цепочка продолжается');
    deepEq(failed.results.save.dice, { rolls: [5], kept: 5 });
    eq(failed.results.save.margin, -7, 'спасбросок 6 против сложности 13');

    const held = run([save], { sender: mirra, targetSheet: arven, targetDie: queue(19) });
    eq(held.stopped.reason, 'threshold-held', 'цель спаслась — обрыв, и он различим в журнале');
  });

  test('составная ведущая кость: total сравнивается, части доступны дальше', () => {
    const duality = {
      ...SYS,
      constants: {
        lead_die: {
          label: 'Кости дуальности', kind: 'die',
          dice: [{ sides: 12, name: 'hope' }, { sides: 12, name: 'fear' }],
        },
      },
    };
    const out = run([
      hit({ versus: { const: 10 } }),
      { id: 'pen', type: 'compare', value: { ref: 'hit.parts.hope' }, versus: { const: 5 } },
    ], { sys: duality, die: queue(7, 4) });
    eq(out.results.hit.total, 17, 'сумма 11 плюс бонус 6 — total есть всегда');
    eq(out.results.hit.success, true);
    eq(out.results.pen.margin, 2, 'а на Надежду смотрит только шаг, которому она нужна');
  });

  test('сравнивать бросок с текстовым полем нельзя — внятная ошибка', () => {
    throws(() => run([hit({ versus: { tag: 'race' } })], { die: queue(10) }), 'race');
  });

  test('порог без кости — ошибка при упаковке, а не в бою', () => {
    throws(() => run([hit({ roll: { bonus: { const: 0 } } })]), 'кост');
  });
});

group('шаг «величина»', () => {
  test('свой бросок: кость из записи оружия плюс бонус-выражение', () => {
    const out = run([{ id: 'dmg', type: 'amount', source: 'roll', dice: { item: 'damage_dice' }, bonus: { expr: '#str_mod' } }],
      { die: queue(5), item: { damage_dice: '1d8' } });
    eq(out.results.dmg, 8, 'кость 5 плюс Сила 3');
    eq(out.trace[0].total, 8);
    deepEq(out.trace[0].rolls, [5]);
  });

  test('превышение: база плюс превышение порога по имени', () => {
    const out = run([
      hit(),
      { id: 'dmg', type: 'amount', source: 'margin', fixed: { const: 3 }, margin: { ref: 'hit.margin' } },
    ], { die: queue(10) });
    eq(out.results.dmg, 5, 'нож 3 плюс превышение 2');
    eq(out.trace[1].margin, 2, 'слагаемые видны в трассе');
  });

  test('фикс предмета: костей не бросали вовсе', () => {
    const out = run([{ id: 'dmg', type: 'amount', source: 'item', fixed: { item: 'damage_flat' } }],
      { die: queue(), item: { damage_flat: 3 } });
    eq(out.results.dmg, 3);
    deepEq(out.trace[0].rolls, [], 'очередь костей пуста — и не понадобилась');
  });

  test('источник требует свои слоты: без них — ошибка при упаковке', () => {
    throws(() => run([{ id: 'd', type: 'amount', source: 'roll' }]), 'кост');
    throws(() => run([{ id: 'd', type: 'amount', source: 'item' }]), 'fixed');
    throws(() => run([{ id: 'd', type: 'amount', source: 'margin', fixed: { const: 3 } }]), 'margin');
  });

  test('неизвестный источник — ошибка с перечнем', () => {
    const err = throws(() => run([{ id: 'd', type: 'amount', source: 'котик' }]), 'котик');
    ok(err.message.includes('roll'), 'перечень допустимых — в сообщении');
  });
});

group('шаг «сравнение»', () => {
  const dmg = { id: 'dmg', type: 'amount', source: 'item', fixed: { item: 'damage_flat' } };

  test('выше порога: разница доступна дальше по имени', () => {
    const out = run([dmg, { id: 'pen', type: 'compare', value: { ref: 'dmg' }, versus: { const: 5 } }],
      { item: { damage_flat: 8 } });
    eq(out.stopped, null);
    eq(out.results.pen.margin, 3);
  });

  test('ниже порога: обрыв, и запись в журнале ДРУГАЯ, чем у порога', () => {
    const out = run([dmg, { id: 'pen', type: 'compare', value: { ref: 'dmg' }, versus: { const: 5 } }],
      { item: { damage_flat: 3 } });
    eq(out.stopped.reason, 'compare-short');
    eq(out.trace[1].margin, -2, 'трасса есть и у оборвавшего шага');
  });

  test('равенство при «less» проходит', () => {
    const out = run([dmg, { id: 'pen', type: 'compare', value: { ref: 'dmg' }, versus: { const: 5 } }],
      { item: { damage_flat: 5 } });
    eq(out.stopped, null);
    eq(out.results.pen.margin, 0);
  });

  test('равенство при «atMost» обрывает', () => {
    const out = run([dmg, { id: 'pen', type: 'compare', value: { ref: 'dmg' }, versus: { const: 5 }, breakIf: 'atMost' }],
      { item: { damage_flat: 5 } });
    eq(out.stopped.reason, 'compare-short');
  });

  test('неизвестное условие обрыва — ошибка', () => {
    throws(() => run([dmg, { id: 'pen', type: 'compare', value: { ref: 'dmg' }, versus: { const: 5 }, breakIf: 'котик' }],
      { item: { damage_flat: 5 } }), 'котик');
  });
});

group('шаг «применить»', () => {
  test('вычесть с полом: хиты падают, журнал изменений полон', () => {
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { const: 8 }, floor: { const: 0 } }]);
    deepEq(out.changes, [{ tag: 'hp_current', from: 21, to: 13 }]);
    eq(out.sheet.values.hp_current, 13);
    eq(mirra.values.hp_current, 21, 'исходный чарник не тронут');
  });

  test('пол держит: хиты не уходят ниже нуля', () => {
    const weak = { ...mirra, values: { ...mirra.values, hp_current: 3 } };
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { const: 8 }, floor: { const: 0 } }],
      { targetSheet: weak });
    eq(out.sheet.values.hp_current, 0);
  });

  test('прибавить с потолком-тегом: лечение не выше максимума хитов', () => {
    const wounded = { ...mirra, values: { ...mirra.values, hp_current: 15 } };
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'add', value: { const: 10 }, ceiling: { tag: 'hp_max' } }],
      { targetSheet: wounded });
    eq(out.sheet.values.hp_current, 21, '15 + 10, но потолок 21');
    eq(out.trace[0].ceiling, 21, 'потолок посчитан листом цели и виден в трассе');
  });

  test('присвоить: направление «set» пишет величину как есть', () => {
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'set', value: { const: 5 } }]);
    eq(out.sheet.values.hp_current, 5);
  });

  test('модификаторы цели: сопротивление половинит входящее, округляя вниз', () => {
    const stoneskin = {
      id: 'stoneskin', label: 'Каменная кожа', duration: { kind: 'scene' },
      modifiers: [{ kind: 'value', target: incomingTagOf('hp_current'), op: 'mul', value: 0.5, stacking: 'sum', condition: null }],
    };
    const book = { ...compendium, effects: [...compendium.effects, stoneskin] };
    const stony = { ...mirra, effects: [{ effectId: 'stoneskin' }] };
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { const: 9 }, floor: { const: 0 }, targetModifiers: true }],
      { targetSheet: stony, targetBook: book });
    eq(out.sheet.values.hp_current, 17, '21 минус floor(9/2)');
    eq(out.trace[0].incoming, 9, 'в трассе видно, что пришло…');
    eq(out.trace[0].amount, 4, '…и что осталось после сопротивлений');
  });

  test('без targetModifiers сопротивление не участвует — лечение и износ идут мимо него', () => {
    const stoneskin = {
      id: 'stoneskin', label: 'Каменная кожа', duration: { kind: 'scene' },
      modifiers: [{ kind: 'value', target: incomingTagOf('hp_current'), op: 'mul', value: 0.5, stacking: 'sum', condition: null }],
    };
    const book = { ...compendium, effects: [...compendium.effects, stoneskin] };
    const stony = { ...mirra, effects: [{ effectId: 'stoneskin' }] };
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { const: 9 }, targetModifiers: false }],
      { targetSheet: stony, targetBook: book });
    eq(out.sheet.values.hp_current, 12, '21 минус все 9');
  });

  test('в вычисляемое поле писать нельзя — его считает движок, а не событие', () => {
    throws(() => run([{ type: 'apply', target: { tag: 'ac' }, direction: 'subtract', value: { const: 1 } }]), 'ac');
  });

  test('неизвестное направление — ошибка с перечнем', () => {
    throws(() => run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'котик', value: { const: 1 } }]), 'котик');
  });
});

group('шаг «состояние»', () => {
  test('вешает эффект на цель, повторно — не дублирует', () => {
    const out = run([
      { type: 'status', effect: { const: 'poisoned' } },
      { type: 'status', effect: { const: 'poisoned' } },
    ]);
    deepEq(out.sheet.effects, [{ effectId: 'poisoned' }]);
    deepEq(out.effects, ['poisoned']);
  });
});

group('мишени «входящее»', () => {
  test('словарь мишеней выводит входящее для хранимых полей', () => {
    const list = targets(SYS);
    const incoming = list.find(t => t.tag === incomingTagOf('hp_current'));
    ok(incoming, 'у хранимого поля есть мишень входящего');
    eq(incoming.kind, 'incoming');
    eq(incoming.from, 'hp_current');
    ok(!list.some(t => t.tag === incomingTagOf('ac')), 'у формульного поля входящего нет: в него не пишут');
  });
});
