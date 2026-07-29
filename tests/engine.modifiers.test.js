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

  group('словарь мишеней выводится из системы', () => {
    test('в него попадают все объявленные поля и все броски', () => {
      const all = targets(system);
      eq(all.length, system.fields.length + system.rolls.length);
      ok(all.some(t => t.tag === 'ac' && t.kind === 'value'));
      ok(all.some(t => t.tag === 'attack_roll' && t.kind === 'roll'));
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
