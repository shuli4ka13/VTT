import { group, test, eq, ok, deepEq, throws } from './harness.js';
import { send, receive, bindingsOf } from '../src/events/envelope.js';
import { serializeSheet } from '../src/model/serialize.js';
import { system } from '../src/model/system.js';
import { arven, mirra } from '../src/model/sheets.js';
import { compendium } from '../src/model/compendium.js';
import { cyberpunk, cpCompendium, silver, raze } from '../src/model/system-cyberpunk.js';
import { AMOUNT_SOURCES } from '../src/model/amount-sources.js';
import { SOURCES } from '../src/engine/steps/amount.js';

// ПРИЁМОЧНЫЙ ТЕСТ РАЗБОРА: две системы одними слотами.
//
// A. D&D 5e:  порог 1d20+бонус против КД → величина костью оружия + модификатор
//             → применить: минус из хитов, пол 0, с сопротивлениями цели.
// B. Киберпанк: порог 1d10+модификатор против сложности → величина 2d8 ИЛИ фикс
//             предмета → сравнение с бронёй (меньше — обрыв) → минус из хитов
//             на разницу → минус 1 из прочности брони.
//
// Обе описываются данными. Если ради B пришлось бы трогать движок —
// модель неверна; этот файл не импортирует из движка ничего, кроме send/receive.

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const ctx5 = (sheet, die) => ({ system, sheet, compendium, die });
const ctxB = (sheet, die, book = cpCompendium) => ({ system: cyberpunk, sheet, compendium: book, die });

group('две системы одними слотами', () => {
  group('A: срез 5e', () => {
    test('полный ход: порог → величина → применить, трасса несёт все числа', () => {
      const env = send('longsword-item:0', ctx5(arven, queue(10, 5)));
      const { sheet, report } = receive(env, ctx5(mirra, queue()));

      eq(report.stopped, null);
      eq(report.trace.length, 3, 'три шага — три записи');
      deepEq(report.trace[0].versus, { tag: 'ac', value: 14 }, 'КД посчитан получателем');
      eq(report.trace[0].total, 16, 'бросок 10 плюс бонус атаки 6');
      eq(report.trace[0].margin, 2);
      eq(report.trace[1].total, 8, 'кость меча 5 плюс Сила 3');
      eq(report.trace[2].from, 21);
      eq(report.trace[2].to, 13);
      deepEq(report.changes, [{ tag: 'hp_current', from: 21, to: 13 }]);
      eq(sheet.values.hp_current, 13);
    });

    test('промах: обрыв на пороге, в журнале threshold-miss, цель не тронута', () => {
      const env = send('longsword-item:0', ctx5(arven, queue(2, 5)));
      const { sheet, report } = receive(env, ctx5(mirra, queue()));
      eq(report.stopped.reason, 'threshold-miss');
      eq(report.trace.length, 1, 'после обрыва шаги не исполнялись');
      eq(sheet.values.hp_current, 21);
      deepEq(report.changes, []);
    });

    test('сопротивление цели половинит урон — модификаторы цели включены в правиле', () => {
      const stony = { ...mirra, effects: [{ effectId: 'stoneskin' }] };
      const env = send('longsword-item:0', ctx5(arven, queue(10, 5)));
      const { sheet, report } = receive(env, ctx5(stony, queue()));
      eq(report.trace[2].incoming, 8, 'пришло восемь…');
      eq(report.trace[2].amount, 4, '…каменная кожа оставила четыре');
      eq(sheet.values.hp_current, 17);
    });

    test('спасбросок — то же правило порога, бросает и считает получатель', () => {
      const env = send('poison-spray:0', ctx5(mirra, queue(3, 4)));
      const failed = receive(env, ctx5(arven, queue(5)));
      eq(failed.report.stopped, null, 'спас провален — цепочка дошла до конца');
      eq(failed.sheet.values.hp_current, 37, '44 минус 2d6=7');
      deepEq(failed.sheet.effects, [{ effectId: 'poisoned' }]);

      const held = receive(env, ctx5(arven, queue(19)));
      eq(held.report.stopped.reason, 'threshold-held', 'спасся — обрыв, и он различим в журнале');
      eq(held.sheet.values.hp_current, 44);
      deepEq(held.sheet.effects, []);
    });

    test('лечение — не урон с минусом: потолок это максимум хитов', () => {
      const wounded = { ...arven, values: { ...arven.values, hp_current: 40 } };
      const env = send('healing-word', ctx5(mirra, queue(2)));
      const { sheet, report } = receive(env, ctx5(wounded, queue()));
      eq(report.trace[1].amount, 5, 'кость 2 плюс Харизма лекаря 3');
      eq(sheet.values.hp_current, 44, '40 + 5, но потолок 44');
      eq(report.trace[1].ceiling, 44, 'потолок посчитан листом цели');
    });

    test('лечение — не урон с минусом: сопротивление его не половинит', () => {
      const stonyWounded = {
        ...arven,
        values: { ...arven.values, hp_current: 30 },
        effects: [{ effectId: 'stoneskin' }],
      };
      const env = send('healing-word', ctx5(mirra, queue(2)));
      const { sheet } = receive(env, ctx5(stonyWounded, queue()));
      eq(sheet.values.hp_current, 35, 'все 5, а не floor(5/2): модификаторы цели выключены');
    });
  });

  group('B: срез киберпанка', () => {
    test('клинок: фикс предмета, пробитие брони, ДВА применить в два поля', () => {
      const env = send('mono-knife:0', ctxB(silver, queue(7)));
      const { sheet, report } = receive(env, ctxB(raze, queue()));

      eq(report.stopped, null);
      eq(report.trace.length, 5, 'порог, величина, сравнение, два применить');
      eq(report.trace[0].total, 13, 'к10=7 плюс навык 6');
      deepEq(report.trace[0].versus, { value: 12 }, 'сложность — число из эффекта');
      eq(report.trace[1].total, 8, 'урон ножа — число из записи, костей не бросали');
      deepEq(report.trace[1].rolls, []);
      eq(report.trace[2].margin, 4, 'величина 8 против брони 4');
      deepEq(report.changes, [
        { tag: 'hp', from: 18, to: 14 },
        { tag: 'armor', from: 4, to: 3 },
      ], 'хиты минус разница, броня минус единица — одно правило, два поля');
      eq(sheet.values.hp, 14);
      eq(sheet.values.armor, 3);
    });

    test('выстрел: тот же эффект-механизм, но величина — 2d8', () => {
      const env = send('gun', ctxB(silver, queue(7, 5, 6)));
      const { sheet, report } = receive(env, ctxB(raze, queue()));
      eq(report.trace[1].total, 11, '2d8: 5 и 6');
      eq(sheet.values.hp, 11, '18 минус (11 − броня 4)');
      eq(sheet.values.armor, 3);
    });

    test('броня держит: обрыв на сравнении — ДРУГАЯ запись журнала, чем промах', () => {
      const env = send('gun', ctxB(silver, queue(7, 1, 1)));
      const { sheet, report } = receive(env, ctxB(raze, queue()));
      eq(report.stopped.reason, 'compare-short', 'не «мимо», а «попал, но не пробил»');
      eq(report.stopped.step, 'pen');
      eq(report.trace.length, 3, 'оба «применить» не исполнялись');
      eq(sheet.values.hp, 18, 'хиты целы');
      eq(sheet.values.armor, 4, 'и броня цела: не пробита — не изнашивается');
    });

    test('чарник получателя после удара — по-прежнему законный DTO', () => {
      const env = send('mono-knife:0', ctxB(silver, queue(7)));
      const { sheet } = receive(env, ctxB(raze, queue()));
      serializeSheet(sheet);
      deepEq(JSON.parse(JSON.stringify(env)), env, 'и конверт — чистые данные');
    });
  });

  group('эффект живёт в системе, запись — только циферки', () => {
    test('ни в одной записи компендиума нет шагов, аргументы — скаляры', () => {
      const books = [
        { system, compendium },
        { system: cyberpunk, compendium: cpCompendium },
      ];
      let checked = 0;
      for (const { system: sys, compendium: book } of books) {
        for (const record of [...book.items, ...book.actions]) {
          ok(!('steps' in record), `${record.id}: шаги живут в системе, не в записи`);
          for (const binding of bindingsOf(record, sys)) {
            checked++;
            for (const [key, value] of Object.entries(binding.args || {})) {
              // Единственная законная структура — { prop }: «возьми из свойств
              // самой записи». Шагов и формул-объектов здесь быть не может.
              const scalar = ['string', 'number', 'boolean'].includes(typeof value);
              ok(scalar || (value && typeof value === 'object' && 'prop' in value),
                `${record.id}.${key}: аргумент — скаляр или { prop }, а не структура`);
            }
          }
        }
      }
      ok(checked >= 3, 'есть что проверять');
    });

    test('правка эффекта в системе меняет поведение ВСЕХ записей сразу', () => {
      // Меч и топор зовут один эффект «Атака». Меняем в системе ОДИН шаг —
      // источник величины на «превышение» — не трогая ни записей, ни движка.
      // Урон обоих смещается на превышение проверки.
      const book = {
        ...compendium,
        items: [...compendium.items,
          { id: 'axe-item', rk: 'weapon', label: 'Топор', props: { damage_dice: '1d12' }, modifiers: [],
            // Аргументов нет: у топора спрашивают только кость урона,
            // всё остальное — закон мира внутри эффекта «Атака».
            activities: [{ label: 'Удар', effect: 'strike', args: {} }] }],
      };
      const margined = {
        ...system,
        effects: {
          ...system.effects,
          strike: {
            ...system.effects.strike,
            steps: system.effects.strike.steps.map(s => s.id === 'dmg'
              ? { ...s, source: 'margin', margin: { ref: 'hit.margin' } }
              : s),
          },
        },
      };

      const swordWas = receive(send('longsword-item:0', ctx5(arven, queue(10, 5))), ctx5(mirra, queue())).report;
      const axeWas = receive(send('axe-item:0', { system, sheet: arven, compendium: book, die: queue(10, 7) }),
        { system, sheet: mirra, compendium: book, die: queue() }).report;
      const swordNow = receive(send('longsword-item:0', { system: margined, sheet: arven, compendium, die: queue(10, 5) }),
        { system: margined, sheet: mirra, compendium, die: queue() }).report;
      const axeNow = receive(send('axe-item:0', { system: margined, sheet: arven, compendium: book, die: queue(10, 7) }),
        { system: margined, sheet: mirra, compendium: book, die: queue() }).report;

      // Обе записи зовут ОДИН эффект и отличаются только костью урона.
      eq(swordWas.trace[1].total, 8, 'было: кость 5 плюс Сила 3');
      eq(axeWas.trace[1].total, 10, 'было: кость 7 плюс та же Сила 3');
      eq(swordNow.trace[1].total, 10, 'стало: плюс превышение 2 — записи не правили');
      eq(axeNow.trace[1].total, 12, 'стало: и у второй записи тоже');
    });
  });

  group('ведущая кость', () => {
    test('смена размера кости в данных системы меняет все броски, формулы не правились', () => {
      const asked = [];
      const spy = sides => { asked.push(sides); return 3; };

      const d12world = {
        ...system,
        constants: {
          ...system.constants,
          lead_die: { ...system.constants.lead_die, dice: [{ count: 1, sides: 12 }] },
        },
      };
      send('longsword-item:0', { system: d12world, sheet: arven, compendium, die: spy });
      eq(asked[0], 12, 'проверка пошла новой костью');
      eq(asked[1], 8, 'а кость урона осталась костью оружия');
    });

    test('у 5e и киберпанка разные ведущие кости — и это только данные', () => {
      deepEq(system.constants.lead_die.dice, [{ count: 1, sides: 20 }]);
      deepEq(cyberpunk.constants.lead_die.dice, [{ count: 1, sides: 10 }]);
    });
  });

  group('словарь источников величины', () => {
    test('движок и словарь конструктора согласованы', () => {
      deepEq(AMOUNT_SOURCES.map(s => s.id).sort(), [...SOURCES].sort(),
        'каждому источнику движка — статья словаря, и наоборот');
    });

    test('у каждой статьи есть лейбл и примеры реальных систем', () => {
      for (const src of AMOUNT_SOURCES) {
        ok(src.label, `${src.id}: нужен человеческий лейбл`);
        ok((src.examples || []).length, `${src.id}: нужны примеры`);
      }
    });
  });

  group('сторожа', () => {
    test('действие без эффекта — внятная ошибка', () => {
      const book = { ...compendium, actions: [{ id: 'пустое', label: 'Пустое', effect: 'нетакого' }] };
      throws(() => send('пустое', { system, sheet: arven, compendium: book, die: queue() }), 'нетакого');
    });

    test('запись зовёт эффект, которого система не объявляет', () => {
      const book = {
        ...compendium,
        actions: [...compendium.actions, { id: 'a', rk: 'action', label: 'А', effect: 'котик', args: {} }],
      };
      throws(() => send('a:0', { system, sheet: arven, compendium: book, die: queue() }), 'котик');
    });
  });
});
