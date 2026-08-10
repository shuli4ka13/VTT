// Сид стенда: публикует обе образцовые системы готовыми мирами.
//
// Конструктор стартует С ЧИСТОГО ЛИСТА — образцы в нём только доноры,
// кусочки для копирования. Но партии нужен мир, в который можно сесть сразу:
// `make ts-seed` кладёт на сервер «D&D 5e» и «Киберпанк» через тот же
// HTTP API, каким публикует конструктор, — никакого второго пути в БД.
//
// Повторный запуск ничего не дублирует: мир с таким именем уже есть — пропуск.
//
//   VTT_URL   — адрес сервера (умолчание http://localhost:8200)
//   VTT_OWNER — под кем публиковать (умолчание «Стенд»)

import { system as dnd5e } from '@vtt/engine/model/system';
import { compendium as dndCompendium } from '@vtt/engine/model/compendium';
import { arven, mirra } from '@vtt/engine/model/sheets';
import { cyberpunk, cpCompendium, silver, raze } from '@vtt/engine/model/system-cyberpunk';

// Копия глубокая: сид не смеет мутировать модули-образцы.
export function sampleWorlds() {
  return structuredClone([
    { title: String(dnd5e.name), world: { system: dnd5e, compendium: dndCompendium, sheets: [arven, mirra] } },
    { title: String(cyberpunk.name), world: { system: cyberpunk, compendium: cpCompendium, sheets: [silver, raze] } },
  ]);
}

export async function seed(url: string, owner: string): Promise<string[]> {
  const login = await call(`${url}/auth/login`, 'POST', null, { name: owner }) as { token: string };
  const token = login.token;

  const existing = await call(`${url}/worlds`, 'GET', token) as { title: string }[];
  const taken = new Set(existing.map(w => w.title));

  const published: string[] = [];
  for (const { title, world } of sampleWorlds()) {
    if (taken.has(title)) {
      console.log(`· «${title}» уже на стенде — пропущен`);
      continue;
    }
    await call(`${url}/worlds`, 'POST', token, { title, world });
    console.log(`✓ «${title}» опубликован (автор: ${owner})`);
    published.push(title);
  }
  return published;
}

async function call(url: string, method: string, token: string | null, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${method} ${url}: ${JSON.stringify(data?.message ?? data ?? res.status)}`);
  }
  return data;
}
