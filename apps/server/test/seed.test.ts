import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  app = ref.createNestApplication();
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

    for (const w of worlds) expect(w.sheetCount).toBe(2);
  });

  it('повторный запуск ничего не дублирует', async () => {
    const again = await seed(url, 'Стенд');
    expect(again).toHaveLength(0);
    const worlds = await fetch(`${url}/worlds`).then(r => r.json());
    expect(worlds).toHaveLength(sampleWorlds().length);
  });
});
