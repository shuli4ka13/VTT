import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import type { Database } from '../src/db/db.ts';
import { RoomsService } from '../src/rooms/rooms.service.ts';

const system = {
  id: 'стол', name: 'стол',
  tables: { лист: { shape: 'single', columns: [
    { key: 'хп', label: 'Хиты', kind: 'number', default: 20 },
  ] }, стол: { shape: 'single', owner: 'desk', columns: [
    { key: 'страх', label: 'Страх', kind: 'number' },
  ] } , приём: { shape: 'book', use: 'action', label: 'Приём', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      steps: [
        { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '2 + @стол.страх' } },
        { type: 'apply', target: { tag: 'страх' }, direction: 'add', targetModifiers: false, value: { expr: '1' } },
      ],
    },
  },
  
};
const compendium = { records: [{ id: 'удар', table: 'приём', label: 'Удар', cells: {} }] };
const pc = (id: string) => ({ id, systemId: 'стол', name: id, values: {}, has: [{ of: 'удар' }], effects: [] });

let app: INestApplication;
let db: Database;
let idAt = 0;

beforeAll(async () => {
  db = openDatabase(':memory:');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.create({ database: db, now: () => '2026-09-23T00:00:00.000Z', newId: () => `id-${++idAt}`, die: () => 1 })],
  }).compile();
  app = moduleRef.createNestApplication({ bodyParser: false });
  allowBigWorlds(app);
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  await app.listen(0, '127.0.0.1');
});

afterAll(async () => { await app.close(); db.close(); });

const http = () => request(app.getHttpServer());

describe('стол комнаты', () => {
  it('у системы с полями стола комната получает лист стола, удар читает и меняет его', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const systemId = (await as(http().post('/systems')).send({ title: 'стол', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга', systemId, compendium })).body.id;
    const pub = await as(http().post(`/systems/${systemId}/publish`)).send({});
    if (pub.status !== 201) throw new Error(JSON.stringify(pub.body));
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).then(r => { if (r.status !== 201) throw new Error(JSON.stringify(r.body)); });
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир', systemId, compendiumIds: [bookId], sheets: [pc('бьёт'), pc('держит')],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол' })).body.id as string;

    const before = (await as(http().get(`/rooms/${roomId}`))).body;
    const desk = before.sheets.find((s: { id: string }) => s.id === 'стол');
    expect(desk?.name).toBe('Стол');

    await as(http().post(`/rooms/${roomId}/act`)).send({ roomId, actionId: 'удар:0', fromId: 'бьёт', toId: 'держит' }).then(r => { if (r.status !== 201) throw new Error(JSON.stringify(r.body)); });
    await as(http().post(`/rooms/${roomId}/act`)).send({ roomId, actionId: 'удар:0', fromId: 'бьёт', toId: 'держит' }).then(r => { if (r.status !== 201) throw new Error(JSON.stringify(r.body)); });

    const after = (await as(http().get(`/rooms/${roomId}`))).body;
    expect(after.sheets.find((s: { id: string }) => s.id === 'стол').values.страх).toBe(2);
    expect(after.sheets.find((s: { id: string }) => s.id === 'держит').values.хп).toBe(20 - 2 - 3);
  });
});

describe('стол нельзя закрепить за игроком', () => {
  it('закрепить стол — отказ словами', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Игрок' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const systemId = (await as(http().post('/systems')).send({ title: 'стол', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга', systemId, compendium })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({});
    await as(http().post(`/compendiums/${bookId}/publish`)).send({});
    const worldId = (await as(http().post('/worlds')).send({ title: 'Мир', systemId, compendiumIds: [bookId], sheets: [pc('бьёт')] })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол' })).body.id as string;
    const rooms = app.get(RoomsService);
    const me = (await as(http().get('/auth/me'))).body.userId as string;
    await expect(rooms.claimSheet(me, roomId, 'стол')).rejects.toThrow(/стол общий/);
  });
});

describe('система без компендиума доходит до игры', () => {
  it('кнопка, выданная всем, жмётся за столом, а встроенные записи едут в мир', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Автор' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const own = { ...system, grants: ['удар'], library: [{ id: 'меч', table: 'приём', label: 'Меч', cells: {} }] };
    const systemId = (await as(http().post('/systems')).send({ title: 'сама', system: own })).body.id;
    const pub = await as(http().post(`/systems/${systemId}/publish`)).send({});
    if (pub.status !== 201) throw new Error(JSON.stringify(pub.body));
    const bare = (id: string) => ({ id, systemId: 'стол', name: id, values: {}, has: [], effects: [] });
    const worldId = (await as(http().post('/worlds')).send({ title: 'Мир', systemId, compendiumIds: [], sheets: [bare('бьёт'), bare('держит')] })).body.id;

    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол' })).body.id as string;
    const room = (await as(http().get(`/rooms/${roomId}`))).body;
    expect(room.compendium.records.map((r: { id: string }) => r.id)).toEqual(['меч']);
    const act = await as(http().post(`/rooms/${roomId}/act`)).send({ roomId, actionId: '+удар', fromId: 'бьёт', toId: 'держит' });
    if (act.status !== 201) throw new Error(JSON.stringify(act.body));
    const after = (await as(http().get(`/rooms/${roomId}`))).body;
    expect(after.sheets.find((s: { id: string }) => s.id === 'держит').values.хп).toBe(18);
  });
});
