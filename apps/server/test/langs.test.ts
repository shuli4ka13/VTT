import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { localized, localizedBook } from '@vtt/engine';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import type { Database } from '../src/db/db.ts';
import { sliceWorld } from './slice.ts';

const { system: dnd, compendium, sheets } = sliceWorld();

let app: INestApplication;
let db: Database;
let http: () => request.Agent;
let idAt = 0;

beforeAll(async () => {
  db = openDatabase(':memory:');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.create({
      database: db,
      now: () => '2026-08-10T00:00:00.000Z',
      newId: () => `id-${++idAt}`,
      die: () => 10,
    })],
  }).compile();
  app = moduleRef.createNestApplication({ bodyParser: false });
  allowBigWorlds(app);
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  await app.listen(0, '127.0.0.1');
  http = () => request(app.getHttpServer());
});

afterAll(async () => {
  await app.close();
  db.close();
});

const login = async (name: string): Promise<string> => (await http().post('/auth/login').send({ name }).expect(201)).body.token;
const as = (token: string) => (call: request.Test) => call.set('Authorization', `Bearer ${token}`);

describe('переводы подписей доходят до игрока', () => {
  it('система с языками и переводами публикуется, комната отдаёт их игроку — он видит лист и книгу на своём языке', async () => {
    const author = await login('Автор');
    const player = await login('Игрок');

    const system = structuredClone(dnd);
    system.langs = ['ru', 'en'];
    const [tableId, table] = Object.entries(system.tables as Record<string, { columns?: { key: string; label?: string; i18n?: unknown }[] }>)
      .find(([, one]) => one.columns?.some(column => column.label))!;
    const column = table.columns!.find(one => one.label)!;
    column.i18n = { en: { label: 'Translated field' } };
    const book = structuredClone(compendium);
    const record = book.records.find((one: { label?: string }) => one.label)!;
    record.i18n = { en: { label: 'Translated record' } };

    const systemId = (await as(author)(http().post('/systems')).send({ title: 'С переводом', system }).expect(201)).body.id;
    const bookId = (await as(author)(http().post('/compendiums')).send({ title: 'Книга', systemId, compendium: book }).expect(201)).body.id;
    await as(author)(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(author)(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(author)(http().post('/worlds')).send({
      title: 'Мир с переводом', systemId, compendiumIds: [bookId], sheets: sheets.filter((one: { systemId: string }) => one.systemId === dnd.id),
    }).expect(201)).body.id;
    const roomId = (await as(author)(http().post('/rooms')).send({ worldId, title: 'Стол' }).expect(201)).body.id;
    await as(player)(http().post(`/rooms/${roomId}/join`)).send({});

    const room = (await as(player)(http().get(`/rooms/${roomId}`)).expect(200)).body;
    expect(room.system.langs).toEqual(['ru', 'en']);
    const got = room.system.tables[tableId].columns.find((one: { key: string }) => one.key === column.key);
    expect(got.label).toBe(column.label);
    expect(got.i18n).toEqual({ en: { label: 'Translated field' } });

    const shown = localized(room.system, 'en');
    expect((shown.tables as Record<string, { columns: { key: string; label: string }[] }>)[tableId]!.columns.find(one => one.key === column.key)!.label).toBe('Translated field');
    const shownBook = localizedBook(room.compendium, room.system, 'en');
    expect(shownBook.records.find((one: { id: string }) => one.id === record.id).label).toBe('Translated record');
    expect(localized(room.system, 'ru')).toBe(room.system);
  });
});

describe('ответы сервера — на языке запроса', () => {
  const SPOKEN = /[Ѐ-ӿ]/u;

  it('отказ без языка — по-русски, с «Accept-Language: en» — по-английски', async () => {
    const author = await login('Автор отказа');
    const plain = await as(author)(http().get('/systems/nope')).expect(404);
    expect(plain.body.message).toBe('системы «nope» нет');
    const english = await as(author)(http().get('/systems/nope')).set('Accept-Language', 'en-US,en;q=0.9').expect(404);
    expect(english.body.message).toBe('there is no system “nope”');
  });

  it('проверка входа тоже говорит на языке запроса', async () => {
    const english = await http().post('/systems').set('Accept-Language', 'en').send({ title: 'x', system: dnd }).expect(401);
    expect(english.body.message).toBe('a session token is required');
    const plain = await http().post('/systems').send({ title: 'x', system: dnd }).expect(401);
    expect(SPOKEN.test(plain.body.message)).toBe(true);
  });

  it('отказ публикации несёт код и «Проблемы» на языке запроса', async () => {
    const author = await login('Автор с ошибкой');
    const system = structuredClone(dnd);
    const [effectId] = Object.keys(system.effects);
    system.effects[effectId].steps = [{ type: 'apply', target: { expr: '@nobody.nothing' }, value: { expr: '1' } }];
    const systemId = (await as(author)(http().post('/systems')).send({ title: 'С ошибкой', system }).expect(201)).body.id;
    const plain = await as(author)(http().post(`/systems/${systemId}/publish`)).send({}).expect(400);
    expect(plain.body.code).toBe('not-ready');
    expect(plain.body.message).toMatch(/^система не готова к публикации: /);
    expect(plain.body.issues.length).toBeGreaterThan(0);
    const english = await as(author)(http().post(`/systems/${systemId}/publish`)).set('Accept-Language', 'en').send({}).expect(400);
    expect(english.body.code).toBe('not-ready');
    expect(english.body.message).toMatch(/^the system is not ready to publish: \d+ errors? — see “Problems”$/);
    expect(english.body.issues.length).toBe(plain.body.issues.length);
  });
});
