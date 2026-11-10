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
      params: [{ key: 'действующий', kind: 'sheet' }, { key: 'цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [
        { type: 'each', of: 'цели' },
        { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '2 + @стол.страх' } },
        { type: 'apply', target: { expr: '@стол.страх' }, direction: 'add', value: { expr: '1' } },
      ],
    },
  },
  
};
const gridded = { ...system, id: 'поле', name: 'поле', grid: { step: 2, unit: 'м' } };
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

    await as(http().post(`/rooms/${roomId}/act`)).send({ roomId, actionId: 'удар:0', fromId: 'бьёт', toIds: ['держит'] }).then(r => { if (r.status !== 201) throw new Error(JSON.stringify(r.body)); });
    await as(http().post(`/rooms/${roomId}/act`)).send({ roomId, actionId: 'удар:0', fromId: 'бьёт', toIds: ['держит'] }).then(r => { if (r.status !== 201) throw new Error(JSON.stringify(r.body)); });

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
    const act = await as(http().post(`/rooms/${roomId}/act`)).send({ roomId, actionId: '+удар', fromId: 'бьёт', toIds: ['держит'] });
    if (act.status !== 201) throw new Error(JSON.stringify(act.body));
    const after = (await as(http().get(`/rooms/${roomId}`))).body;
    expect(after.sheets.find((s: { id: string }) => s.id === 'держит').values.хп).toBe(18);
  });
});

describe('поле: место фишки', () => {
  it('ведущий ставит фишку, клетка занята — отказ, игрок двигает только свой лист, без сетки — отказ', async () => {
    const login = async (name: string) => (await http().post('/auth/login').send({ name })).body as { token: string; userId: string };
    const gm = await login('Ведущий поля');
    const player = await login('Игрок поля');
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${gm.token}`);
    const make = async (sys: typeof system) => {
      const systemId = (await as(http().post('/systems')).send({ title: sys.name, system: sys })).body.id;
      await as(http().post(`/systems/${systemId}/publish`)).send({});
      const worldId = (await as(http().post('/worlds')).send({ title: 'Мир', systemId, compendiumIds: [], sheets: [pc('арен'), pc('бора')] })).body.id;
      return (await as(http().post('/rooms')).send({ worldId, title: 'Поле' })).body.id as string;
    };
    const rooms = app.get(RoomsService);
    const roomId = await make(gridded);

    expect(await rooms.placePiece(gm.userId, roomId, 'арен', { x: 1, y: 2 })).toEqual({ арен: { x: 1, y: 2 } });
    await expect(rooms.placePiece(gm.userId, roomId, 'бора', { x: 1, y: 2 })).rejects.toThrow('клетка занята');
    await rooms.placePiece(gm.userId, roomId, 'бора', { x: 4, y: 2 });
    expect((await rooms.state(roomId)).places).toEqual({ арен: { x: 1, y: 2 }, бора: { x: 4, y: 2 } });

    await rooms.join(player.userId, roomId);
    await expect(rooms.placePiece(player.userId, roomId, 'арен', { x: 0, y: 0 })).rejects.toThrow('выберите своего персонажа');
    await rooms.claimSheet(player.userId, roomId, 'бора');
    await expect(rooms.placePiece(player.userId, roomId, 'арен', { x: 0, y: 0 })).rejects.toThrow('чужая фишка');
    await rooms.placePiece(player.userId, roomId, 'бора', null);
    expect((await rooms.state(roomId)).places).toEqual({ арен: { x: 1, y: 2 } });
    await expect(rooms.placePiece(gm.userId, roomId, 'стол', { x: 0, y: 0 })).rejects.toThrow('не стоят');

    const plain = await make({ ...system, id: 'без поля', name: 'без поля' });
    await expect(rooms.placePiece(gm.userId, plain, 'арен', { x: 0, y: 0 })).rejects.toThrow('нет сетки');
  });
});
