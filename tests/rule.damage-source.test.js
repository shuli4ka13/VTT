import { group, test, eq, ok, deepEq, throws } from './harness.js';
import { send, receive } from '../src/events/envelope.js';
import { system } from '../src/model/system.js';
import { arven, mirra } from '../src/model/sheets.js';
import { compendium } from '../src/model/compendium.js';

// Лакмус каркаса из разбора урона: одна запись «Удар длинным мечом», один движок;
// две системы, отличающиеся ОДНОЙ строкой данных, дают урон по модели 5e
// (свой бросок) и по модели Shadowrun (оружие + превышение защиты).
//
// Числа фиксированы очередями костей: Арвен (бонус атаки 6) бьёт Мирру (КД 14).
// Кость атаки 10 → бросок 16, превышение 2. Кость урона 5, Сила 3 → база 8.

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const ctx = (sheet, die) => ({ system, sheet, compendium, die });

// Та же система, в которой переключён ровно один слот. Больше не меняется ничего.
const margined = { ...system, rules: { attack: { damage: { source: 'margin' } } } };

group('правило урона: источник величины', () => {
  group('результат проверки — структура, а не флаг', () => {
    test('отчёт атаки несёт: вышло или нет, превышение, что выпало на костях', () => {
      const env = send('longsword', ctx(arven, queue(10, 5)));
      const { report } = receive(env, ctx(mirra, queue()));
      deepEq(report.check, {
        success: true,
        margin: 2,
        dice: { rolls: [10], kept: 10 },
      });
    });

    test('при промахе превышение отрицательное — задел на степени провала', () => {
      const env = send('longsword', ctx(arven, queue(2, 5)));
      const { report } = receive(env, ctx(mirra, queue()));
      eq(report.check.success, false);
      eq(report.check.margin, -6, 'бросок 8 против КД 14');
      eq(report.damage, null, 'урон — только при попадании');
    });

    test('натуральная двадцатка различима по кубу, а не по сумме', () => {
      const env = send('longsword', ctx(arven, queue(20, 5)));
      const { report } = receive(env, ctx(mirra, queue()));
      eq(report.check.dice.kept, 20);
    });

    test('спасбросок — тоже проверка: та же структура в отчёте', () => {
      const env = send('poison-spray', ctx(mirra, queue(3, 4)));
      const { report } = receive(env, ctx(arven, queue(5)));
      deepEq(report.check, {
        success: false,
        margin: -7,
        dice: { rolls: [5], kept: 5 },
      }, 'спасбросок 6 против сложности 13');
    });
  });

  group('слот источника лежит в системе', () => {
    test('система без раздела rules работает как раньше: урон равен базе', () => {
      const { rules, ...bare } = system;
      const env = send('longsword', { system: bare, sheet: arven, compendium, die: queue(10, 5) });
      eq(env.onHit.damage.source, 'roll', 'отсутствие слота — это «свой бросок»');
      const { report } = receive(env, { system: bare, sheet: mirra, compendium, die: queue() });
      eq(report.damage.total, 8, 'кость 5 плюс Сила 3, превышение не участвует');
    });

    test('конверт не финализирует урон — итог рождается у получателя', () => {
      const env = send('longsword', ctx(arven, queue(10, 5)));
      eq(env.onHit.damage.base, 8, 'своя часть отправителя: кость 5 плюс Сила 3');
      ok(!('total' in env.onHit.damage), 'финального итога в конверте нет');
    });

    test('лакмус: смена одного слота переключает 5e на Shadowrun, движок один', () => {
      const env5e = send('longsword', ctx(arven, queue(10, 5)));
      const envSR = send('longsword', { system: margined, sheet: arven, compendium, die: queue(10, 5) });

      const hit5e = receive(env5e, ctx(mirra, queue())).report;
      const hitSR = receive(envSR, { system: margined, sheet: mirra, compendium, die: queue() }).report;

      eq(hit5e.damage.total, 8, '5e: база 8, превышение не участвует');
      eq(hit5e.damage.margin, null);
      eq(hitSR.damage.total, 10, 'Shadowrun: та же база 8 плюс превышение 2');
      eq(hitSR.damage.margin, 2);
    });

    test('хиты получателя падают на финальный урон, а не на базу', () => {
      const env = send('longsword', { system: margined, sheet: arven, compendium, die: queue(10, 5) });
      const { sheet } = receive(env, { system: margined, sheet: mirra, compendium, die: queue() });
      eq(sheet.values.hp_current, 11, '21 минус (8 базы + 2 превышения)');
    });
  });

  group('урон без костей', () => {
    // Пример из разбора: защита пробита с превышением 2, урон меча 3 → итого 5.
    const book = {
      ...compendium,
      actions: [{
        id: 'sr-blade', kind: 'action', label: 'Клинок',
        envelope: {
          kind: 'attack',
          roll: { die: 20, bonus: '#attack_bonus', target: 'attack_roll' },
          versus: 'ac',
          onHit: { damage: { bonus: '3' }, applyTo: 'hp_current' },
        },
      }],
    };

    test('урон оружия — число без костей', () => {
      const env = send('sr-blade', { system: margined, sheet: arven, compendium: book, die: queue(10) });
      deepEq(env.onHit.damage.rolls, [], 'кости урона не бросались вовсе');
      eq(env.onHit.damage.base, 3);
    });

    test('урон оружия плюс превышение — пример из разбора', () => {
      const env = send('sr-blade', { system: margined, sheet: arven, compendium: book, die: queue(10) });
      const { report } = receive(env, { system: margined, sheet: mirra, compendium: book, die: queue() });
      eq(report.damage.total, 5, 'меч 3 плюс превышение 2');
    });

    test('конверт остаётся чистыми данными и переживает сериализацию', () => {
      const env = send('sr-blade', { system: margined, sheet: arven, compendium: book, die: queue(10) });
      deepEq(JSON.parse(JSON.stringify(env)), env);
    });
  });

  group('сторожа против бессмыслицы в слоте', () => {
    test('неизвестный источник в системе — внятная ошибка при отправке', () => {
      const broken = { ...system, rules: { attack: { damage: { source: 'котик' } } } };
      throws(() => send('longsword', { system: broken, sheet: arven, compendium, die: queue(10, 5) }), 'котик');
    });

    test('неизвестный источник в пришедшем конверте — внятная ошибка при получении', () => {
      const env = send('longsword', ctx(arven, queue(10, 5)));
      const forged = JSON.parse(JSON.stringify(env));
      forged.onHit.damage.source = 'котик';
      throws(() => receive(forged, ctx(mirra, queue())), 'котик');
    });
  });
});
