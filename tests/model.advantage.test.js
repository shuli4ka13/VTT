import { group, test, eq, ok } from './harness.js';
import { ADVANTAGE_METHODS } from '../src/model/advantage-methods.js';
import { system } from '../src/model/system.js';
import { cyberpunk } from '../src/model/system-cyberpunk.js';

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

  test('киберпанк не объявляет НИ ОДНОЙ — днд-механика не навязывается миру хрома', () => {
    const methods = (cyberpunk.advantage || {}).methods || {};
    eq(Object.keys(methods).filter(id => methods[id]).length, 0);
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
