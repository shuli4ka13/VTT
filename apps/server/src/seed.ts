import { createHash } from 'node:crypto';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';

export function sampleWorlds() {
  return structuredClone(SAMPLE_WORLDS.map(({ title, ...world }) => ({ title, world })));
}

export async function seed(url: string, owner: string, mark = ''): Promise<string[]> {
  const login = await call(`${url}/auth/login`, 'POST', null, { name: owner }) as { token: string };
  const token = login.token;

  const existing = await call(`${url}/worlds`, 'GET', token) as { title: string }[];
  const taken = new Set(existing.map(w => w.title));

  const published: string[] = [];
  for (const { title: name, world } of sampleWorlds()) {
    const title = mark ? `${name} · ${mark}` : name;
    if (taken.has(title)) {
      console.log(`· «${title}» уже на стенде — пропущен`);
      continue;
    }
    const system = await call(`${url}/systems`, 'POST', token,
      { title, system: world.system }) as { id: string };
    const compendium = await call(`${url}/compendiums`, 'POST', token,
      { title: `${title} · основная книга`, systemId: system.id, compendium: world.compendium }) as { id: string };
    await call(`${url}/systems/${system.id}/publish`, 'POST', token, {});
    await call(`${url}/compendiums/${compendium.id}/publish`, 'POST', token, {});
    await call(`${url}/worlds`, 'POST', token, {
      title, systemId: system.id, compendiumIds: [compendium.id], sheets: world.sheets,
    });
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
