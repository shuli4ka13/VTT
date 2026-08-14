import { group, test, eq, ok, deepEq } from './harness.ts';
import { editPrimitives } from '../src/engine/roll-edits.ts';
import { unifyRollEdits } from '../src/model/unify.ts';
import { ADVANTAGE_METHODS } from '../src/model/advantage-methods.ts';
import { system, cyberpunk } from './fixtures.ts';

// Правки броска: МЕХАНИКА живёт записью словаря системы, ПОВОД — эффектом.
// Имя записи даёт автор мира («Преимущество», «Фора», «Ускорение»): слово
// доменное, а механике доменные слова запрещены. Движок знает только
// примитивы, из которых запись собрана.
//
// Прежний межсистемный справочник (advantage-methods.ts) из механизма ушёл:
// семь механик черновика — это готовые ЗАПИСИ для образцов, а не чекбоксы
// в системе. Он остаётся как материал для образцов, и на него больше ничто
// не ссылается — за этим следит последняя группа.

group('правки броска — словарь автора', () => {
  test('образец 5e объявляет привычную пару, и она гасит сама себя', () => {
    const edits = system.roll_edits;
    eq(edits.advantage.label, 'Преимущество');
    eq(edits.disadvantage.label, 'Помеха');
    eq(edits.advantage.canceledBy, 'disadvantage');
    eq(edits.disadvantage.canceledBy, 'advantage');
  });

  test('преимущество собрано из примитивов, а не названо механикой', () => {
    deepEq(system.roll_edits.advantage.ops, [{ op: 'addDie' }, { op: 'keepBest', n: 1 }]);
  });

  test('каждый примитив записи есть в реестре движка', () => {
    const known = new Set(editPrimitives().map(p => p.op));
    for (const world of [system, cyberpunk]) {
      for (const [key, edit] of Object.entries(world.roll_edits ?? {})) {
        for (const op of edit.ops) ok(known.has(op.op), `«${key}»: примитив «${op.op}» неизвестен`);
      }
    }
  });

  test('каждая ссылка модификатора попадает в словарь своей системы', () => {
    for (const world of [system, cyberpunk]) {
      const named = Object.values(world.effects)
        .flatMap(e => e.modifiers ?? [])
        .filter(m => m.kind === 'roll' && m.edit)
        .map(m => m.edit);
      for (const key of named) {
        ok((world.roll_edits ?? {})[key], `правка «${key}» используется, но не объявлена`);
      }
    }
  });

  test('одинокая правка не ссылается на несуществующее гашение', () => {
    // В киберпанке помехи нет вовсе — значит и «гасится помехой» стоять
    // не может: ссылка в пустоту это ошибка, а не «просто не сработает».
    for (const [key, edit] of Object.entries(cyberpunk.roll_edits ?? {})) {
      if (edit.canceledBy) {
        ok(cyberpunk.roll_edits[edit.canceledBy], `«${key}» гасится тем, чего в мире нет`);
      }
    }
  });

  test('реестр примитивов делится на два этапа конвейера', () => {
    const stages = new Set(editPrimitives().map(p => p.stage));
    ok(stages.has('claim'), 'правки заявки — до броска');
    ok(stages.has('result'), 'правки результата — с костями на руках');
  });
});

group('перевод старой формы', () => {
  const legacy = () => ({
    id: 'старый', fields: [], effects: {
      poisoned: {
        label: 'Отравлен', activation: 'passive',
        modifiers: [{ kind: 'roll', target: 'attack_roll', effect: 'disadvantage', method: 'rerollBest' }],
      },
    },
    advantage: { methods: { rerollBest: true } },
  });

  test('зашитый режим становится ссылкой на запись словаря', () => {
    const next = unifyRollEdits(legacy());
    const mod = next.effects.poisoned.modifiers[0];
    eq(mod.edit, 'disadvantage');
    eq(mod.effect, undefined, 'старой формы не остаётся — иначе мир жил бы на двух сразу');
    eq(mod.method, undefined, 'чем правка отыгрывается, сказано в записи, а не в ссылке');
    eq(next.roll_edits.disadvantage.label, 'Помеха');
  });

  test('гашение не заводится на запись, которой в мире нет', () => {
    const next = unifyRollEdits(legacy());
    eq(next.roll_edits.advantage, undefined, 'преимуществом никто не пользовался');
    eq(next.roll_edits.disadvantage.canceledBy, undefined);
  });

  test('справочник механик системы упраздняется вместе с понятием', () => {
    eq(unifyRollEdits(legacy()).advantage, undefined);
  });

  test('система без старой формы возвращается та же самая', () => {
    eq(unifyRollEdits(system), system, 'переводить нечего — не копируем');
  });
});

group('справочник механик — материал для образцов, не механизм', () => {
  test('семь механик черновика с примерами живы как материал', () => {
    ok(ADVANTAGE_METHODS.length >= 7, 'семь механик из черновика тимлида');
    for (const m of ADVANTAGE_METHODS) {
      ok(m.label, `${m.id}: нужен лейбл`);
      ok((m.examples || []).length, `${m.id}: нужны примеры систем`);
    }
  });

  test('ни одна система на него не ссылается — механика теперь в записях', () => {
    for (const world of [system, cyberpunk]) {
      eq(world.advantage, undefined, 'секция advantage.methods упразднена');
    }
  });
});
