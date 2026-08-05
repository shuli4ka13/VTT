import { group, test, eq, ok } from './harness.js';
import { sampleWorlds } from '../server/seed.js';
import { unpackWorld } from '../src/ui/world.js';

// Сид стенда: обе образцовые системы публикуются в БД готовыми мирами —
// конструктор теперь стартует с чистого листа, а партии нужен мир, в который
// можно сесть сразу. Формат тот же, что у файла мира (world.js) — сид не
// изобретает второго контракта.

group('сид стенда: образцы как готовые миры', () => {
  test('собираются оба мира — 5e и киберпанк, с листами и компендиумом', () => {
    const worlds = sampleWorlds();
    eq(worlds.length, 2);

    const names = worlds.map(w => w.name);
    ok(names.some(n => n.includes('5e')), '5e на месте');
    ok(names.some(n => n.includes('Киберпанк')), 'киберпанк на месте');

    for (const { world } of worlds) {
      ok(world.system.fields.length > 0, 'система с полями');
      ok(world.sheets.length >= 2, 'минимум два персонажа — есть кому общаться конвертами');
      ok(world.compendium.items.length + world.compendium.actions.length > 0, 'библиотека не пуста');
    }
  });

  test('мир сида проходит тот же контракт, что файл мира', () => {
    for (const { world } of sampleWorlds()) {
      const back = unpackWorld(JSON.stringify(world));
      eq(back.system.id, world.system.id, 'unpack принял мир без правок');
    }
  });

  test('сид не мутирует модули-образцы: мир — глубокая копия', () => {
    const [first] = sampleWorlds();
    first.world.system.name = 'испорчено';
    const [again] = sampleWorlds();
    ok(again.world.system.name !== 'испорчено', 'образец цел');
  });
});
