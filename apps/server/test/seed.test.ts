import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import type { Database } from '../src/db/db.ts';
import { seed, sampleWorlds } from '../src/seed.ts';

let app: INestApplication;
let db: Database;
let url = '';

beforeAll(async () => {
  db = openDatabase(':memory:');
  const ref = await Test.createTestingModule({
    imports: [AppModule.create({ database: db, now: () => '2026-08-10T00:00:00.000Z' })],
  }).compile();
  app = ref.createNestApplication({ bodyParser: false });
  allowBigWorlds(app);
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  await app.listen(0);
  url = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
});

afterAll(async () => { await app.close(); db.close(); });

describe('сид стенда', () => {
  it('кладёт обе образцовые системы готовыми мирами', async () => {
    const published = await seed(url, 'Стенд');
    expect(published).toHaveLength(sampleWorlds().length);

    const worlds = await fetch(`${url}/worlds`).then(r => r.json());
    const titles = worlds.map((w: { title: string }) => w.title);
    for (const { title } of sampleWorlds()) expect(titles).toContain(title);

    for (const w of worlds) expect(w.sheetCount).toBeGreaterThan(1);
  });

  it('повторный запуск обновляет образцы на месте и ничего не дублирует', async () => {
    const again = await seed(url, 'Стенд');
    expect(again).toHaveLength(sampleWorlds().length);
    const worlds = await fetch(`${url}/worlds`).then(r => r.json());
    expect(worlds).toHaveLength(sampleWorlds().length);
    const systems = await fetch(`${url}/systems`).then(r => r.json());
    expect(systems).toHaveLength(sampleWorlds().length);
  });

  it('обновить мир может только его автор', async () => {
    const [world] = await fetch(`${url}/worlds`).then(r => r.json()) as { id: string; title: string }[];
    const login = await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Чужой' }) }).then(r => r.json()) as { token: string };
    const res = await fetch(`${url}/worlds/${world!.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ title: 'захват', systemId: 'x', compendiumIds: [], sheets: [] }),
    });
    expect(res.status).toBe(403);
  });
});
