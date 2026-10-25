import { createHash } from 'node:crypto';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';

export function sampleWorlds() {
  return structuredClone(SAMPLE_WORLDS.map(({ title, ...world }) => ({ title, world })));
}

export async function seed(url: string, owner: string, mark = ''): Promise<string[]> {
  const login = await call(`${url}/auth/login`, 'POST', null, { name: owner }) as { token: string };
  const token = login.token;

  const systems = await call(`${url}/systems`, 'GET', token) as { id: string; title: string; mine?: boolean }[];
  const worlds = await call(`${url}/worlds`, 'GET', token) as { id: string; title: string; authorName: string }[];

  const done: string[] = [];
  for (const { title: name, world } of sampleWorlds()) {
    const title = mark ? `${name} · ${mark}` : name;
    const book = `${title} · основная книга`;

    const known = systems.find(s => s.mine && s.title === title);
    const systemId = known
      ? (await call(`${url}/systems/${known.id}`, 'PUT', token, { title, system: world.system }) as { id: string }).id
      : (await call(`${url}/systems`, 'POST', token, { title, system: world.system }) as { id: string }).id;
    await call(`${url}/systems/${systemId}/publish`, 'POST', token, {});

    const books = await call(`${url}/compendiums?systemId=${encodeURIComponent(systemId)}`, 'GET', token) as { id: string; title: string; systemId: string }[];
    const shelf = books.find(c => c.systemId === systemId && c.title === book);
    const compendiumId = shelf
      ? (await call(`${url}/compendiums/${shelf.id}`, 'PUT', token, { title: book, systemId, compendium: world.compendium }) as { id: string }).id
      : (await call(`${url}/compendiums`, 'POST', token, { title: book, systemId, compendium: world.compendium }) as { id: string }).id;
    await call(`${url}/compendiums/${compendiumId}/publish`, 'POST', token, {});

    const body = { title, systemId, compendiumIds: [compendiumId], sheets: world.sheets };
    const placed = worlds.find(w => w.title === title && w.authorName === owner);
    if (placed) await call(`${url}/worlds/${placed.id}`, 'PUT', token, body);
    else await call(`${url}/worlds`, 'POST', token, body);

    console.log(`${known ? '↻' : '✓'} «${title}» ${known ? 'обновлён' : 'опубликован'} (автор: ${owner})`);
    done.push(title);
  }
  return done;
}

async function call(url: string, method: string, token: string | null, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),

      ...(process.env.VTT_AUTH
        ? { cookie: 'vtt_gate=' + createHash('sha256').update(process.env.VTT_AUTH).digest('hex') }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${method} ${url}: ${JSON.stringify(data?.message ?? data ?? res.status)}`);
  }
  return data;
}
