import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { calc, newPass } from '../src/engine/calc.ts';
import { resolveRoll } from '../src/engine/modifiers.ts';
import { targets, assertTarget } from '../src/engine/targets.ts';
import { UnknownTagError } from '../src/engine/errors.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';
import { fieldsOf } from '../src/model/sheet-columns.ts';

const withGear = (sheet, book = compendium) => newPass(system, sheet, { compendium: book });

const withEffects = extra => ({ ...system, effects: { ...system.effects, ...extra } });
const passive = (label, modifiers) => ({ label, activation: 'passive', duration: { kind: 'permanent' }, modifiers });

const withRoomRule = (id, label, modifier) => ({
  ...system,
  effects: { ...system.effects, [id]: passive(label, [modifier]) },
  grants: [id],
});
const ac = (sheet, book) => calc(system, sheet, 'ac', withGear(sheet, book));

const plus = (id, label, target, value, stage = undefined) => ({
  id, label, slot: 'ring',
  modifiers: [{ kind: 'value', target, op: 'add', value: { expr: String(value) }, ...(stage ? { stage } : {}) }],
});

const staged = stages => ({
  ...system,
  tables: Object.fromEntries(Object.entries(system.tables).map(([id, table]) => [id, {
    ...table,
    columns: (table.columns ?? []).map(column => (column.key === 'ac' ? { ...column, stages } : column)),
  }])),
});
const acIn = (sys, sheet, book) => calc(sys, sheet, 'ac', newPass(sys, sheet, { compendium: book }));

const book = extraItems => ({
  records: [...compendium.records, ...extraItems],
});

group('модификаторы', () => {
  group('правящие значение', () => {
    const times = (id, value, stage = undefined) => ({
      id, label: id, slot: 'ring',
      modifiers: [{ kind: 'value', target: 'ac', op: 'mul', value: { expr: String(value) }, ...(stage ? { stage } : {}) }],
    });
    const bare = { ...arven, has: [] };

    test('один множитель ×0.5 уполовинивает значение', () => {
      eq(ac({ ...bare, has: [{ of: 'half-a' }] }, book([times('half-a', 0.5)])), 5.5);
    });

    test('два множителя ×0.5 с накоплением «сумма» перемножаются, а не складываются в ×1', () => {
      eq(ac({ ...bare, has: [{ of: 'half-a' }, { of: 'half-b' }] }, book([times('half-a', 0.5), times('half-b', 0.5)])), 2.75);
    });

    test('три множителя ×0.5 дают ×0.125, а не ×1.5', () => {
      const items = [times('half-a', 0.5), times('half-b', 0.5), times('half-c', 0.5)];
      eq(ac({ ...bare, has: [{ of: 'half-a' }, { of: 'half-b' }, { of: 'half-c' }] }, book(items)), 1.375);
    });

    test('этап «наименьший множитель» берёт одно сопротивление из двух, а иммунитет ×0 побеждает ×0.5', () => {
      const sys = staged([{ key: 'сопротивление', combine: { mul: 'min' } }]);
      eq(acIn(sys, { ...bare, has: [{ of: 'half-a' }, { of: 'half-b' }] }, book([times('half-a', 0.5), times('half-b', 0.5)])), 5.5);
      eq(acIn(sys, { ...bare, has: [{ of: 'half-a' }, { of: 'zero' }] }, book([times('half-a', 0.5), times('zero', 0)])), 0);
    });

    test('округление после этапа: 11 → сопротивление вниз 5 → уязвимость 10, а не 11', () => {
      const sys = staged([
        { key: 'сопротивление', combine: { mul: 'min' }, round: 'down' },
        { key: 'уязвимость', combine: { mul: 'max' }, round: 'down' },
      ]);
      eq(acIn(sys, { ...bare, has: [{ of: 'half' }, { of: 'double' }] }, book([times('half', 0.5, 'сопротивление'), times('double', 2, 'уязвимость')])), 10);
    });

    test('без снаряжения класс брони считается по голым характеристикам', () => {
      eq(ac({ ...arven, has: [] }), 11);
    });

    test('кольчуга задаёт базу доспеха и гасит вклад Ловкости', () => {
      eq(ac(arven), 16);
    });

    test('новый предмет с бонусом добавляется правкой данных, без правки движка', () => {
      const ring = plus('ring-of-protection', 'Кольцо защиты', 'ac', 1);
      eq(ac({ ...arven, has: [{ of: 'chain-mail' }, { of: 'ring-of-protection' }] }, book([ring])), 17);
    });

    test('модификатор может ссылаться на формулу, а не только на число', () => {
      const belt = {
        id: 'belt', label: 'Пояс', slot: 'waist',
        modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '#prof_bonus' } }],
      };
      eq(ac({ ...arven, has: [{ of: 'belt' }] }, book([belt])), 11 + 3);
    });
  });

  group('пол и потолок значения', () => {
    const bound = (id, op, value) => ({
      id, label: id, slot: 'ring',
      modifiers: [{ kind: 'value', target: 'ac', op, value: { expr: String(value) } }],
    });
    const bare = { ...arven, has: [] };

    test('«не меньше» поднимает малое значение до пола, большое не трогает', () => {
      eq(ac({ ...bare, has: [{ of: 'floor' }] }, book([bound('floor', 'floor', 15)])), 15);
      eq(ac({ ...bare, has: [{ of: 'floor' }] }, book([bound('floor', 'floor', 5)])), 11);
    });

    test('«не больше» режет значение потолком', () => {
      eq(ac({ ...bare, has: [{ of: 'cap' }] }, book([bound('cap', 'cap', 8)])), 8);
    });

    test('пол считается после прибавок и множителей, два пола — берётся выше', () => {
      const items = [plus('ring', 'Кольцо', 'ac', 2), bound('a', 'floor', 20), bound('b', 'floor', 16)];
      eq(ac({ ...bare, has: [{ of: 'ring' }, { of: 'a' }, { of: 'b' }] }, book(items)), 20);
    });
  });

  group('этапы величины', () => {
    const two = [plus('a', 'A', 'ac', 1), plus('b', 'B', 'ac', 2)];
    const sheet = () => ({
      ...arven,
      has: [{ of: 'a' }, { of: 'b' }],
    });

    test('sum складывает все бонусы', () => {
      eq(ac(sheet(), book(two)), 11 + 3);
    });

    test('этап «наибольшая прибавка» берёт только наибольшую', () => {
      const sys = staged([{ key: 'основа', combine: { add: 'max' } }]);
      eq(acIn(sys, sheet(), book([plus('a', 'A', 'ac', 1), plus('b', 'B', 'ac', 2)])), 11 + 2);
    });

    test('override оставляет последний применившийся', () => {
      const setTwo = [
        { id: 'a', label: 'A', modifiers: [{ kind: 'value', target: 'ac', op: 'set', value: { expr: '20' } }] },
        { id: 'b', label: 'B', modifiers: [{ kind: 'value', target: 'ac', op: 'set', value: { expr: '5' } }] },
      ];
      eq(ac(sheet(), book(setTwo)), 5);
    });

    test('два этапа на одной величине не мешают друг другу', () => {
      const sys = staged([{ key: 'бонусы' }, { key: 'лучшее', combine: { add: 'max' } }]);
      const mixed = [plus('a', 'A', 'ac', 1, 'бонусы'), plus('b', 'B', 'ac', 5, 'лучшее'), plus('c', 'C', 'ac', 3, 'лучшее')];
      eq(acIn(sys, { ...arven, has: [{ of: 'a' }, { of: 'b' }, { of: 'c' }] }, book(mixed)), 11 + 1 + 5);
    });

    test('правка с этапом, которого у величины нет, — ошибка словами', () => {
      throws(() => acIn(staged([{ key: 'основа' }]), { ...arven, has: [{ of: 'a' }] }, book([plus('a', 'A', 'ac', 1, 'нет')])), 'ссылается на этап «нет»');
    });
  });

  group('условия', () => {
    const conditional = cond => ({
      id: 'cond', label: 'Условный', slot: 'ring',
      modifiers: [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '10' }, if: { expr: cond } }],
    });

    test('модификатор с истинным условием применяется', () => {
      eq(ac({ ...arven, has: [{ of: 'cond' }] }, book([conditional('#level >= 5')])), 21);
    });

    test('модификатор с ложным условием не применяется', () => {
      eq(ac({ ...arven, has: [{ of: 'cond' }] }, book([conditional('#level >= 99')])), 11);
    });

    test('условие считается по листу владельца, а не по константам', () => {
      const gear = book([conditional('#dex_mod > 2')]);
      eq(ac({ ...arven, has: [{ of: 'cond' }] }, gear), 11, 'у Арвен Ловкость мала');
      eq(ac({ ...mirra, has: [{ of: 'cond' }] }, gear), 24, 'у Мирры Ловкость велика');
    });
  });

  group('правящие бросок — другая порода, не арифметика', () => {
    const poisoned = sheet => ({ ...sheet, effects: [{ effectId: 'poisoned' }] });
    const names = roll => roll.edits.map(e => e.label);

    test('без эффектов правок нет', () => {
      deepEq(names(resolveRoll(system, arven, ['атака'], withGear(arven))), []);
    });

    test('отравление приносит правку, названную автором мира', () => {
      const sheet = poisoned(arven);
      deepEq(names(resolveRoll(system, sheet, ['атака'], withGear(sheet))), ['Помеха']);
    });

    test('помеха не является числом и в значение не превращается', () => {
      const sheet = poisoned(arven);
      eq(calc(system, sheet, 'attack_bonus', withGear(sheet)), 6, 'бонус атаки не изменился');
    });

    test('гашение объявлено в СЛОВАРЕ, а не зашито в движке', () => {
      const sys = withEffects({
        blessed: passive('Благословение',
          [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['атака'], edit: 'advantage' }]),
      });
      const sheet = { ...arven, effects: [{ effectId: 'poisoned' }, { effectId: 'blessed' }] };
      deepEq(names(resolveRoll(sys, sheet, ['атака'], newPass(sys, sheet, { compendium }))), [],
        'у обеих записей объявлено «гасится другой» — обе уходят');
    });

    test('без объявленного гашения обе правки применяются — так живут другие миры', () => {

      const loose = {
        ...system,
        roll_edits: {
          ...system.roll_edits,
          advantage: { ...system.roll_edits.advantage, cancels: undefined },
          disadvantage: { ...system.roll_edits.disadvantage, cancels: undefined },
        },
        effects: {
          ...system.effects,
          blessed: passive('Благословение',
            [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['атака'], edit: 'advantage' }]),
        },
      };
      const sheet = { ...arven, effects: [{ effectId: 'poisoned' }, { effectId: 'blessed' }] };
      const roll = resolveRoll(loose, sheet, ['атака'], newPass(loose, sheet, { compendium }));
      eq(roll.edits.length, 2, 'закон гашения переехал в данные — движок его не навязывает');
    });

    test('две одинаковых правки не складываются — это по-прежнему одна правка', () => {
      const adv = n => passive('Пре' + n,
        [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['атака'], edit: 'advantage' }]);
      const sys = withEffects({ adv1: adv(1), adv2: adv(2) });
      const sheet = { ...arven, effects: [{ effectId: 'adv1' }, { effectId: 'adv2' }] };
      const roll = resolveRoll(sys, sheet, ['атака'], newPass(sys, sheet, { compendium }));
      deepEq(names(roll), ['Преимущество'], 'нестакаемость — закон движка, а не данных');
      eq(roll.sources.length, 2, 'оба источника видны в разборе броска');
    });

    test('ссылка на правку, которой нет в словаре — внятная ошибка', () => {
      const sys = withEffects({
        weird: passive('Странное',
          [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['атака'], edit: 'котик' }]),
      });
      const sheet = { ...arven, effects: [{ effectId: 'weird' }] };
      throws(() => resolveRoll(sys, sheet, ['атака'], newPass(sys, sheet, { compendium })), 'котик');
    });

    test('что правка ДЕЛАЕТ, движок берёт из записи словаря', () => {
      const sheet = poisoned(arven);
      const [edit] = resolveRoll(system, sheet, ['атака'], withGear(sheet)).edits;
      deepEq(edit.ops, [{ op: 'addDie' }, { op: 'keepWorst', n: 1 }]);
    });
  });

  group('правила самой системы', () => {

    const withRule = ({ label, ...mod }) => withRoomRule('room_test', label, mod);

    test('правило системы применяется без предметов и эффектов', () => {
      const sys = withRule({
        kind: 'edit', label: 'Тяжёлый доспех мешает', call: 'roll', param: 'edits', tags: ['проверка'],
        edit: 'disadvantage',
      });
      const p = newPass(sys, arven, { compendium });
      deepEq(resolveRoll(sys, arven, ['проверка'], p).edits.map(e => e.label), ['Помеха']);
    });

    test('условие правила считается по каждому листу отдельно', () => {
      const sys = withRule({
        kind: 'edit', label: 'Мастерство даёт фору', call: 'roll', param: 'edits', tags: ['проверка'],
        edit: 'advantage', if: { expr: '@holder.prof_bonus >= 3' },
      });
      eq(resolveRoll(sys, arven, ['проверка'], newPass(sys, arven, { compendium })).edits.length,
        1, 'у Арвен бонус мастерства 3');
      eq(resolveRoll(sys, mirra, ['проверка'], newPass(sys, mirra, { compendium })).edits.length,
        0, 'у Мирры 2');
    });

    test('правило системы гасится помехой от эффекта наравне с прочими', () => {
      const sys = withRule({
        kind: 'edit', label: 'Фора', call: 'roll', param: 'edits', tags: ['атака'],
        edit: 'advantage',
      });
      const sheet = { ...arven, effects: [{ effectId: 'poisoned' }] };
      eq(resolveRoll(sys, sheet, ['атака'], newPass(sys, sheet, { compendium })).edits.length, 0);
    });

    test('правило системы может править и значение, а не только бросок', () => {
      const sys = withRule({
        kind: 'value', label: 'Домашнее правило: +1 ко всем КД', target: 'ac',
        op: 'add', value: { expr: '1' },
      });
      eq(calc(sys, mirra, 'ac', newPass(sys, mirra, { compendium })), 15);
    });

    test('источник правила виден в разборе броска под своим ярлыком', () => {
      const sys = withRule({
        kind: 'edit', label: 'Тяжёлый доспех мешает', call: 'roll', param: 'edits', tags: ['проверка'],
        edit: 'disadvantage',
      });
      const roll = resolveRoll(sys, arven, ['проверка'], newPass(sys, arven, { compendium }));
      eq(roll.sources[0].label, 'Тяжёлый доспех мешает');
      eq(roll.sources[0].type, 'effect', 'правило комнаты — обычный висящий эффект, выданный всем листам');
    });
  });

  group('числовой бонус к броску — третий род модификатора', () => {

    const bonus = (value, condition = null) => withEffects({
      guidance: passive('Наставление',
        [{ kind: 'edit', call: 'roll', param: 'bonus', tags: ['проверка'], op: 'add', value: typeof value === 'object' ? value : { expr: String(value) }, ...(condition ? { if: { expr: condition } } : {}) }]),
    });
    const hung = { ...arven, effects: [{ effectId: 'guidance' }] };
    const roll = sys => resolveRoll(sys, hung, ['проверка'], newPass(sys, hung, { compendium }));

    test('прибавка к броску приходит числом', () => {
      eq(roll(bonus(5)).bonus, 5);
    });

    test('без модификаторов прибавки нет', () => {
      eq(resolveRoll(system, arven, ['проверка'], newPass(system, arven, { compendium })).bonus, 0);
    });

    test('прибавка может быть формулой', () => {
      eq(roll(bonus({ expr: '@holder.prof_bonus' })).bonus, 3, 'бонус мастерства Арвен');
    });

    test('прибавка не отменяет и не заменяет преимущество', () => {
      const both = withEffects({
        guidance: passive('Наставление', [
          { kind: 'edit', call: 'roll', param: 'bonus', tags: ['проверка'], op: 'add', value: { expr: '2' } },
          { kind: 'edit', call: 'roll', param: 'edits', tags: ['проверка'], edit: 'advantage' },
        ]),
      });

      const bare = { ...arven, has: [], effects: [{ effectId: 'guidance' }] };
      const result = resolveRoll(both, bare, ['проверка'], newPass(both, bare, { compendium }));
      eq(result.bonus, 2, 'число живёт отдельно от правки');
      deepEq(result.edits.map(e => e.label), ['Преимущество']);
    });

    test('прибавка остаётся, даже когда преимущество погашено помехой', () => {
      const both = withEffects({
        guidance: passive('Наставление', [
          { kind: 'edit', call: 'roll', param: 'bonus', tags: ['проверка'], op: 'add', value: { expr: '2' } },
          { kind: 'edit', call: 'roll', param: 'edits', tags: ['проверка'], edit: 'advantage' },
        ]),
      });

      const result = roll(both);
      eq(result.edits.length, 0, 'помеха от правила комнаты погасила преимущество');
      eq(result.bonus, 2, 'а число уцелело: это другая порода');
    });

    test('прибавка с ложным условием не применяется', () => {
      eq(roll(bonus(5, '@holder.level >= 99')).bonus, 0);
    });

    test('эффект может править и значение поля, не только бросок', () => {
      const wise = withEffects({
        guidance: passive('Мудрость свыше',
          [{ kind: 'value', target: 'wis', op: 'add', value: { expr: '5' } }]),
      });
      eq(calc(wise, hung, 'wis', newPass(wise, hung, { compendium })), 17);
      eq(calc(wise, hung, 'wis_mod', newPass(wise, hung, { compendium })), 3,
        'модификатор Мудрости пересчитался следом');
    });
  });

  group('словарь мишеней выводится из системы', () => {
    test('в него попадают все поля и ячейки таблиц — бросков, вызовов и входящего там нет', () => {
      const all = targets(system);
      const cells = Object.values(system.tables ?? {}).filter(table => table.shape !== 'single' && table.shape !== 'book').reduce((n, table) => {
        const columns = (table.columns ?? []).filter(c => c.kind === 'expr' || c.kind === 'number').length;
        const rows = table.key === 'range' ? 0 : (table.rows ?? []).filter(r => r.value !== undefined).length;
        return n + columns * (1 + rows);
      }, 0);
      eq(all.length, fieldsOf(system).length + cells,
        'поля и ячейки таблиц; бросок, вызов и входящее число правит правка вызова');
      ok(!all.some(t => t.tag.startsWith('roll:') || t.tag.startsWith('event:')), 'бросков и вызовов среди мишеней поля нет');
      ok(all.some(t => t.tag === 'ac' && t.kind === 'value'));
    });

    test('мишень отдаёт человеческий лейбл, а не тег', () => {
      eq(targets(system).find(t => t.tag === 'ac').label, 'Класс брони');
    });

    test('модификатор на необъявленную мишень отвергается', () => {
      throws(() => assertTarget(system, 'нетакой'), UnknownTagError, 'нетакой');
    });

    test('предмет с необъявленной мишенью роняет сборку модификаторов', () => {
      const bogus = plus('bogus', 'Мимо', 'несуществующий_тег', 1);
      const sheet = { ...arven, has: [{ of: 'bogus' }] };
      throws(() => calc(system, sheet, 'ac', newPass(system, sheet, { compendium: book([bogus]) })), UnknownTagError);
    });
  });
});

group('бросок находят по меткам', () => {
  const owl = (tags) => ({ ...system, effects: { ...system.effects,
    owl: passive('Сова-помощница',
      [{ kind: 'edit', call: 'roll', param: 'bonus', tags, op: 'add', value: { expr: '5' } }]) } });
  const sheet = { ...arven, effects: [{ effectId: 'owl' }] };
  const bonus = (sys, tags) => resolveRoll(sys, sheet, tags, newPass(sys, sheet, { compendium })).bonus;

  test('правка на метки ложится на бросок, где есть все её метки', () => {
    const sys = owl(['проверка', 'мудрость']);
    eq(bonus(sys, ['проверка', 'мудрость']), 5);
    eq(bonus(sys, ['проверка', 'мудрость', 'внимательность']), 5, 'лишние метки броска не мешают');
  });

  test('не хватает хоть одной метки — правка мимо', () => {
    const sys = owl(['проверка', 'мудрость']);
    eq(bonus(sys, ['проверка', 'сила']), 0, 'другая характеристика');
    eq(bonus(sys, ['спасбросок', 'мудрость']), 0, 'спасбросок той же характеристики');
    eq(bonus(sys, []), 0, 'бросок без меток');
  });

  test('правка без меток ложится на любой бросок', () => {
    eq(bonus(owl(undefined), ['атака']), 5);
    eq(bonus(owl(undefined), []), 5);
  });

  test('характеристика при этом не меняется', () => {
    const sys = owl(['проверка', 'мудрость']);
    eq(calc(sys, sheet, 'wis', newPass(sys, sheet, { compendium })), 12, 'Мудрость как была');
    eq(calc(sys, sheet, 'wis_mod', newPass(sys, sheet, { compendium })), 1, 'и модификатор тоже');
  });
});
