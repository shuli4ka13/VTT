import { group, test, eq, ok, deepEq, throws } from './harness.js';
import { calc, newPass } from '../src/engine/calc.js';
import { resolveRoll } from '../src/engine/modifiers.js';
import { targets, assertTarget } from '../src/engine/targets.js';
import { UnknownTagError } from '../src/engine/errors.js';
import { system } from '../src/model/system.js';
import { arven, mirra } from '../src/model/sheets.js';
import { compendium } from '../src/model/compendium.js';

const withGear = (sheet, book = compendium) => newPass(system, sheet, { compendium: book });
const ac = (sheet, book) => calc(system, sheet, 'ac', withGear(sheet, book));

// Новые предметы и эффекты добавляются ТОЛЬКО правкой данных.
// Ни одна строчка движка ниже не меняется.
const plus = (id, label, target, value, stacking = 'sum') => ({
  id, label, slot: 'ring',
  modifiers: [{ kind: 'value', target, op: 'add', value, stacking, condition: null }],
});

const book = extraItems => ({
  items: [...compendium.items, ...extraItems],
  effects: compendium.effects,
});

group('модификаторы', () => {
  group('правящие значение', () => {
    test('без снаряжения класс брони считается по голым характеристикам', () => {
      eq(ac({ ...arven, equipped: [] }), 11);
    });

    test('кольчуга задаёт базу доспеха и гасит вклад Ловкости', () => {
      eq(ac(arven), 16);
    });

    test('новый предмет с бонусом добавляется правкой данных, без правки движка', () => {
      const ring = plus('ring-of-protection', 'Кольцо защиты', 'ac', 1);
      eq(ac({ ...arven, equipped: ['chain-mail', 'ring-of-protection'] }, book([ring])), 17);
    });

    test('модификатор может ссылаться на формулу, а не только на число', () => {
      const belt = {
        id: 'belt', label: 'Пояс', slot: 'waist',
        modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '#prof_bonus' }, stacking: 'sum', condition: null }],
      };
      eq(ac({ ...arven, equipped: ['belt'] }, book([belt])), 11 + 3);
    });
  });

  group('правила стакинга', () => {
    const two = [plus('a', 'A', 'ac', 1), plus('b', 'B', 'ac', 2)];
    const sheet = stacking => ({
      ...arven,
      equipped: ['a', 'b'],
    });

    test('sum складывает все бонусы', () => {
      eq(ac(sheet(), book(two)), 11 + 3);
    });

    test('max берёт только наибольший', () => {
      const maxTwo = [plus('a', 'A', 'ac', 1, 'max'), plus('b', 'B', 'ac', 2, 'max')];
      eq(ac(sheet(), book(maxTwo)), 11 + 2);
    });

    test('override оставляет последний применившийся', () => {
      const setTwo = [
        { id: 'a', label: 'A', modifiers: [{ kind: 'value', target: 'ac', op: 'set', value: 20, stacking: 'override', condition: null }] },
        { id: 'b', label: 'B', modifiers: [{ kind: 'value', target: 'ac', op: 'set', value: 5, stacking: 'override', condition: null }] },
      ];
      eq(ac(sheet(), book(setTwo)), 5);
    });

    test('разные правила стакинга на одной мишени не мешают друг другу', () => {
      const mixed = [plus('a', 'A', 'ac', 1, 'sum'), plus('b', 'B', 'ac', 5, 'max'), plus('c', 'C', 'ac', 3, 'max')];
      eq(ac({ ...arven, equipped: ['a', 'b', 'c'] }, book(mixed)), 11 + 1 + 5);
    });
  });

  group('условия', () => {
    const conditional = cond => ({
      id: 'cond', label: 'Условный', slot: 'ring',
      modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: 10, stacking: 'sum', condition: cond }],
    });

    test('модификатор с истинным условием применяется', () => {
      eq(ac({ ...arven, equipped: ['cond'] }, book([conditional('#level >= 5')])), 21);
    });

    test('модификатор с ложным условием не применяется', () => {
      eq(ac({ ...arven, equipped: ['cond'] }, book([conditional('#level >= 99')])), 11);
    });

    test('условие считается по чарнику владельца, а не по константам', () => {
      const gear = book([conditional('#dex_mod > 2')]);
      eq(ac({ ...arven, equipped: ['cond'] }, gear), 11, 'у Арвен Ловкость мала');
      eq(ac({ ...mirra, equipped: ['cond'] }, gear), 24, 'у Мирры Ловкость велика');
    });
  });

  group('правящие бросок — другая порода, не арифметика', () => {
    const poisoned = sheet => ({ ...sheet, effects: [{ effectId: 'poisoned' }] });

    test('без эффектов бросок обычный', () => {
      eq(resolveRoll(system, arven, 'attack_roll', withGear(arven)).mode, 'normal');
    });

    test('отравление даёт помеху на бросок атаки', () => {
      const sheet = poisoned(arven);
      eq(resolveRoll(system, sheet, 'attack_roll', withGear(sheet)).mode, 'disadvantage');
    });

    test('помеха не является числом и в значение не превращается', () => {
      const sheet = poisoned(arven);
      eq(calc(system, sheet, 'attack_bonus', withGear(sheet)), 6, 'бонус атаки не изменился');
    });

    test('преимущество и помеха гасят друг друга', () => {
      const blessed = {
        id: 'blessed', label: 'Благословение', duration: { kind: 'scene' },
        modifiers: [{ kind: 'roll', target: 'attack_roll', effect: 'advantage', method: 'rerollBest', condition: null }],
      };
      const gear = { items: compendium.items, effects: [...compendium.effects, blessed] };
      const sheet = { ...arven, effects: [{ effectId: 'poisoned' }, { effectId: 'blessed' }] };
      eq(resolveRoll(system, sheet, 'attack_roll', newPass(system, sheet, { compendium: gear })).mode, 'normal');
    });

    test('два преимущества не складываются — это по-прежнему одно преимущество', () => {
      const adv = n => ({
        id: 'adv' + n, label: 'Пре' + n, duration: { kind: 'scene' },
        modifiers: [{ kind: 'roll', target: 'attack_roll', effect: 'advantage', method: 'rerollBest', condition: null }],
      });
      const gear = { items: compendium.items, effects: [adv(1), adv(2)] };
      const sheet = { ...arven, effects: [{ effectId: 'adv1' }, { effectId: 'adv2' }] };
      const roll = resolveRoll(system, sheet, 'attack_roll', newPass(system, sheet, { compendium: gear }));
      eq(roll.mode, 'advantage');
      eq(roll.sources.length, 2, 'оба источника видны в разборе броска');
    });

    test('механика преимущества берётся из модификатора, а не зашита в движок', () => {
      const sheet = poisoned(arven);
      deepEq(resolveRoll(system, sheet, 'attack_roll', withGear(sheet)).methods, ['rerollBest']);
    });
  });

  group('правила самой системы', () => {
    // Третий источник наравне с предметами и эффектами: модификатор, объявленный
    // в системе, действует на всех её чарников без надевания и навешивания.
    const withRule = mod => ({ ...system, modifiers: [mod] });

    test('правило системы применяется без предметов и эффектов', () => {
      const sys = withRule({
        kind: 'roll', label: 'Тяжёлый доспех мешает', target: 'skill_roll',
        effect: 'disadvantage', method: 'rerollBest', condition: null,
      });
      const p = newPass(sys, arven, { compendium });
      eq(resolveRoll(sys, arven, 'skill_roll', p).mode, 'disadvantage');
    });

    test('условие правила считается по каждому чарнику отдельно', () => {
      const sys = withRule({
        kind: 'roll', label: 'Мастерство даёт фору', target: 'skill_roll',
        effect: 'advantage', method: 'rerollBest', condition: '#prof_bonus >= 3',
      });
      eq(resolveRoll(sys, arven, 'skill_roll', newPass(sys, arven, { compendium })).mode,
        'advantage', 'у Арвен бонус мастерства 3');
      eq(resolveRoll(sys, mirra, 'skill_roll', newPass(sys, mirra, { compendium })).mode,
        'normal', 'у Мирры 2');
    });

    test('правило системы гасится помехой от эффекта наравне с прочими', () => {
      const sys = withRule({
        kind: 'roll', label: 'Фора', target: 'attack_roll',
        effect: 'advantage', method: 'rerollBest', condition: null,
      });
      const sheet = { ...arven, effects: [{ effectId: 'poisoned' }] };
      eq(resolveRoll(sys, sheet, 'attack_roll', newPass(sys, sheet, { compendium })).mode, 'normal');
    });

    test('правило системы может править и значение, а не только бросок', () => {
      const sys = withRule({
        kind: 'value', label: 'Домашнее правило: +1 ко всем КД', target: 'ac',
        op: 'add', value: 1, stacking: 'sum', condition: null,
      });
      eq(calc(sys, mirra, 'ac', newPass(sys, mirra, { compendium })), 15);
    });

    test('источник правила виден в разборе броска под своим ярлыком', () => {
      const sys = withRule({
        kind: 'roll', label: 'Тяжёлый доспех мешает', target: 'skill_roll',
        effect: 'disadvantage', method: 'rerollBest', condition: null,
      });
      const roll = resolveRoll(sys, arven, 'skill_roll', newPass(sys, arven, { compendium }));
      eq(roll.sources[0].label, 'Тяжёлый доспех мешает');
      eq(roll.sources[0].type, 'rule');
    });
  });

  group('числовой бонус к броску — третий род модификатора', () => {
    // «+5 ко всем проверкам» — это не +5 к характеристике и не преимущество.
    // Это прибавка к самому броску. В черновике бонус и штраф стояли отдельно
    // от преимущества и помехи (reference/index.html:2709), и правильно.
    const bonus = (value, condition = null) => ({
      id: 'guidance', label: 'Наставление', duration: { kind: 'scene' },
      modifiers: [{ kind: 'roll', target: 'skill_roll', op: 'add', value, stacking: 'sum', condition }],
    });
    const gear = fx => ({ items: compendium.items, effects: [...compendium.effects, fx] });
    const hung = { ...arven, effects: [{ effectId: 'guidance' }] };
    const roll = fx => resolveRoll(system, hung, 'skill_roll',
      newPass(system, hung, { compendium: gear(fx) }));

    test('прибавка к броску приходит числом', () => {
      eq(roll(bonus(5)).bonus, 5);
    });

    test('без модификаторов прибавки нет', () => {
      eq(resolveRoll(system, arven, 'skill_roll', newPass(system, arven, { compendium })).bonus, 0);
    });

    test('прибавка может быть формулой', () => {
      eq(roll(bonus({ expr: '#prof_bonus' })).bonus, 3, 'бонус мастерства Арвен');
    });

    test('прибавка не отменяет и не заменяет преимущество', () => {
      const both = {
        id: 'guidance', label: 'Наставление', duration: { kind: 'scene' },
        modifiers: [
          { kind: 'roll', target: 'skill_roll', op: 'add', value: 2, stacking: 'sum', condition: null },
          { kind: 'roll', target: 'skill_roll', effect: 'advantage', method: 'rerollBest', condition: null },
        ],
      };
      // Без кольчуги: иначе правило комнаты «тяжёлый доспех мешает ловким
      // проверкам» даёт помеху, и она гасит преимущество — как и должна.
      const bare = { ...arven, equipped: [], effects: [{ effectId: 'guidance' }] };
      const result = resolveRoll(system, bare, 'skill_roll',
        newPass(system, bare, { compendium: gear(both) }));
      eq(result.bonus, 2, 'число живёт отдельно от режима');
      eq(result.mode, 'advantage');
    });

    test('прибавка остаётся, даже когда преимущество погашено помехой', () => {
      const both = {
        id: 'guidance', label: 'Наставление', duration: { kind: 'scene' },
        modifiers: [
          { kind: 'roll', target: 'skill_roll', op: 'add', value: 2, stacking: 'sum', condition: null },
          { kind: 'roll', target: 'skill_roll', effect: 'advantage', method: 'rerollBest', condition: null },
        ],
      };
      // У Арвен кольчуга → правило комнаты даёт помеху → преимущество гасится.
      const result = roll(both);
      eq(result.mode, 'normal', 'помеха от правила комнаты погасила преимущество');
      eq(result.bonus, 2, 'а число уцелело: это другая порода');
    });

    test('прибавка с ложным условием не применяется', () => {
      eq(roll(bonus(5, '#level >= 99')).bonus, 0);
    });

    test('эффект может править и значение поля, не только бросок', () => {
      const wise = {
        id: 'guidance', label: 'Мудрость свыше', duration: { kind: 'scene' },
        modifiers: [{ kind: 'value', target: 'wis', op: 'add', value: 5, stacking: 'sum', condition: null }],
      };
      eq(calc(system, hung, 'wis', newPass(system, hung, { compendium: gear(wise) })), 17);
      eq(calc(system, hung, 'wis_mod', newPass(system, hung, { compendium: gear(wise) })), 3,
        'модификатор Мудрости пересчитался следом');
    });
  });

  group('словарь мишеней выводится из системы', () => {
    test('в него попадают все поля, все броски и входящее хранимых полей', () => {
      const all = targets(system);
      const derived = system.fields.filter(f => f.roll).length;
      const incoming = system.fields.filter(f => f.value.kind === 'stored').length;
      eq(all.length, system.fields.length + system.rolls.length + derived + incoming,
        'поля, объявленные броски, броски из полей и входящее хранимых');
      ok(all.some(t => t.tag === 'ac' && t.kind === 'value'));
      ok(all.some(t => t.tag === 'attack_roll' && t.kind === 'roll'));
      ok(all.some(t => t.tag === 'incoming:hp_current' && t.kind === 'incoming'),
        'на входящее вешаются сопротивления');
    });

    test('мишень отдаёт человеческий лейбл, а не тег', () => {
      eq(targets(system).find(t => t.tag === 'ac').label, 'Класс брони');
    });

    test('модификатор на необъявленную мишень отвергается', () => {
      throws(() => assertTarget(system, 'нетакой'), UnknownTagError, 'нетакой');
    });

    test('предмет с необъявленной мишенью роняет сборку модификаторов', () => {
      const bogus = plus('bogus', 'Мимо', 'несуществующий_тег', 1);
      const sheet = { ...arven, equipped: ['bogus'] };
      throws(() => calc(system, sheet, 'ac', newPass(system, sheet, { compendium: book([bogus]) })), UnknownTagError);
    });
  });
});

// ── мишени броска выводятся из полей ────────────────────────────────────────
//
// «+5 к проверкам Мудрости» некуда было целить: мишень броска на всю систему
// была одна — «Проверка навыка». Объявлять три десятка мишеней руками глупо,
// и черновик это прямо говорил: «чтобы не прописывать кубы для каждого навыка»
// (reference/index.html:1988). Поэтому мишень выводится из поля, помеченного
// «по нему бросают», — так же как словарь мишеней для бонусов выводится из тегов.

group('броски выводятся из полей', () => {
  const rollable = (tag, label) => ({
    ...system,
    fields: system.fields.map(f => f.tag === tag ? { ...f, roll: { label } } : f),
  });

  // «Максимум ХП» в образцовой системе не бросается — на нём и проверяем.
  test('помеченное поле даёт мишень броска', () => {
    const sys = rollable('hp_max', 'Бросок хитов');
    const found = targets(sys).find(t => t.tag === 'check:hp_max');
    ok(found, `мишени нет; есть: ${targets(sys).filter(t => t.kind === 'roll').map(t => t.tag)}`);
    eq(found.label, 'Бросок хитов');
    eq(found.kind, 'roll');
  });

  test('непомеченное поле мишени не даёт', () => {
    eq(targets(system).some(t => t.tag === 'check:hp_max'), false);
  });

  test('поле остаётся мишенью и для бонусов к значению', () => {
    const sys = rollable('wis', 'Проверка Мудрости');
    ok(targets(sys).some(t => t.tag === 'wis' && t.kind === 'value'), 'само поле никуда не делось');
  });

  test('эффект на проверку Мудрости не задевает другие броски', () => {
    const sys = rollable('wis', 'Проверка Мудрости');
    const owl = {
      id: 'owl', label: 'Сова-помощница', duration: { kind: 'scene' },
      modifiers: [{ kind: 'roll', target: 'check:wis', op: 'add', value: 5, stacking: 'sum', condition: null }],
    };
    const book = { ...compendium, effects: [...compendium.effects, owl] };
    const sheet = { ...arven, effects: [{ effectId: 'owl' }] };
    const p = () => newPass(sys, sheet, { compendium: book });

    eq(resolveRoll(sys, sheet, 'check:wis', p()).bonus, 5);
    eq(resolveRoll(sys, sheet, 'skill_roll', p()).bonus, 0, 'общая проверка навыка не тронута');
    eq(resolveRoll(sys, sheet, 'attack_roll', p()).bonus, 0, 'атака не тронута');
  });

  test('характеристика при этом не меняется', () => {
    const sys = rollable('wis', 'Проверка Мудрости');
    const owl = {
      id: 'owl', label: 'Сова', duration: { kind: 'scene' },
      modifiers: [{ kind: 'roll', target: 'check:wis', op: 'add', value: 5, stacking: 'sum', condition: null }],
    };
    const book = { ...compendium, effects: [...compendium.effects, owl] };
    const sheet = { ...arven, effects: [{ effectId: 'owl' }] };
    eq(calc(sys, sheet, 'wis', newPass(sys, sheet, { compendium: book })), 12, 'Мудрость как была');
    eq(calc(sys, sheet, 'wis_mod', newPass(sys, sheet, { compendium: book })), 1, 'и модификатор тоже');
  });
});
