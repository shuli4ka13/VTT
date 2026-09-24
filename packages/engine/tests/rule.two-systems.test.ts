import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { send, receive, bindingsOf } from '../src/events/envelope.ts';
import { exchange } from '../src/events/exchange.ts';
import { serializeSheet } from '../src/model/serialize.ts';
import { system, arven, mirra, compendium, cyberpunk, cpCompendium, silver, raze } from './fixtures.ts';
import { AMOUNT_SOURCES } from '../src/model/amount-sources.ts';
import { SOURCES } from '../src/engine/steps/amount.ts';

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const ctx5 = (sheet, die) => ({ system, sheet, compendium, die });

group('две системы одними слотами', () => {
  group('A: срез 5e', () => {
    test('полный ход: порог → величина → применить, трасса несёт все числа', () => {
      const env = send('longsword-item:0', ctx5(arven, queue(10, 5)));
      const { sheet, report } = receive(env, ctx5(mirra, queue()));

      eq(report.stopped, null);
      eq(report.trace.length, 5, 'три шага удара и два шага общего эффекта «Урон»');
      deepEq(report.trace[0].versus, { tag: 'ac', value: 14 }, 'КД посчитан получателем');
      eq(report.trace[0].total, 16, 'бросок 10 плюс бонус атаки 6');
      eq(report.trace[0].margin, 2);
      eq(report.trace[1].total, 8, 'кость меча 5 плюс Сила 3');
      eq(report.trace[2].event, 'damage', 'удар не трогает хиты сам — отправляет посчитанное');
      deepEq(report.trace[2].tags, ['рубящий'], 'тип урона приехал из записи оружия');
      eq(report.trace[2].amount, 8);
      eq(report.trace[4].within, 'damage', 'хиты снимает общий эффект');
      eq(report.trace[4].from, 21);
      eq(report.trace[4].to, 13);
      deepEq(report.changes, [{ tag: 'hp_current', from: 21, to: 13 }],
        'временные хиты были нулём и нулём остались — в изменениях их нет');
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
      deepEq(failed.sheet.effects, [...arven.effects, { effectId: 'poisoned' }]);

      const held = receive(env, ctx5(arven, queue(19)));
      eq(held.report.stopped.reason, 'threshold-held', 'спасся — обрыв, и он различим в журнале');
      eq(held.sheet.values.hp_current, 44);
      deepEq(held.sheet.effects, arven.effects);
    });

    test('лечение — не урон с минусом: потолок это максимум хитов', () => {
      const wounded = { ...arven, values: { ...arven.values, hp_current: 40 } };
      const env = send('healing-word', ctx5(mirra, queue(2)));
      const { sheet, report } = receive(env, ctx5(wounded, queue()));
      eq(report.trace[1].amount, 5, 'кость 2 плюс Харизма лекаря 3');

      eq(sheet.values.hp_current, 44, '40 + 5, но max поля — 44');
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
    const shoot = (rolls: number[], inputs: Record<string, number | string>, sheets = [silver, raze]) => {
      let at = 0;
      return exchange({
        system: cyberpunk, compendium: cpCompendium, die: () => rolls[at++] ?? 1,
        sheets, actionId: 'heavy-pistol:0', fromId: 'silver', toId: 'raze', inputs: { aim: 'по телу', ...inputs },
      });
    };

    test('дистанция даёт сложность по таблице, удача прибавляется к броску и тратится', () => {
      const out = shoot([4, 3, 3, 3], { distance: 30, spend_luck: 2 });
      const main = out.reports.find(entry => entry.report.kind === 'effect')!.report;
      const dv = main.trace.find(line => line.step === 'dv') as { result: number };
      eq(dv.result, 25, '30 метров — сложность 25');

      const hit = main.trace.find(line => line.step === 'hit') as { bonus: number; total: number };
      eq(hit.bonus, 16, 'навык с рефлексами 14 плюс два очка удачи');
      eq(hit.total, 20, 'кость 4 плюс 16');

      eq(out.sheets.find(s => s.id === 'silver')!.values.luck_left, 4, 'удача списана дорожкой «со мной»');
    });

    test('урон идёт через общий эффект: броня режет и сама изнашивается', () => {
      const out = shoot([15, 6, 6, 6], { distance: 3, spend_luck: 0 });
      const target = out.sheets.find(s => s.id === 'raze')!;
      eq(target.values.sp_body, 10, 'броня изношена на единицу');
      eq(target.values.hp, 33, '45 минус (18 − броня 11)');
    });

    test('броня держит: слабый урон не проходит и брони не портит', () => {
      const out = shoot([15, 1, 1, 1], { distance: 3, spend_luck: 0 });
      const target = out.sheets.find(s => s.id === 'raze')!;
      eq(target.values.hp, 40, 'хиты целы');
      eq(target.values.sp_body, 11, 'и броня цела');
    });

    test('две шестёрки на костях урона добавляют пятёрку отдельным вызовом', () => {
      const boom = shoot([15, 6, 6, 1], { distance: 3, spend_luck: 0 });
      const plain = shoot([15, 6, 1, 1], { distance: 3, spend_luck: 0 });
      const hp = (out: typeof boom) => Number(out.sheets.find(s => s.id === 'raze')!.values.hp);
      ok(hp(boom) < hp(plain), `${hp(boom)} должно быть меньше ${hp(plain)}`);
    });

    test('лист получателя после выстрела — по-прежнему законный DTO', () => {
      const out = shoot([15, 6, 6, 6], { distance: 3, spend_luck: 0 });
      serializeSheet(out.sheets.find(s => s.id === 'raze')!);
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

      const book = {
        ...compendium,
        items: [...compendium.items,
          { id: 'axe-item', rk: 'weapon', label: 'Топор',
            props: { damage_dice: '1d12', damage_type: 'рубящий' }, modifiers: [],

            activities: [{ label: 'Удар', effect: 'strike',
              args: { damage_dice: { prop: 'damage_dice' }, damage_type: { prop: 'damage_type' } } }] }],
      };
      const margined = {
        ...system,
        effects: {
          ...system.effects,
          strike: {
            ...system.effects.strike,
            steps: system.effects.strike.steps.map(s => s.id === 'dmg'
              ? { ...s, source: 'margin', margin: { expr: '@hit.margin' } }
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
