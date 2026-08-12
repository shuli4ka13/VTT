import { group, test, eq, ok } from './harness.ts';
import { ADVANTAGE_METHODS } from '../src/model/advantage-methods.ts';
import { system, cyberpunk } from './fixtures.ts';

// Механики преимущества: СЛОВАРЬ — межсистемный справочник (какие вообще
// бывают, с примерами), а какие СУЩЕСТВУЮТ в конкретном мире — объявляет
// система. Экран автора рисует объявленное, а не весь справочник чеклистом.
// Тот же паттерн, что рода записей: у киберпанка нет «Заклинания» — и нет
// днд-шного преимущества.

group('механики преимущества объявляет система', () => {
  test('5e объявляет переброс — и только его', () => {
    const enabled = Object.keys(system.advantage.methods).filter(id => system.advantage.methods[id]);
    eq(enabled.length, 1);
    eq(enabled[0], 'rerollBest');
  });

  test('система объявляет ровно те механики, какими пользуются её эффекты', () => {
    // Раньше киберпанк не объявлял ни одной — и это было честно, пока в нём
    // не было ни одного эффекта, правящего бросок. Теперь есть «Вживлённые
    // рефлексы», и механика обязана быть объявлена: иначе модификатор
    // ссылался бы в пустоту.
    const used = new Set(Object.values(cyberpunk.effects)
      .flatMap(e => e.modifiers || [])
      .filter(m => m.effect)
      .map(m => m.method));
    const declared = (cyberpunk.advantage || {}).methods || {};
    for (const id of used) ok(declared[id], `механика «${id}» используется, но не объявлена`);
  });

  test('всё объявленное системой есть в справочнике', () => {
    for (const id of Object.keys(system.advantage.methods)) {
      ok(ADVANTAGE_METHODS.some(m => m.id === id), `«${id}» справочнику неизвестен`);
    }
  });

  test('справочник — с примерами реальных систем и честной пометкой «отыгран ли»', () => {
    ok(ADVANTAGE_METHODS.length >= 7, 'семь механик из черновика тимлида');
    for (const m of ADVANTAGE_METHODS) {
      ok(m.label, `${m.id}: нужен лейбл`);
      ok((m.examples || []).length, `${m.id}: нужны примеры систем`);
      ok(typeof m.implemented === 'boolean', `${m.id}: честность про отыгранность`);
    }
  });
});
