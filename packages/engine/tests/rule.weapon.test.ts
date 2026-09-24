import { group, test, eq, ok, throws } from './harness.ts';
import { send, receive, availableActions } from '../src/events/envelope.ts';
import { system, arven, mirra, compendium } from './fixtures.ts';

const findItem = (id: string) => compendium.records.find(i => i.id === id) || null;

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const world = { system, compendium };

group('предмет даёт действие', () => {
  test('меч не объявляет своей атаки — её даёт привязка его рода', () => {
    const sword = findItem('longsword-item');
    ok(!sword.activities, 'у записи нет ни активностей, ни шагов');
    ok(!('rule' in sword), 'и промежуточной записи-вызова тоже нет');
    ok(system.records[sword.rk].bindings.some(b => b.effect === 'strike'),
      'привязку объявил род «Оружие» в системе');
    ok(sword.props.damage_dice, 'запись заполнила ровно одну циферку — кость урона');
  });

  test('надетый меч появляется в списке действий владельца', () => {
    const list = availableActions(arven, world);
    const attack = list.find(a => a.id === 'longsword-item:0');
    ok(attack, 'атака меча выведена из снаряжения, а не выучена');
    ok(attack.label.includes('Длинный меч'), 'лейбл собран из записи и привязки');
    eq(attack.effect, 'strike', 'привязка называет эффект системы');
  });

  test('снял меч — атака пропала из списка', () => {
    const bare = { ...arven, has: arven.has.filter(entry => entry.of !== 'longsword-item') };
    ok(!availableActions(bare, world).some(a => a.id === 'longsword-item:0'));
  });

  test('меч бьёт костью из своей записи', () => {
    const env = send('longsword-item:0', { system, sheet: arven, compendium, die: queue(10, 5) });
    eq(env.steps[1].rolled.notation, '1d8', 'нотация пришла из записи «Длинный меч»');
    const { sheet, report } = receive(env, { system, sheet: mirra, compendium, die: queue() });
    eq(report.trace[0].total, 16, 'бросок 10 плюс бонус атаки 6');
    eq(sheet.values.hp_current, 13, '21 минус кость 5 минус Сила 3');
  });

  test('заклинание — тоже запись с циферками: род привязал, запись заполнила', () => {
    const list = availableActions(mirra, world);
    const spell = list.find(a => a.id === 'poison-spray:0');
    ok(spell, 'выученное заклинание в списке');
    eq(spell.effect, 'save', 'род «Атакующее заклинание» привязан к спасброску');
    eq(spell.record.props.damage_dice, '2d6', 'а кость урона ввёл человек');
  });

  test('своя активность перебивает привязку рода — так живут штучные вещи', () => {
    const book = {
      ...compendium,
      records: [...(compendium.records.map(i => i.id === 'longsword-item'
        ? { ...i, bindings: [{ label: 'Особый удар', effect: 'strike',
          args: { bonus: '#attack_bonus', versus: 'ac', damage_bonus: '0', apply_to: 'hp_current' } }] }
        : i))],
    };
    const list = availableActions(arven, { system, compendium: book });
    const mine = list.filter(a => a.id.startsWith('longsword-item'));
    eq(mine.length, 1, 'привязка рода не добавляется сверху — своя её заменяет');
    ok(mine[0].label.includes('Особый удар'));
  });

  test('свойства оружия объявляет система: нет объявления — внятная ошибка', () => {
    const { records, ...noSchema } = system;
    throws(() => send('longsword-item:0', { system: noSchema, sheet: arven, compendium, die: queue(10) }),
      'longsword-item');
  });

  test('привязка на пропавший эффект — внятная ошибка при отправке', () => {
    const book = {
      ...compendium,
      records: [...(compendium.records.map(i => i.id === 'longsword-item'
        ? { ...i, bindings: [{ label: 'Атака', effect: 'нетакого', args: {} }] }
        : i))],
    };
    throws(() => send('longsword-item:0', { system, sheet: arven, compendium: book, die: queue(10) }), 'нетакого');
  });

  test('битый номер привязки — внятная ошибка, а не тихий undefined', () => {
    throws(() => send('longsword-item:9', { system, sheet: arven, compendium, die: queue(10) }), 'longsword-item');
  });

  test('пассивный эффект применить нельзя — его вешают, а не бьют им', () => {
    const book = {
      ...compendium,
      records: [...(compendium.records.map(i => i.id === 'longsword-item'
        ? { ...i, bindings: [{ label: 'Атака', effect: 'poisoned', args: {} }] }
        : i))],
    };
    throws(() => send('longsword-item:0', { system, sheet: arven, compendium: book, die: queue(10) }), 'пассивн');
  });
});
