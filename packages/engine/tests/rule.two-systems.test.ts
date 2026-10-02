import { group, test, eq, ok, deepEq, throws } from './harness.ts';
import { bindingsOf } from '../src/events/actions.ts';
import { exchange } from './play.ts';
import { serializeSheet } from '../src/model/serialize.ts';
import { system, arven, mirra, compendium, cyberpunk, cpCompendium, silver, raze } from './fixtures.ts';

const queue = (...values) => {
  const rest = [...values];
  return () => {
    if (!rest.length) throw new Error('кубик бросили больше раз, чем ожидал тест');
    return rest.shift();
  };
};

const play5 = (actionId, from, to, rolls, extra = {}) => exchange({
  system, compendium, die: queue(...rolls), sheets: [from, to], actionId, fromId: from.id, toId: to.id, ...extra,
});
const effectReport = out => out.reports.find(entry => entry.report.kind === 'effect' && entry.toId !== entry.fromId).report;
const sheetOf = (out, id) => out.sheets.find(s => s.id === id);

group('две системы одними слотами', () => {
  group('A: срез 5e', () => {
    const sharedReport = out => out.reports.find(entry => entry.report.kind === 'effect' && entry.toId === entry.fromId).report;

    test('полный ход: бросок → проверка → вызов урона → применить, трасса несёт все числа', () => {
      const out = play5('longsword-item:0', arven, mirra, [10, 5]);
      const report = effectReport(out);
      const sheet = sheetOf(out, mirra.id);

      eq(report.stopped, null);
      eq(report.trace.length, 5, 'проверка, ленивый расчёт урона, вызов урона и два применения в общем эффекте «Урон»');
      eq(sharedReport(out).trace[0].total, 16, 'бросок 10 плюс бонус атаки 6 — один раз, до целей');
      eq(report.trace[0].versus, 14, 'КД посчитан целью');
      eq(report.trace[0].total, 16);
      eq(report.trace[0].margin, 2);
      eq(report.trace[1].total, 8, 'урон считается при первом обращении: кость меча 5 плюс Сила 3');
      eq(report.trace[2].event, 'damage', 'удар не трогает хиты сам — отправляет посчитанное');
      deepEq(report.trace[2].tags, ['рубящий'], 'тип урона приехал из записи оружия');
      eq(report.trace[2].amount, 8);
      eq(report.trace[4].within, 'damage', 'хиты снимает общий эффект');
      eq(report.trace[4].from, 21);
      eq(report.trace[4].to, 13);
      deepEq(report.changes, [{ tag: 'hp_current', from: 21, to: 13, sheetId: mirra.id }],
        'временные хиты были нулём и нулём остались — в изменениях их нет');
      eq(sheet.values.hp_current, 13);
    });

    test('промах: обрыв на проверке, в журнале check-miss, цель не тронута', () => {
      const out = play5('longsword-item:0', arven, mirra, [2, 5]);
      const report = effectReport(out);
      const sheet = sheetOf(out, mirra.id);
      eq(report.stopped.reason, 'check-miss');
      eq(report.trace.length, 1, 'после обрыва шаги не исполнялись');
      eq(sheet.values.hp_current, 21);
      deepEq(report.changes, []);
    });

    test('сопротивление цели половинит урон — правка вызова «Урон» у носителя-цели', () => {
      const stony = { ...mirra, effects: [{ effectId: 'stoneskin' }] };
      const out = play5('longsword-item:0', arven, stony, [10, 5]);
      const report = effectReport(out);
      const sheet = sheetOf(out, stony.id);
      eq(report.trace[2].incoming, 8, 'пришло восемь…');
      eq(report.trace[2].amount, 4, '…каменная кожа оставила четыре');
      eq(sheet.values.hp_current, 17);
    });

    test('спасбросок — бросает и считает цель, урон бросается после него', () => {
      const failed = play5('poison-spray:0', mirra, arven, [3, 4, 5]);
      eq(effectReport(failed).stopped, null, 'спас провален — цепочка дошла до конца');
      eq(sheetOf(failed, arven.id).values.hp_current, 35, '44 минус 4+5');
      deepEq(sheetOf(failed, arven.id).effects, [...arven.effects, { effectId: 'poisoned' }]);

      const held = play5('poison-spray:0', mirra, arven, [19, 4, 5]);
      eq(effectReport(held).stopped.reason, 'check-held', 'спасся — обрыв, и он различим в журнале');
      eq(sheetOf(held, arven.id).values.hp_current, 44);
      deepEq(sheetOf(held, arven.id).effects, arven.effects);
    });

    test('лечение — не урон с минусом: потолок это максимум хитов', () => {
      const wounded = { ...arven, values: { ...arven.values, hp_current: 40 } };
      const out = play5('healing-word', mirra, wounded, [2]);
      const report = effectReport(out);
      const sheet = sheetOf(out, wounded.id);
      eq(report.trace[1].amount, 5, 'кость 2 плюс Харизма лекаря 3');

      eq(sheet.values.hp_current, 44, '40 + 5, но max поля — 44');
    });

    test('лечение — не урон с минусом: сопротивление его не половинит', () => {
      const stonyWounded = {
        ...arven,
        values: { ...arven.values, hp_current: 30 },
        effects: [{ effectId: 'stoneskin' }],
      };
      const sheet = sheetOf(play5('healing-word', mirra, stonyWounded, [2]), stonyWounded.id);
      eq(sheet.values.hp_current, 35, 'все 5, а не округлить вниз(5/2): модификаторы цели выключены');
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
      const shared = out.reports.find(entry => entry.report.kind === 'effect' && entry.toId === entry.fromId)!.report;
      const main = out.reports.find(entry => entry.report.kind === 'effect' && entry.toId !== entry.fromId)!.report;
      const dv = main.trace.find(line => line.step === 'dv') as { result: number };
      eq(dv.result, 25, '30 метров — сложность 25');

      const hit = shared.trace.find(line => line.step === 'hit_бросок') as { bonus: number; total: number };
      eq(hit.bonus, 16, 'навык с рефлексами 14 плюс два очка удачи');
      eq(hit.total, 20, 'кость 4 плюс 16');

      eq(out.sheets.find(s => s.id === 'silver')!.values.luck_left, 4, 'удача списана дорожкой «со мной»');
    });

    test('урон идёт через общий эффект: броня режет и сама изнашивается', () => {
      const out = shoot([15, 6, 6, 6], { distance: 3, spend_luck: 0 });
      const target = out.sheets.find(s => s.id === 'raze')!;
      eq(target.values.sp_body, 10, 'броня изношена на единицу');
      eq(target.values.hp, 28, '45 минус (18 − броня 11) и 5 мимо брони за шестёрки');
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
    test('ни в одной записи компендиума нет шагов, аргументы — формулы', () => {
      const books = [
        { system, compendium },
        { system: cyberpunk, compendium: cpCompendium },
      ];
      let checked = 0;
      for (const { system: sys, compendium: book } of books) {
        for (const record of book.records) {
          ok(!('steps' in record), `${record.id}: шаги живут в системе, не в записи`);
          for (const binding of bindingsOf(record, sys)) {
            checked++;
            for (const [key, value] of Object.entries(binding.args || {})) {

              ok(value && typeof value === 'object' && Object.keys(value).join() === 'expr',
                `${record.id}.${key}: аргумент — формула { expr }, как любое значение`);
            }
          }
        }
      }
      ok(checked >= 3, 'есть что проверять');
    });

    test('правка эффекта в системе меняет поведение ВСЕХ записей сразу', () => {

      const book = {
        ...compendium,
        records: [...compendium.records, { id: 'axe-item', table: 'weapon', label: 'Топор',
            cells: { damage_dice: '1d12', damage_type: 'рубящий' }, modifiers: [],

            bindings: [{ label: 'Удар', effect: 'strike',
              args: { damage_dice: { expr: '@damage_dice' }, damage_type: { expr: '@damage_type' } } }] }],
      };
      const margined = {
        ...system,
        effects: {
          ...system.effects,
          strike: {
            ...system.effects.strike,
            steps: system.effects.strike.steps.map(s => s.id === 'dmg'
              ? { ...s, fixed: { expr: `${s.fixed.expr} + 2` } }
              : s),
          },
        },
      };

      const strike = (sys, comp, id, rolls) => effectReport(exchange({
        system: sys, compendium: comp, die: queue(...rolls), sheets: [arven, mirra], actionId: id, fromId: arven.id, toId: mirra.id,
      }));
      const swordWas = strike(system, compendium, 'longsword-item:0', [10, 5]);
      const axeWas = strike(system, book, 'axe-item:0', [10, 7]);
      const swordNow = strike(margined, compendium, 'longsword-item:0', [10, 5]);
      const axeNow = strike(margined, book, 'axe-item:0', [10, 7]);

      eq(swordWas.trace[2].amount, 8, 'было: кость 5 плюс Сила 3');
      eq(axeWas.trace[2].amount, 10, 'было: кость 7 плюс та же Сила 3');
      eq(swordNow.trace[2].amount, 10, 'стало: плюс два в формуле урона — записи не правили');
      eq(axeNow.trace[2].amount, 12, 'стало: и у второй записи тоже');
    });
  });

  group('ведущая кость', () => {
    test('смена размера кости в данных системы меняет все броски, формулы не правились', () => {
      const asked = [];
      const spy = sides => { asked.push(sides); return sides; };

      const d12world = {
        ...system,
        constants: {
          ...system.constants,
          lead_die: { ...system.constants.lead_die, dice: [{ count: 1, sides: 12 }] },
        },
      };
      exchange({ system: d12world, compendium, die: spy, sheets: [arven, mirra], actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id });
      eq(asked[0], 12, 'проверка пошла новой костью');
      eq(asked[1], 8, 'а кость урона осталась костью оружия');
    });

    test('у 5e и киберпанка разные ведущие кости — и это только данные', () => {
      deepEq(system.constants.lead_die.dice, [{ count: 1, sides: 20 }]);
      deepEq(cyberpunk.constants.lead_die.dice, [{ count: 1, sides: 10 }]);
    });
  });

  group('сторожа', () => {
    test('действие без эффекта — внятная ошибка', () => {
      const book = { ...compendium, records: [{ id: 'пустое', label: 'Пустое', bindings: [{ label: 'Пустое', effect: 'нетакого', args: {} }] }] };
      throws(() => exchange({ system, compendium: book, die: queue(), sheets: [arven, mirra], actionId: 'пустое', fromId: arven.id, toId: mirra.id }), 'нетакого');
    });

    test('запись зовёт эффект, которого система не объявляет', () => {
      const book = {
        ...compendium,
        records: [...compendium.records, { id: 'a', table: 'action', label: 'А', bindings: [{ label: 'А', effect: 'котик', args: {} }] }],
      };
      throws(() => exchange({ system, compendium: book, die: queue(), sheets: [arven, mirra], actionId: 'a:0', fromId: arven.id, toId: mirra.id }), 'котик');
    });
  });
});
