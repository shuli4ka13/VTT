// Сид стенда: публикует обе образцовые системы готовыми мирами.
//
// Конструктор стартует с чистого листа, но партии нужен мир, в который можно
// сесть сразу: `make seed` кладёт в стенд «D&D 5e — срез» и «Киберпанк — срез»
// через тот же HTTP API, каким публикует конструктор — никакого второго пути
// в БД. Повторный запуск ничего не дублирует: мир с таким именем уже есть —
// пропускаем.
//
//   VTT_URL   — адрес стенда (умолчание http://localhost:8100)
//   VTT_OWNER — под кем публиковать (умолчание «Стенд»)

import { system as dnd5e } from '../src/model/system.js';
import { compendium as dndCompendium } from '../src/model/compendium.js';
import { arven, mirra } from '../src/model/sheets.js';
import { cyberpunk, cpCompendium, silver, raze } from '../src/model/system-cyberpunk.js';

// Формат мира — тот же, что у файла (src/ui/world.js): version + три сущности.
// Копия глубокая: сид не смеет мутировать модули-образцы.
export function sampleWorlds() {
  return structuredClone([
    { name: dnd5e.name, world: { version: 2, system: dnd5e, compendium: dndCompendium, sheets: [arven, mirra] } },
    { name: cyberpunk.name, world: { version: 2, system: cyberpunk, compendium: cpCompendium, sheets: [silver, raze] } },
  ]);
}

async function main() {
  const url = process.env.VTT_URL || 'http://localhost:8100';
  const owner = process.env.VTT_OWNER || 'Стенд';

  const login = await call(`${url}/api/login`, 'POST', null, { name: owner });
  const token = login.token;

  const existing = await call(`${url}/api/worlds`, 'GET', token);
  const taken = new Set(existing.map(w => w.name));

  for (const { name, world } of sampleWorlds()) {
    if (taken.has(name)) {
      console.log(`· «${name}» уже на стенде — пропущен`);
      continue;
    }
    await call(`${url}/api/worlds`, 'POST', token, { name, world });
    console.log(`✓ «${name}» опубликован (автор: ${owner})`);
  }
}

async function call(url, method, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${url}: ${data.error || res.status}`);
  return data;
}

// Запуск напрямую (`node server/seed.js`); при импорте из тестов main не зовётся.
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  main().catch(err => { console.error(`сид не прошёл: ${err.message}`); process.exit(1); });
}
