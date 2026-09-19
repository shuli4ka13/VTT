import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import type { Database } from '../src/db/db.ts';
import { RoomsService } from '../src/rooms/rooms.service.ts';
// @ts-expect-error — образцы движка без деклараций.
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';

const { system: dnd, compendium, sheets } = SAMPLE_WORLDS[0];

let app: INestApplication;
let db: Database;
let idAt = 0;
let rollAt = 0;
const rolls = [18, 6, 4, 3, 5, 2, 1, 1, 1, 1];

beforeAll(async () => {
  db = openDatabase(':memory:');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.create({
      database: db,
      now: () => '2026-09-19T00:00:00.000Z',
      newId: () => `id-${++idAt}`,
      die: () => rolls[rollAt++ % rolls.length]!,
    })],
  }).compile();
  app = moduleRef.createNestApplication();
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
});

afterAll(async () => { await app.close(); db.close(); });

const http = () => request(app.getHttpServer());

async function table() {
  const token = (await http().post('/auth/login').send({ name: 'Ведущий' })).body.token as string;
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const me = (await as(http().get('/auth/me'))).body.userId as string;
  const systemId = (await as(http().post('/systems')).send({ title: '5e', system: dnd })).body.id;
  const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга', systemId, compendium })).body.id;
  await as(http().post(`/systems/${systemId}/publish`)).send({});
  await as(http().post(`/compendiums/${bookId}/publish`)).send({});
  const worldId = (await as(http().post('/worlds')).send({
    title: 'Мир', systemId, compendiumIds: [bookId],
    sheets: sheets.filter((s: { systemId: string }) => s.systemId === dnd.id),
  })).body.id;
  const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол' })).body.id as string;
  const state = (await as(http().get(`/rooms/${roomId}`))).body;
  const [arven, mirra] = state.sheets;
  return { as, me, roomId, arven, mirra, rooms: app.get(RoomsService) };
}

describe('часы и бюджет действий не портятся', () => {
  it('ход и сцену нельзя двигать, пока стол ждёт ответа на реакцию', async () => {
    const { as, me, roomId, arven, mirra, rooms } = await table();
    await rooms.setValue(me, roomId, arven.id, 'inspiration', 1);
    await rooms.setBelonging(me, roomId, arven.id, 'effects', 'inspire', true);
    await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'start', order: [arven.id, mirra.id] }).expect(201);

    const paused = await as(http().post(`/rooms/${roomId}/act`))
      .send({ roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id }).expect(201);
    expect(paused.body.pending).toBeTruthy();

    for (const op of ['next', 'stop', 'scene']) {
      const denied = await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op }).expect(400);
      expect(denied.body.message).toContain('ждёт ответа');
    }

    await as(http().post(`/rooms/${roomId}/answer`))
      .send({ roomId, pendingId: paused.body.pending.id, chosen: [] }).expect(201);
    const stepped = await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'next' }).expect(201);
    expect(stepped.body.clock.active).toBe(mirra.id);
  });

  it('действие, упавшее с ошибкой уже на стороне цели, не сгорает из бюджета хода', async () => {
    const { as, roomId, arven, mirra } = await table();
    await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'start', order: [mirra.id, arven.id] }).expect(201);

    const spray = { roomId, actionId: 'poison-spray:0', fromId: mirra.id, toId: arven.id };
    const broken = await as(http().post(`/rooms/${roomId}/act`))
      .send({ ...spray, targetEdits: ['нет_такой_правки'] })
      .expect(400);
    expect(broken.body.message).toContain('нет_такой_правки');

    const state = (await as(http().get(`/rooms/${roomId}`))).body;
    expect(state.clock.spent[mirra.id]?.action ?? 0).toBe(0);

    await as(http().post(`/rooms/${roomId}/act`)).send(spray).expect(201);
    const denied = await as(http().post(`/rooms/${roomId}/act`)).send(spray).expect(400);
    expect(denied.body.message).toContain('потрачено');
  });
});

describe('пробный расчёт и итог бросают одни кости', () => {
  it('спасбросок цели в предпросмотре совпадает со спасброском в журнале', async () => {
    const guarded = {
      ...dnd,
      effects: {
        ...dnd.effects,
        watch: { label: 'Настороже', activation: 'reaction', duration: { kind: 'permanent' }, params: [], steps: [], trigger: { on: '*', window: 'target' } },
      },
    };
    const token = (await http().post('/auth/login').send({ name: 'Страж' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const me = (await as(http().get('/auth/me'))).body.userId as string;
    const systemId = (await as(http().post('/systems')).send({ title: '5e+', system: guarded })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга', systemId, compendium })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({});
    await as(http().post(`/compendiums/${bookId}/publish`)).send({});
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир', systemId, compendiumIds: [bookId],
      sheets: sheets.filter((s: { systemId: string }) => s.systemId === dnd.id),
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол' })).body.id as string;
    const [arven, mirra] = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    await app.get(RoomsService).setBelonging(me, roomId, arven.id, 'effects', 'watch', true);

    const paused = await as(http().post(`/rooms/${roomId}/act`))
      .send({ roomId, actionId: 'poison-spray:0', fromId: mirra.id, toId: arven.id }).expect(201);
    expect(paused.body.pending?.sheetId).toBe(arven.id);
    const previewed = paused.body.pending.preview.join(' · ');
    const rolled = previewed.match(/бросок цели \[([^\]]+)\]/);
    expect(rolled, previewed).toBeTruthy();

    const answered = await as(http().post(`/rooms/${roomId}/answer`))
      .send({ roomId, pendingId: paused.body.pending.id, chosen: [] }).expect(201);
    const journal = answered.body.log.map((l: { text: string }) => l.text).join(' · ');
    expect(journal).toContain(`[${rolled![1]}]`);
  });
});
