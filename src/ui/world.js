// Мир одним файлом: система + компендиум + чарники.
//
// Это критерий №1 (round-trip JSON без вычисленного), возведённый
// в интерфейс, — и минимальный мост между двумя приложениями: автор
// ВЫГРУЖАЕТ мир из конструктора, партия ЗАГРУЖАЕТ его в игровой стол.
// Хранилища нет намеренно (ТЗ: данные в памяти) — файл, явное действие
// человека. В полноценном приложении на этом месте встанет сервис с БД,
// формат файла останется публичным контрактом.

import { migrateWorld } from '../model/migrate.js';

const VERSION = 2;
const READABLE = [1, 2];

export function packWorld({ system, compendium, sheets }) {
  return JSON.stringify({ version: VERSION, system, compendium, sheets }, null, 2);
}

export function unpackWorld(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('это не мир: файл не удалось разобрать как JSON');
  }

  // Первая версия читается и переводится на новый формат один раз, при
  // загрузке: иначе командные миры, выгруженные до перекройки, умерли бы.
  if (!READABLE.includes(raw.version)) {
    throw new Error(`файл мира версии «${raw.version}», эта сборка понимает ${READABLE.join(' и ')}`);
  }
  if (!raw.system || !Array.isArray(raw.system.fields)) {
    throw new Error('в файле нет системы с составом полей');
  }
  if (!raw.compendium || !Array.isArray(raw.compendium.items)) {
    throw new Error('в файле нет компендиума');
  }
  if (!Array.isArray(raw.sheets)) {
    throw new Error('в файле нет чарников (пустой список — тоже список)');
  }

  return migrateWorld({ system: raw.system, compendium: raw.compendium, sheets: raw.sheets });
}
