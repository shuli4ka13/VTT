import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { packRule, resolveRule } from '../src/engine/rule.ts';
import * as amountStep from '../src/engine/steps/amount.ts';
import * as thresholdStep from '../src/engine/steps/threshold.ts';
import * as applyStep from '../src/engine/steps/apply.ts';
import { newPass } from '../src/engine/calc.ts';
import { targets, incomingTagOf } from '../src/engine/targets.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const SYS = {
  ...system,
  constants: { lead_die: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
};

const run = (steps, opts = {}) => {
  const {
    sys = SYS, sender = arven, die = queue(),
    targetSys = sys, targetSheet = mirra, targetDie = queue(),
    params = {}, paramDefs = [], props = null,
    book = compendium, targetBook = compendium,
  } = opts;
  const packed = packRule({ params: paramDefs, steps }, {
    system: sys, sheet: sender, pass: newPass(sys, sender, { compendium: book }),
    die, params, props, owner: 'тест',
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
      natural: 10,
      rolled: 1, atMax: 0, atMin: 0, edited: false,
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
    const poisoned = { ...arven, effects: [{ effectId: 'poisoned' }] };
    const out = run([hit()], { sender: poisoned, die: queue(17, 4) });
    deepEq(out.results.hit.dice, { rolls: [17, 4], kept: 4 }, 'взята худшая кость');
  });

  test('порог на стороне цели: бросает получатель, своими модификаторами', () => {

    const save = {
      id: 'save', type: 'threshold', side: 'target',
      roll: { die: { constant: 'lead_die' }, bonus: { expr: '#dex_save', of: 'target' }, check: 'save_roll' },
      versus: { expr: '#spell_dc' },
      continueOn: 'fail',
    };

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
      { die: queue(5), props: { damage_dice: '1d8' } });
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
      { die: queue(), props: { damage_flat: 3 } });
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
      { props: { damage_flat: 8 } });
    eq(out.stopped, null);
    eq(out.results.pen.margin, 3);
  });

  test('ниже порога: обрыв, и запись в журнале ДРУГАЯ, чем у порога', () => {
    const out = run([dmg, { id: 'pen', type: 'compare', value: { ref: 'dmg' }, versus: { const: 5 } }],
      { props: { damage_flat: 3 } });
    eq(out.stopped.reason, 'compare-short');
    eq(out.trace[1].margin, -2, 'трасса есть и у оборвавшего шага');
  });

  test('равенство при «less» проходит', () => {
    const out = run([dmg, { id: 'pen', type: 'compare', value: { ref: 'dmg' }, versus: { const: 5 } }],
      { props: { damage_flat: 5 } });
    eq(out.stopped, null);
    eq(out.results.pen.margin, 0);
  });

  test('равенство при «atMost» обрывает', () => {
    const out = run([dmg, { id: 'pen', type: 'compare', value: { ref: 'dmg' }, versus: { const: 5 }, breakIf: 'atMost' }],
      { props: { damage_flat: 5 } });
    eq(out.stopped.reason, 'compare-short');
  });

  test('неизвестное условие обрыва — ошибка', () => {
    throws(() => run([dmg, { id: 'pen', type: 'compare', value: { ref: 'dmg' }, versus: { const: 5 }, breakIf: 'котик' }],
      { props: { damage_flat: 5 } }), 'котик');
  });
});

group('шаг «применить»', () => {

  test('вычесть: хиты падают, журнал изменений полон', () => {
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { const: 8 } }]);
    deepEq(out.changes, [{ tag: 'hp_current', from: 21, to: 13 }]);
    eq(out.sheet.values.hp_current, 13);
    eq(mirra.values.hp_current, 21, 'исходный лист не тронут');
  });

  test('нижняя граница поля держит: хиты не уходят ниже нуля', () => {
    const weak = { ...mirra, values: { ...mirra.values, hp_current: 3 } };
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { const: 8 } }],
      { targetSheet: weak });
    eq(out.sheet.values.hp_current, 0, 'min поля, эффект о нуле не знает');
  });

  test('верхняя граница-формула: лечение не выше максимума хитов', () => {
    const wounded = { ...mirra, values: { ...mirra.values, hp_current: 15 } };
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'add', value: { const: 10 } }],
      { targetSheet: wounded });
    eq(out.sheet.values.hp_current, 21, '15 + 10, но max поля — «#hp_max» листа цели');
  });

  test('присвоить: направление «set» пишет величину как есть', () => {
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'set', value: { const: 5 } }]);
    eq(out.sheet.values.hp_current, 5);
  });

  test('модификаторы цели: сопротивление половинит входящее, округляя вниз', () => {
    const stony = { ...mirra, effects: [{ effectId: 'stoneskin' }] };
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { const: 9 }, targetModifiers: true }],
      { targetSheet: stony });
    eq(out.sheet.values.hp_current, 17, '21 минус floor(9/2)');
    eq(out.trace[0].incoming, 9, 'в трассе видно, что пришло…');
    eq(out.trace[0].amount, 4, '…и что осталось после сопротивлений');
  });

  test('без targetModifiers сопротивление не участвует — лечение и износ идут мимо него', () => {
    const stony = { ...mirra, effects: [{ effectId: 'stoneskin' }] };
    const out = run([{ type: 'apply', target: { tag: 'hp_current' }, direction: 'subtract', value: { const: 9 }, targetModifiers: false }],
      { targetSheet: stony });
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

  const withStacking = stacking => ({
    ...SYS,
    effects: { ...SYS.effects, poisoned: { ...SYS.effects.poisoned, stacking } },
  });
  const twice = sys => run([
    { type: 'status', effect: { const: 'poisoned' } },
    { type: 'status', effect: { const: 'poisoned' } },
  ], { sys });

  test('вешает эффект на цель', () => {
    const out = run([{ type: 'status', effect: { const: 'poisoned' } }]);
    deepEq(out.sheet.effects, [{ effectId: 'poisoned' }]);
    deepEq(out.effects, ['poisoned']);
  });

  test('«не накладывается повторно» — одна запись, второй раз молчание', () => {
    const out = twice(withStacking('ignore'));
    deepEq(out.sheet.effects, [{ effectId: 'poisoned' }]);
  });

  test('«обновляется» — тоже одна запись: наложили заново, а не рядом', () => {
    const out = twice(withStacking('refresh'));
    deepEq(out.sheet.effects, [{ effectId: 'poisoned' }]);
    deepEq(out.effects, ['poisoned'], 'журналу нужен факт, а не счёт наложений');
  });

  test('«копится» — каждое наложение отдельной записью', () => {
    const out = twice(withStacking('stack'));
    eq(out.sheet.effects.length, 2);
  });

  test('режим «снять» убирает висящий эффект', () => {
    const out = run([{ type: 'status', mode: 'remove', effect: { const: 'poisoned' } }],
      { targetSheet: { ...mirra, effects: [{ effectId: 'poisoned' }] } });
    deepEq(out.sheet.effects, []);
    deepEq(out.removed, ['poisoned']);
  });

  test('пустой слот — законная пустота: шаг молчит, а не падает', () => {
    const out = run([{ type: 'status', effect: { const: null } }]);
    deepEq(out.sheet.effects, [], 'ничего не наложено');
    eq(out.trace[0].effect, null, 'и в журнале это видно');
  });

  test('эффект, которого система не объявляет, — внятная ошибка', () => {
    throws(() => run([{ type: 'status', effect: { const: 'нетакого' } }]), 'нетакого');
  });
});

group('линт шага — для приговора в конструкторе', () => {

  test('величина: источник без своего слота — беда видна без броска', () => {
    const { lint } = amountStep;
    ok(lint({ type: 'amount', source: 'margin', dice: { const: '1d8' } }).includes('margin'));
    ok(lint({ type: 'amount', source: 'roll' }).includes('кост'));
    ok(lint({ type: 'amount', source: 'item' }).includes('fixed'));
    eq(lint({ type: 'amount', source: 'roll', dice: { const: '1d8' } }), null);
    eq(lint({ type: 'amount', source: { param: 'source' } }), null, 'источник из параметра статически не проверить — и это не беда');
  });

  test('порог: без кости-константы', () => {
    const { lint } = thresholdStep;
    ok(lint({ type: 'threshold' }).includes('кост'));
    eq(lint({ type: 'threshold', roll: { die: { constant: 'lead_die' } } }), null);
  });

  test('применить: без мишени или величины', () => {
    const { lint } = applyStep;
    ok(lint({ type: 'apply', value: { const: 1 } }).includes('мишен'));
    ok(lint({ type: 'apply', target: { tag: 'hp' } }).includes('величин'));
    eq(lint({ type: 'apply', target: { tag: 'hp' }, value: { const: 1 } }), null);
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
