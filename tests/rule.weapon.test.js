import { group, test, eq, ok, deepEq, throws } from './harness.js';
import { send, receive } from '../src/events/envelope.js';
import { system } from '../src/model/system.js';
import { arven, mirra } from '../src/model/sheets.js';
import { compendium, findAction } from '../src/model/compendium.js';

// Удар знает, каким оружием бьёт. Кость урона — свойство ЗАПИСИ оружия,
// правило берёт её ссылкой { item: 'damage_dice' }; какие свойства у оружия
// вообще бывают — объявляет СИСТЕМА (system.records). Компендиум определяется
// изначальной механикой: не объявлено — движок не читает.

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

group('удар знает своё оружие', () => {
  test('кость урона приходит из записи оружия, а не из действия или эффекта', () => {
    const action = findAction('longsword');
    ok(action.weapon, 'действие ссылается на оружие');
    ok(!('envelope' in action), 'пайплайна в действии больше нет вовсе');

    const env = send('longsword', { system, sheet: arven, compendium, die: queue(10, 5) });
    eq(env.steps[1].rolled.notation, '1d8', 'нотация пришла из записи «Длинный меч»');
    deepEq(env.steps[1].rolled.rolls, [5]);
  });

  test('свойства оружия объявляет система: нет объявления — внятная ошибка, а не тихий ноль', () => {
    // Правило требует кость из записи, система без схемы записей её «не видит».
    // Раньше это был тихий пропуск; теперь пустота законна только там,
    // где объявлена (optional) — здесь она не объявлена.
    const { records, ...noSchema } = system;
    throws(() => send('longsword', { system: noSchema, sheet: arven, compendium, die: queue(10) }),
      'damage_dice');
  });

  test('действие с пропавшим оружием — внятная ошибка', () => {
    const book = {
      ...compendium,
      actions: [...compendium.actions,
        { id: 'broken', kind: 'action', label: 'Сломанное', weapon: 'экскалибур', effect: 'sword-strike' }],
    };
    throws(() => send('broken', { system, sheet: arven, compendium: book, die: queue(10) }), 'экскалибур');
  });

  test('действие без оружия живёт, пока правило оружия не требует', () => {
    // «Слово лечения» — правило heal, ссылок { item } в нём нет.
    const env = send('healing-word', { system, sheet: mirra, compendium, die: queue(2) });
    const wounded = { ...arven, values: { ...arven.values, hp_current: 40 } };
    const { sheet } = receive(env, { system, sheet: wounded, compendium, die: queue() });
    eq(sheet.values.hp_current, 44);
  });

  test('а требует — падает при отправке с именем свойства', () => {
    const book = {
      ...compendium,
      actions: [...compendium.actions,
        { id: 'barehand', kind: 'action', label: 'Голый кулак', effect: 'sword-strike' }],
    };
    throws(() => send('barehand', { system, sheet: arven, compendium: book, die: queue(10) }),
      'не предмет');
  });
});
