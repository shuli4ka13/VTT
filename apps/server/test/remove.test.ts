import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import type { Database } from '../src/db/db.ts';
import { RoomsService } from '../src/rooms/rooms.service.ts';

const system = {
  id: 'уборка', name: 'уборка', grid: { step: 2, unit: 'м' },
  tables: {
    лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 20 }] },
    стол: { shape: 'single', owner: 'desk', columns: [{ key: 'страх', label: 'Страх', kind: 'number' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [{ type: 'each', of: 'цели' }, { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '2' } }],
    },
  },
};
const compendium = { records: [{ id: 'удар', table: 'приём', label: 'Удар', cells: {} }] };
const pc = (id: string, group?: string) => ({ id, systemId: 'уборка', name: id, values: {}, has: [{ of: 'удар' }], effects: [], ...(group ? { group } : {}) });

const ROOM_TABLES = ['room_sheets', 'room_clocks', 'room_places', 'room_pending', 'room_journal', 'members', 'log_entries'];

let app: INestApplication;
let db: Database;
let idAt = 0;

beforeAll(async () => {
  db = openDatabase(':memory:');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.create({ database: db, now: () => '2026-11-11T00:00:00.000Z', newId: () => `id-${++idAt}`, die: () => 1 })],
  }).compile();
  app = moduleRef.createNestApplication({ bodyParser: false });
  allowBigWorlds(app);
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  await app.listen(0, '127.0.0.1');
});

afterAll(async () => { await app.close(); db.close(); });

const http = () => request(app.getHttpServer());
const login = async (name: string) => {
  const body = (await http().post('/auth/login').send({ name })).body as { token: string; userId: string };
  return { ...body, as: (r: request.Test) => r.set('Authorization', `Bearer ${body.token}`) };
};
const rows = (table: string, roomId: string) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE room_id = ?`).get(roomId) as { n: number }).n;
const status = (err: unknown) => (err instanceof HttpException ? err.getStatus() : 0);
const refused = async (work: Promise<unknown>) => { try { await work; return 0; } catch (err) { return status(err); } };
const hang = (roomId: string, sheetId: string) => db.raw.prepare('INSERT INTO room_pending (id, room_id, data) VALUES (?, ?, ?)')
  .run(`ждёт-${roomId}`, roomId, JSON.stringify({ question: { sheetId, offers: [], window: 'target', key: 'к' }, hidden: false }));

async function world(gm: Awaited<ReturnType<typeof login>>, sheets: unknown[]) {
  const systemId = (await gm.as(http().post('/systems')).send({ title: 'уборка', system })).body.id;
  const bookId = (await gm.as(http().post('/compendiums')).send({ title: 'Книга', systemId, compendium })).body.id;
  await gm.as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
  await gm.as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
  return (await gm.as(http().post('/worlds')).send({ title: 'Мир', systemId, compendiumIds: [bookId], sheets })).body.id as string;
}

describe('удаление стола и листа', () => {
  it('стол убирает только ведущий — вместе с листами, журналом, часами, вопросом и участниками; соседний стол цел', async () => {
    const gm = await login('Ведущий-1');
    const player = await login('Игрок-1');
    const stranger = await login('Чужой-1');
    const worldId = await world(gm, [pc('а'), pc('б')]);
    const roomId = (await gm.as(http().post('/rooms')).send({ worldId, title: 'Мусор' })).body.id as string;
    const keepId = (await gm.as(http().post('/rooms')).send({ worldId, title: 'Нужный' })).body.id as string;
    await player.as(http().post(`/rooms/${roomId}/join`)).send({}).expect(201);
    await gm.as(http().post(`/rooms/${roomId}/act`)).send({ roomId, actionId: 'удар:0', fromId: 'а', toIds: ['б'] }).expect(201);
    await gm.as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'start', order: ['а', 'б'] }).expect(201);
    await gm.as(http().post(`/rooms/${keepId}/act`)).send({ roomId: keepId, actionId: 'удар:0', fromId: 'а', toIds: ['б'] }).expect(201);
    await app.get(RoomsService).placePiece(gm.userId, roomId, 'а', { x: 1, y: 1 });
    hang(roomId, 'б');
    for (const table of ROOM_TABLES) expect(rows(table, roomId), table).toBeGreaterThan(0);

    const listed = (await player.as(http().get('/rooms'))).body as { id: string; gm: boolean; gmName: string }[];
    expect(listed.find(room => room.id === roomId)).toMatchObject({ gm: false, gmName: 'Ведущий-1' });
    expect((await gm.as(http().get('/rooms'))).body.find((room: { id: string }) => room.id === roomId).gm).toBe(true);

    await player.as(http().delete(`/rooms/${roomId}`)).expect(403);
    await stranger.as(http().delete(`/rooms/${roomId}`)).expect(403);
    await gm.as(http().delete(`/rooms/${roomId}`)).expect(200);

    for (const table of ROOM_TABLES) expect(rows(table, roomId), table).toBe(0);
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM rooms WHERE id = ?').get(roomId) as { n: number }).n).toBe(0);
    await gm.as(http().get(`/rooms/${roomId}`)).expect(404);
    for (const table of ['room_sheets', 'room_journal', 'members', 'log_entries']) expect(rows(table, keepId), table).toBeGreaterThan(0);
    expect((await gm.as(http().get('/rooms'))).body.map((room: { id: string }) => room.id)).not.toContain(roomId);
  });

  it('лист убирает ведущий или тот, кто им играет; стол комнаты не убирается; бой, группа и место игрока чистятся', async () => {
    const gm = await login('Ведущий-2');
    const player = await login('Игрок-2');
    const worldId = await world(gm, [pc('а'), pc('б', 'отряд'), pc('в'), pc('отряд')]);
    const roomId = (await gm.as(http().post('/rooms')).send({ worldId, title: 'Лагерь' })).body.id as string;
    await player.as(http().post(`/rooms/${roomId}/join`)).send({}).expect(201);
    const rooms = app.get(RoomsService);
    await rooms.claimSheet(player.userId, roomId, 'в');
    await rooms.turn(gm.userId, { roomId, op: 'start', order: ['а', 'б', 'в'] });

    expect(await refused(rooms.dropSheet(player.userId, roomId, 'а'))).toBe(403);
    expect(await refused(rooms.dropSheet(gm.userId, roomId, 'стол'))).toBe(400);

    await rooms.placePiece(gm.userId, roomId, 'а', { x: 2, y: 3 });
    const dropped = await rooms.dropSheet(gm.userId, roomId, 'а');
    expect(dropped.gone).toEqual(['а']);
    expect((await rooms.state(roomId)).places).toEqual({});
    expect(await rooms.placePiece(gm.userId, roomId, 'б', { x: 2, y: 3 })).toEqual({ б: { x: 2, y: 3 } });
    expect(dropped.clock).toMatchObject({ order: ['б', 'в'], active: 'б' });
    await rooms.dropSheet(gm.userId, roomId, 'отряд');
    let state = await rooms.state(roomId);
    expect(state.sheets.find(sheet => sheet.id === 'б')?.group).toBeUndefined();
    expect(state.log.map(entry => entry.text)).toEqual(expect.arrayContaining(['Лист «а» убран', 'Лист «отряд» убран']));

    hang(roomId, 'б');
    expect(await refused(rooms.dropSheet(gm.userId, roomId, 'б'))).toBe(400);
    db.raw.prepare('DELETE FROM room_pending WHERE room_id = ?').run(roomId);

    await rooms.dropSheet(player.userId, roomId, 'в');
    state = await rooms.state(roomId);
    expect(state.sheets.map(sheet => sheet.id).sort()).toEqual(['б', 'стол']);
    expect(state.members.find(member => member.userId === player.userId)?.sheetId).toBeNull();
    expect(state.clock).toMatchObject({ order: ['б'] });
    expect((await rooms.journal(gm.userId, roomId)).filter(entry => entry.op === 'drop').map(entry => entry.input)).toEqual([
      { sheetId: 'а' }, { sheetId: 'отряд' }, { sheetId: 'в' },
    ]);
  });
});
