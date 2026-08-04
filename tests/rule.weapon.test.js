import { group, test, eq, ok, deepEq, throws } from './harness.js';
import { send, receive, availableActions } from '../src/events/envelope.js';
import { system } from '../src/model/system.js';
import { arven, mirra } from '../src/model/sheets.js';
import { compendium, findItem } from '../src/model/compendium.js';

// Предмет — ИСТОЧНИК действий, как в Foundry: у меча есть АКТИВНОСТИ,
// каждая зовёт эффект-вызов. Надел меч — получил его атаку; снял — потерял.
// Отдельная запись-действие остаётся для того, что предметом не является:
// заклинаний и приёмов.

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

group('предмет даёт действие', () => {
  test('у записи меча есть активность, а записи-действия «удар мечом» нет вовсе', () => {
    const sword = findItem('longsword-item');
    ok((sword.activities || []).length, 'активности живут на предмете');
    ok(sword.activities[0].effect, 'активность — ссылка на эффект-вызов, шагов в ней нет');
    ok(!compendium.actions.some(a => a.id === 'longsword'), 'отдельной записи-действия больше нет');
  });

  test('надетый меч появляется в списке действий владельца', () => {
    const list = availableActions(arven, compendium);
    const attack = list.find(a => a.id === 'longsword-item:0');
    ok(attack, 'атака меча выведена из снаряжения, а не выучена');
    ok(attack.label.includes('Длинный меч'), 'лейбл собран из предмета и активности');
    eq(attack.weapon, 'longsword-item', 'кость урона придёт из самого меча');
  });

  test('снял меч — атака пропала из списка', () => {
    const bare = { ...arven, equipped: arven.equipped.filter(id => id !== 'longsword-item') };
    ok(!availableActions(bare, compendium).some(a => a.id === 'longsword-item:0'));
  });

  test('активность меча бьёт так же, как била запись-действие', () => {
    const env = send('longsword-item:0', { system, sheet: arven, compendium, die: queue(10, 5) });
    eq(env.steps[1].rolled.notation, '1d8', 'нотация пришла из записи «Длинный меч»');
    const { sheet, report } = receive(env, { system, sheet: mirra, compendium, die: queue() });
    eq(report.trace[0].total, 16, 'бросок 10 плюс бонус атаки 6');
    eq(sheet.values.hp_current, 13, '21 минус кость 5 минус Сила 3');
  });

  test('заклинание — по-прежнему отдельная запись-действие: у него нет предмета', () => {
    const list = availableActions(mirra, compendium);
    ok(list.some(a => a.id === 'poison-spray'), 'выученное заклинание в списке');
    ok(!('weapon' in (list.find(a => a.id === 'poison-spray') || {})) ||
      !list.find(a => a.id === 'poison-spray').weapon, 'оружия у заклинания нет');
  });

  test('свойства оружия объявляет система: нет объявления — внятная ошибка', () => {
    const { records, ...noSchema } = system;
    throws(() => send('longsword-item:0', { system: noSchema, sheet: arven, compendium, die: queue(10) }),
      'damage_dice');
  });

  test('активность с пропавшим эффектом — внятная ошибка при отправке', () => {
    const book = {
      ...compendium,
      items: compendium.items.map(i => i.id === 'longsword-item'
        ? { ...i, activities: [{ label: 'Атака', effect: 'нетакого' }] }
        : i),
    };
    throws(() => send('longsword-item:0', { system, sheet: arven, compendium: book, die: queue(10) }), 'нетакого');
  });

  test('битый номер активности — внятная ошибка, а не тихий undefined', () => {
    throws(() => send('longsword-item:9', { system, sheet: arven, compendium, die: queue(10) }), 'longsword-item:9');
  });
});
