import { group, test, eq, ok, deepEq, throws } from './harness.js';
import { send, receive } from '../src/events/envelope.js';
import { system } from '../src/model/system.js';
import { arven, mirra } from '../src/model/sheets.js';
import { compendium, findAction } from '../src/model/compendium.js';

// Удар знает, каким оружием бьёт. Кость урона — свойство ЗАПИСИ оружия,
// а какие свойства у оружия вообще бывают — объявляет СИСТЕМА (system.records).
// Компендиум определяется изначальной механикой: не объявлено — движок не читает.

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

group('удар знает своё оружие', () => {
  test('кость урона приходит из записи оружия, а не из действия', () => {
    const action = findAction('longsword');
    ok(action.weapon, 'действие ссылается на оружие');
    ok(!('dice' in action.envelope.onHit.damage), 'в самом действии костей больше нет');

    const env = send('longsword', { system, sheet: arven, compendium, die: queue(10, 5) });
    eq(env.onHit.damage.notation, '1d8', 'нотация пришла из записи «Длинный меч»');
    deepEq(env.onHit.damage.rolls, [5]);
    eq(env.onHit.damage.base, 8, 'кость 5 плюс Сила 3');
  });

  test('свойства оружия объявляет система: нет объявления — нет и костей', () => {
    const { records, ...noSchema } = system;
    // Очередь из ОДНОЙ кости: если бы движок прочитал необъявленное свойство,
    // он попросил бы вторую и тест бы упал.
    const env = send('longsword', { system: noSchema, sheet: arven, compendium, die: queue(10) });
    deepEq(env.onHit.damage.rolls, [], 'кость оружия не бросалась');
    eq(env.onHit.damage.base, 3, 'остался только бонус — Сила');
  });

  test('урон оружия числом плюс превышение — пример из разбора', () => {
    const margined = { ...system, rules: { attack: { damage: { source: 'margin' } } } };
    const book = {
      ...compendium,
      items: [...compendium.items, { id: 'sr-knife', label: 'Нож', slot: 'hand', props: { damage_flat: 3 }, modifiers: [] }],
      actions: [{
        id: 'sr-strike', kind: 'action', label: 'Удар ножом', weapon: 'sr-knife',
        envelope: {
          kind: 'attack',
          roll: { die: 20, bonus: '#attack_bonus', target: 'attack_roll' },
          versus: 'ac',
          onHit: { damage: {}, applyTo: 'hp_current' },
        },
      }],
    };

    const env = send('sr-strike', { system: margined, sheet: arven, compendium: book, die: queue(10) });
    eq(env.onHit.damage.flat, 3, 'урон оружия — число из записи');
    eq(env.onHit.damage.base, 3);
    deepEq(JSON.parse(JSON.stringify(env)), env, 'конверт остался чистыми данными');

    const { sheet, report } = receive(env, { system: margined, sheet: mirra, compendium: book, die: queue() });
    eq(report.damage.total, 5, 'нож 3 плюс превышение 2');
    eq(sheet.values.hp_current, 16, '21 минус 5');
  });

  test('действие с пропавшим оружием — внятная ошибка, а не тихий ноль', () => {
    const book = {
      ...compendium,
      actions: [{
        id: 'broken', kind: 'action', label: 'Сломанное', weapon: 'экскалибур',
        envelope: {
          kind: 'attack',
          roll: { die: 20, bonus: '#attack_bonus', target: 'attack_roll' },
          versus: 'ac',
          onHit: { damage: {}, applyTo: 'hp_current' },
        },
      }],
    };
    throws(() => send('broken', { system, sheet: arven, compendium: book, die: queue(10) }), 'экскалибур');
  });

  test('действие без оружия живёт как раньше: кости прямо в записи', () => {
    const book = {
      ...compendium,
      actions: [{
        id: 'claw', kind: 'action', label: 'Коготь',
        envelope: {
          kind: 'attack',
          roll: { die: 20, bonus: '#attack_bonus', target: 'attack_roll' },
          versus: 'ac',
          onHit: { damage: { dice: '1d6' }, applyTo: 'hp_current' },
        },
      }],
    };
    const env = send('claw', { system, sheet: arven, compendium: book, die: queue(10, 4) });
    eq(env.onHit.damage.base, 4, 'кость 4, бонуса нет');
  });
});
