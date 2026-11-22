import { createHash } from 'node:crypto';
import { lintSystem, errorsOf, flattenSystem } from '@vtt/engine';
import { SAMPLE_WORLDS, LITE_WORLDS } from '@vtt/engine/samples';
import type { SampleWorld } from '@vtt/engine/samples';

export function blankOf(world: SampleWorld): SampleWorld {
  const system = structuredClone(world.system) as unknown as Record<string, unknown> & { tables?: Record<string, Record<string, unknown>>; sheets?: Record<string, Record<string, unknown>> };
  system.effects = {};
  system.name = `${String(system.name ?? world.title)} · с нуля`;
  for (const key of ['rolls', 'grants', 'roll_edits', 'tags']) delete system[key];
  for (const kind of Object.values(system.sheets ?? {})) delete kind.grants;
  for (const table of Object.values(system.tables ?? {})) {
    if (table.shape !== 'book') continue;
    for (const key of ['bindings', 'grants', 'modifiers']) delete table[key];
  }
  return {
    title: world.title,
    system: system as unknown as SampleWorld['system'],
    compendium: { records: [] } as unknown as SampleWorld['compendium'],
    sheets: world.sheets.map(sheet => ({ ...sheet, has: [], effects: [] })) as SampleWorld['sheets'],
  };
}

const playable = (world: SampleWorld): boolean => errorsOf(lintSystem(flattenSystem(world.system), world.compendium)).length === 0;


export function sampleWorlds() {
  return structuredClone([
    ...SAMPLE_WORLDS.map(({ title, ...world }) => ({ title: `${title} · полный`, world })),
    ...LITE_WORLDS.map(({ title, ...world }) => ({ title: `${title} · лёгкий`, world })),
    ...LITE_WORLDS.map(blankOf).filter(playable).map(({ title, ...world }) => ({ title: `${title} · с нуля`, world })),
  ]);
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
