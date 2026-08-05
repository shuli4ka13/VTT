import { group, test, eq, ok, deepSame, throws } from './harness.js';
import { packWorld, unpackWorld } from '../src/ui/world.js';
import { system } from '../src/model/system.js';
import { compendium } from '../src/model/compendium.js';
import { arven, mirra } from '../src/model/sheets.js';

// Мир = система + компендиум + чарники, одним JSON. Это критерий №1
// (round-trip без вычисленного), возведённый в интерфейс: автор выгружает мир
// из конструктора, партия загружает его в игровой стол. Никакого хранилища —
// файл, явное действие человека.

const world = () => ({ system, compendium, sheets: [arven, mirra] });

group('мир как файл', () => {
  test('туда и обратно — тот же мир', () => {
    const text = packWorld(world());
    const back = unpackWorld(text);
    deepSame(back.system, system);
    deepSame(back.compendium, compendium);
    deepSame(back.sheets, [arven, mirra]);
  });

  test('в файле есть версия формата — задел на миграции', () => {
    const raw = JSON.parse(packWorld(world()));
    ok(Number.isInteger(raw.version), 'без версии файл не мигрировать');
  });

  test('битый JSON — внятная ошибка, а не белый экран', () => {
    throws(() => unpackWorld('{кот'), 'разобрать');
  });

  test('JSON не о том — ошибка называет, чего не хватает', () => {
    throws(() => unpackWorld('{"version":1,"system":{}}'), 'полей');
    throws(() => unpackWorld(JSON.stringify({ version: 1, system: { fields: [] }, sheets: [] })), 'компендиум');
  });

  test('файл из будущего формата — честный отказ, а не тихая порча', () => {
    const raw = JSON.parse(packWorld(world()));
    raw.version = 999;
    throws(() => unpackWorld(JSON.stringify(raw)), '999');
  });
});
