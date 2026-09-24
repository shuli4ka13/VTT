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
  fields: [
    { tag: 'хп', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
    { tag: 'страх', label: 'Страх', desk: true, value: { kind: 'stored', type: 'number', default: 0 } },
  ],
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      steps: [
        { type: 'apply', target: { tag: 'хп' }, direction: 'subtract', targetModifiers: false, value: { expr: '2 + @стол.страх' } },
        { type: 'apply', target: { tag: 'страх' }, direction: 'add', targetModifiers: false, value: { expr: '1' } },
      ],
    },
  },
  records: { приём: { kind: 'action', label: 'Приём', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
};
const compendium = { records: [{ id: 'удар', rk: 'приём', label: 'Удар', props: {} }] };
const pc = (id: string) => ({ id, systemId: 'стол', kind: 'pc', name: id, values: {}, has: [{ of: 'удар' }], effects: [] });

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
    const desk = before.sheets.find((s: { kind: string }) => s.kind === 'desk');
    expect(desk?.name).toBe('Стол');

    await as(http().post(`/rooms/${roomId}/act`)).send({ roomId, actionId: 'удар:0', fromId: 'бьёт', toId: 'держит' }).then(r => { if (r.status !== 201) throw new Error(JSON.stringify(r.body)); });
    await as(http().post(`/rooms/${roomId}/act`)).send({ roomId, actionId: 'удар:0', fromId: 'бьёт', toId: 'держит' }).then(r => { if (r.status !== 201) throw new Error(JSON.stringify(r.body)); });

    const after = (await as(http().get(`/rooms/${roomId}`))).body;
    expect(after.sheets.find((s: { kind: string }) => s.kind === 'desk').values.страх).toBe(2);
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
