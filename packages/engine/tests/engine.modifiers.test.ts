import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { resolveRoll } from '../src/engine/modifiers.ts';
import { targets, assertTarget } from '../src/engine/targets.ts';
import { UnknownTagError } from '../src/engine/errors.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';

const withGear = (sheet, book = compendium) => newPass(system, sheet, { compendium: book });

const withEffects = extra => ({ ...system, effects: { ...system.effects, ...extra } });
const passive = (label, modifiers) => ({ label, activation: 'passive', duration: { kind: 'temporary' }, modifiers });

const withRoomRule = (id, label, modifier) => ({
  ...system,
  effects: { ...system.effects, [id]: passive(label, [modifier]) },
  room_rules: [id],
});
const ac = (sheet, book) => calc(system, sheet, 'ac', withGear(sheet, book));

const plus = (id, label, target, value, stacking = 'sum') => ({
  id, label, slot: 'ring',
  modifiers: [{ kind: 'value', target, op: 'add', value, stacking, condition: null }],
});

const book = extraItems => ({
  items: [...compendium.items, ...extraItems],
});

group('модификаторы', () => {
  group('правящие значение', () => {
    const times = (id, value, stacking = 'sum') => ({
      id, label: id, slot: 'ring',
      modifiers: [{ kind: 'value', target: 'ac', op: 'mul', value, stacking, condition: null }],
    });
    const bare = { ...arven, equipped: [] };

    test('один множитель ×0.5 уполовинивает значение', () => {
      eq(ac({ ...bare, equipped: ['half-a'] }, book([times('half-a', 0.5)])), 5.5);
    });

    test('два множителя ×0.5 с накоплением «сумма» перемножаются, а не складываются в ×1', () => {
      eq(ac({ ...bare, equipped: ['half-a', 'half-b'] }, book([times('half-a', 0.5), times('half-b', 0.5)])), 2.75);
    });

    test('три множителя ×0.5 дают ×0.125, а не ×1.5', () => {
      const items = [times('half-a', 0.5), times('half-b', 0.5), times('half-c', 0.5)];
      eq(ac({ ...bare, equipped: ['half-a', 'half-b', 'half-c'] }, book(items)), 1.375);
    });

    test('накопление «наибольшее» у множителей по-прежнему берёт один — так выражается «сопротивления не складываются»', () => {
      const items = [times('half-a', 0.5, 'max'), times('half-b', 0.5, 'max')];
      eq(ac({ ...bare, equipped: ['half-a', 'half-b'] }, book(items)), 5.5);
    });

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

  group('пол и потолок значения', () => {
    const bound = (id, op, value) => ({
      id, label: id, slot: 'ring',
      modifiers: [{ kind: 'value', target: 'ac', op, value, stacking: 'sum', condition: null }],
    });
    const bare = { ...arven, equipped: [] };

    test('«не меньше» поднимает малое значение до пола, большое не трогает', () => {
      eq(ac({ ...bare, equipped: ['floor'] }, book([bound('floor', 'floor', 15)])), 15);
      eq(ac({ ...bare, equipped: ['floor'] }, book([bound('floor', 'floor', 5)])), 11);
    });

    test('«не больше» режет значение потолком', () => {
      eq(ac({ ...bare, equipped: ['cap'] }, book([bound('cap', 'cap', 8)])), 8);
    });

    test('пол считается после прибавок и множителей, два пола — берётся выше', () => {
      const items = [plus('ring', 'Кольцо', 'ac', 2), bound('a', 'floor', 20), bound('b', 'floor', 16)];
      eq(ac({ ...bare, equipped: ['ring', 'a', 'b'] }, book(items)), 20);
    });
  });

  group('правила стакинга', () => {
    const two = [plus('a', 'A', 'ac', 1), plus('b', 'B', 'ac', 2)];
    const sheet = () => ({
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

    test('условие считается по листу владельца, а не по константам', () => {
      const gear = book([conditional('#dex_mod > 2')]);
      eq(ac({ ...arven, equipped: ['cond'] }, gear), 11, 'у Арвен Ловкость мала');
      eq(ac({ ...mirra, equipped: ['cond'] }, gear), 24, 'у Мирры Ловкость велика');
    });
  });

  group('правящие бросок — другая порода, не арифметика', () => {
    const poisoned = sheet => ({ ...sheet, effects: [{ effectId: 'poisoned' }] });
    const names = roll => roll.edits.map(e => e.label);

    test('без эффектов правок нет', () => {
      deepEq(names(resolveRoll(system, arven, 'attack_roll', withGear(arven))), []);
    });

    test('отравление приносит правку, названную автором мира', () => {
      const sheet = poisoned(arven);
      deepEq(names(resolveRoll(system, sheet, 'attack_roll', withGear(sheet))), ['Помеха']);
    });

    test('помеха не является числом и в значение не превращается', () => {
      const sheet = poisoned(arven);
      eq(calc(system, sheet, 'attack_bonus', withGear(sheet)), 6, 'бонус атаки не изменился');
    });

    test('гашение объявлено в СЛОВАРЕ, а не зашито в движке', () => {
      const sys = withEffects({
        blessed: passive('Благословение',
          [{ kind: 'roll', target: 'attack_roll', edit: 'advantage', condition: null }]),
      });
      const sheet = { ...arven, effects: [{ effectId: 'poisoned' }, { effectId: 'blessed' }] };
      deepEq(names(resolveRoll(sys, sheet, 'attack_roll', newPass(sys, sheet, { compendium }))), [],
        'у обеих записей объявлено «гасится другой» — обе уходят');
    });

    test('без объявленного гашения обе правки применяются — так живут другие миры', () => {

      const loose = {
        ...system,
        roll_edits: {
          ...system.roll_edits,
          advantage: { ...system.roll_edits.advantage, canceledBy: undefined },
          disadvantage: { ...system.roll_edits.disadvantage, canceledBy: undefined },
        },
        effects: {
          ...system.effects,
          blessed: passive('Благословение',
            [{ kind: 'roll', target: 'attack_roll', edit: 'advantage', condition: null }]),
        },
      };
      const sheet = { ...arven, effects: [{ effectId: 'poisoned' }, { effectId: 'blessed' }] };
      const roll = resolveRoll(loose, sheet, 'attack_roll', newPass(loose, sheet, { compendium }));
      eq(roll.edits.length, 2, 'закон гашения переехал в данные — движок его не навязывает');
    });

    test('две одинаковых правки не складываются — это по-прежнему одна правка', () => {
      const adv = n => passive('Пре' + n,
        [{ kind: 'roll', target: 'attack_roll', edit: 'advantage', condition: null }]);
      const sys = withEffects({ adv1: adv(1), adv2: adv(2) });
      const sheet = { ...arven, effects: [{ effectId: 'adv1' }, { effectId: 'adv2' }] };
      const roll = resolveRoll(sys, sheet, 'attack_roll', newPass(sys, sheet, { compendium }));
      deepEq(names(roll), ['Преимущество'], 'нестакаемость — закон движка, а не данных');
      eq(roll.sources.length, 2, 'оба источника видны в разборе броска');
    });

    test('ссылка на правку, которой нет в словаре — внятная ошибка', () => {
      const sys = withEffects({
        weird: passive('Странное',
          [{ kind: 'roll', target: 'attack_roll', edit: 'котик', condition: null }]),
      });
      const sheet = { ...arven, effects: [{ effectId: 'weird' }] };
      throws(() => resolveRoll(sys, sheet, 'attack_roll', newPass(sys, sheet, { compendium })), 'котик');
    });

    test('что правка ДЕЛАЕТ, движок берёт из записи словаря', () => {
      const sheet = poisoned(arven);
      const [edit] = resolveRoll(system, sheet, 'attack_roll', withGear(sheet)).edits;
      deepEq(edit.ops, [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }]);
    });
  });

  group('правила самой системы', () => {

    const withRule = ({ label, ...mod }) => withRoomRule('room_test', label, mod);

    test('правило системы применяется без предметов и эффектов', () => {
      const sys = withRule({
        kind: 'roll', label: 'Тяжёлый доспех мешает', target: 'skill_roll',
        edit: 'disadvantage', condition: null,
      });
      const p = newPass(sys, arven, { compendium });
      deepEq(resolveRoll(sys, arven, 'skill_roll', p).edits.map(e => e.label), ['Помеха']);
    });

    test('условие правила считается по каждому листу отдельно', () => {
      const sys = withRule({
        kind: 'roll', label: 'Мастерство даёт фору', target: 'skill_roll',
        edit: 'advantage', condition: '#prof_bonus >= 3',
      });
      eq(resolveRoll(sys, arven, 'skill_roll', newPass(sys, arven, { compendium })).edits.length,
        1, 'у Арвен бонус мастерства 3');
      eq(resolveRoll(sys, mirra, 'skill_roll', newPass(sys, mirra, { compendium })).edits.length,
        0, 'у Мирры 2');
    });

    test('правило системы гасится помехой от эффекта наравне с прочими', () => {
      const sys = withRule({
        kind: 'roll', label: 'Фора', target: 'attack_roll',
        edit: 'advantage', condition: null,
      });
      const sheet = { ...arven, effects: [{ effectId: 'poisoned' }] };
      eq(resolveRoll(sys, sheet, 'attack_roll', newPass(sys, sheet, { compendium })).edits.length, 0);
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
        edit: 'disadvantage', condition: null,
      });
      const roll = resolveRoll(sys, arven, 'skill_roll', newPass(sys, arven, { compendium }));
      eq(roll.sources[0].label, 'Тяжёлый доспех мешает');
      eq(roll.sources[0].type, 'room', 'источник — правило комнаты, а не предмет и не висящий эффект');
    });
  });

  group('числовой бонус к броску — третий род модификатора', () => {

    const bonus = (value, condition = null) => withEffects({
      guidance: passive('Наставление',
        [{ kind: 'roll', target: 'skill_roll', op: 'add', value, stacking: 'sum', condition }]),
    });
    const hung = { ...arven, effects: [{ effectId: 'guidance' }] };
    const roll = sys => resolveRoll(sys, hung, 'skill_roll', newPass(sys, hung, { compendium }));

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
      const both = withEffects({
        guidance: passive('Наставление', [
          { kind: 'roll', target: 'skill_roll', op: 'add', value: 2, stacking: 'sum', condition: null },
          { kind: 'roll', target: 'skill_roll', edit: 'advantage', condition: null },
        ]),
      });

      const bare = { ...arven, equipped: [], effects: [{ effectId: 'guidance' }] };
      const result = resolveRoll(both, bare, 'skill_roll', newPass(both, bare, { compendium }));
      eq(result.bonus, 2, 'число живёт отдельно от правки');
      deepEq(result.edits.map(e => e.label), ['Преимущество']);
    });

    test('прибавка остаётся, даже когда преимущество погашено помехой', () => {
      const both = withEffects({
        guidance: passive('Наставление', [
          { kind: 'roll', target: 'skill_roll', op: 'add', value: 2, stacking: 'sum', condition: null },
          { kind: 'roll', target: 'skill_roll', edit: 'advantage', condition: null },
        ]),
      });

      const result = roll(both);
      eq(result.edits.length, 0, 'помеха от правила комнаты погасила преимущество');
      eq(result.bonus, 2, 'а число уцелело: это другая порода');
    });

    test('прибавка с ложным условием не применяется', () => {
      eq(roll(bonus(5, '#level >= 99')).bonus, 0);
    });

    test('эффект может править и значение поля, не только бросок', () => {
      const wise = withEffects({
        guidance: passive('Мудрость свыше',
          [{ kind: 'value', target: 'wis', op: 'add', value: 5, stacking: 'sum', condition: null }]),
      });
      eq(calc(wise, hung, 'wis', newPass(wise, hung, { compendium })), 17);
      eq(calc(wise, hung, 'wis_mod', newPass(wise, hung, { compendium })), 3,
        'модификатор Мудрости пересчитался следом');
    });
  });

  group('словарь мишеней выводится из системы', () => {
    test('в него попадают все поля, все броски и входящее хранимых полей', () => {
      const all = targets(system);
      const derived = system.fields.filter(f => f.roll).length;
      const incoming = system.fields.filter(f => f.value.kind === 'stored').length;
      const rolls = 1 + system.rolls.length + derived;
      const events = Object.keys(system.events ?? {}).length;
      eq(all.length, rolls * 2 + system.fields.length + incoming + events,
        'общая мишень, поля, объявленные броски, броски из полей, входящее хранимых, «против меня» на каждый бросок и входящие события');
      ok(all.some(t => t.tag === 'incoming:attack_roll' && t.kind === 'roll'),
        'состояние цели может править чужой бросок по ней');
      ok(all.some(t => t.tag === 'ac' && t.kind === 'value'));
      ok(all.some(t => t.tag === 'attack_roll' && t.kind === 'roll'));

      ok(all.some(t => t.tag === 'roll:any' && t.kind === 'roll'),
        'общая мишень выводится, как и все прочие');
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

group('броски выводятся из полей', () => {
  const rollable = (tag, label) => ({
    ...system,
    fields: system.fields.map(f => f.tag === tag ? { ...f, roll: { label } } : f),
  });

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
    const owled = { ...sys, effects: { ...sys.effects,
      owl: passive('Сова-помощница',
        [{ kind: 'roll', target: 'check:wis', op: 'add', value: 5, stacking: 'sum', condition: null }]) } };
    const sheet = { ...arven, effects: [{ effectId: 'owl' }] };
    const p = () => newPass(owled, sheet, { compendium });

    eq(resolveRoll(owled, sheet, 'check:wis', p()).bonus, 5);
    eq(resolveRoll(owled, sheet, 'skill_roll', p()).bonus, 0, 'общая проверка навыка не тронута');
    eq(resolveRoll(owled, sheet, 'attack_roll', p()).bonus, 0, 'атака не тронута');
  });

  test('характеристика при этом не меняется', () => {
    const sys = rollable('wis', 'Проверка Мудрости');
    const owled = { ...sys, effects: { ...sys.effects,
      owl: passive('Сова',
        [{ kind: 'roll', target: 'check:wis', op: 'add', value: 5, stacking: 'sum', condition: null }]) } };
    const sheet = { ...arven, effects: [{ effectId: 'owl' }] };
    eq(calc(owled, sheet, 'wis', newPass(owled, sheet, { compendium })), 12, 'Мудрость как была');
    eq(calc(owled, sheet, 'wis_mod', newPass(owled, sheet, { compendium })), 1, 'и модификатор тоже');
  });
});
