import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import { RoomsService } from '../src/rooms/rooms.service.ts';

const system = {
  id: 'с', name: 'с', effects: {},
  tables: {
    лист: { shape: 'single', columns: [
      { key: 'настроено', label: 'Настроено', expr: { expr: 'сколько(строки("вещь", "настройка"), да)' }, max: 3 },
    ] },
    вещь: { shape: 'book', use: 'item', label: 'Вещь', columns: [{ key: 'настройка', label: 'Требует настройки', kind: 'boolean' }] },
  },
};
const ring = (id: string) => ({ id, table: 'вещь', label: `Кольцо ${id}`, cells: { настройка: true } });
const compendium = { records: ['а', 'б', 'в', 'г'].map(ring) };

describe('ограничение листа проверяет сервер', () => {
  it('четвёртое кольцо не надеть — отказ словами, лист и журнал не тронуты; снять можно', async () => {
    const db = openDatabase(':memory:');
    let idAt = 0;
    const ref = await Test.createTestingModule({
      imports: [AppModule.create({ database: db, now: () => '2026-09-30T00:00:00.000Z', newId: () => `id-${++idAt}`, die: () => 1 })],
    }).compile();
    const app = ref.createNestApplication({ bodyParser: false });
    allowBigWorlds(app);
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.init();
    await app.listen(0, '127.0.0.1');
    const http = () => request(app.getHttpServer());
    const login = await http().post('/auth/login').send({ name: 'Ведущий' });
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${login.body.token}`);
    const ok = async (r: request.Test) => { const res = await as(r); if (res.status >= 300) throw new Error(JSON.stringify(res.body)); return res.body; };
    const systemId = (await ok(http().post('/systems').send({ title: 'с', system }))).id;
    const bookId = (await ok(http().post('/compendiums').send({ title: 'Книга', systemId, compendium }))).id;
    await ok(http().post(`/systems/${systemId}/publish`).send({}));
    await ok(http().post(`/compendiums/${bookId}/publish`).send({}));
    const hero = { id: 'маг', systemId: 'с', name: 'Маг', values: {}, has: [{ of: 'а' }, { of: 'б' }, { of: 'в' }], effects: [] };
    const worldId = (await ok(http().post('/worlds').send({ title: 'Мир', systemId, compendiumIds: [bookId], sheets: [hero] }))).id;
    const roomId = (await ok(http().post('/rooms').send({ worldId, title: 'Стол' }))).id as string;
    const rooms = app.get(RoomsService);
    const me = login.body.userId as string;

    await expect(rooms.setBelonging(me, roomId, 'маг', 'has', 'г', true)).rejects.toThrow('«Настроено»: 4 — больше 3');
    const state = await ok(http().get(`/rooms/${roomId}`));
    expect(state.sheets.find((s: { id: string }) => s.id === 'маг').has.map((h: { of: string }) => h.of)).toEqual(['а', 'б', 'в']);
    expect(await ok(http().get(`/rooms/${roomId}/journal`))).toEqual([]);

    await rooms.setBelonging(me, roomId, 'маг', 'has', 'в', false);
    await rooms.setBelonging(me, roomId, 'маг', 'has', 'г', true);
    const after = await ok(http().get(`/rooms/${roomId}`));
    expect(after.sheets.find((s: { id: string }) => s.id === 'маг').has.map((h: { of: string }) => h.of)).toEqual(['а', 'б', 'г']);
    await app.close();
    db.close();
  });
});
