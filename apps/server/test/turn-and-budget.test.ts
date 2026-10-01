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
import { sliceWorld } from './slice.ts';

const { system: dnd, compendium, sheets } = sliceWorld();

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
  app = moduleRef.createNestApplication({ bodyParser: false });
  allowBigWorlds(app);
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  await app.listen(0, '127.0.0.1');
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

describe('часы и траты хода не портятся', () => {
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

  it('действие, упавшее с ошибкой уже на стороне цели, не тратит поле «Действие»', async () => {
    const { as, roomId, arven, mirra } = await table();
    await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'start', order: [mirra.id, arven.id] }).expect(201);

    const spray = { roomId, actionId: 'poison-spray:0', fromId: mirra.id, toId: arven.id };
    const broken = await as(http().post(`/rooms/${roomId}/act`))
      .send({ ...spray, targetEdits: ['нет_такой_правки'] })
      .expect(400);
    expect(broken.body.message).toContain('нет_такой_правки');

    const state = (await as(http().get(`/rooms/${roomId}`))).body;
    const desk = state.sheets.find((sheet: { id: string }) => sheet.id === 'стол');
    expect(desk.values.battle, 'начало боя отметило бой на столе').toBe(1);
    expect(state.sheets.find((sheet: { id: string }) => sheet.id === mirra.id).values.turn_action ?? 1, 'упавшее действие не потратило действие').toBe(1);

    const done = await as(http().post(`/rooms/${roomId}/act`)).send(spray).expect(201);
    if (done.body.pending) {
      await as(http().post(`/rooms/${roomId}/answer`))
        .send({ roomId, pendingId: done.body.pending.id, chosen: [] }).expect(201);
    }
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
        watch: { label: 'Настороже', activation: 'passive', duration: { kind: 'permanent' }, params: [], on: [{ on: 'targeted', confirm: true, steps: [] }] },
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

describe('публикация проверяет систему линтом', () => {
  it('подписка без «что случилось» — отказ человеческим текстом', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Автор' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const system = {
      name: 'Сломанная', tables: {},
      effects: { thorns: { label: 'Шипы', activation: 'passive', on: [{ on: '', to: 'other', steps: [] }] } },
    };
    const id = (await as(http().post('/systems')).send({ title: 'Сломанная', system })).body.id as string;
    const rejected = await as(http().post(`/systems/${id}/publish`)).send({}).expect(400);
    expect(rejected.body.message).toContain('1 ошибка');
    expect(rejected.body.issues[0]).toContain('Эффекты · эффект «Шипы»');
    expect(rejected.body.issues[0]).toContain('не сказано, когда срабатывает');

    await as(http().put(`/systems/${id}`)).send({
      title: 'Сломанная',
      system: { ...system, effects: { thorns: { ...system.effects.thorns, on: [{ on: 'affected', to: 'other', steps: [] }] } } },
    }).expect(200);
    await as(http().post(`/systems/${id}/publish`)).send({}).expect(201);
  });
});

describe('значение, которое называет человек за столом', () => {
  it('сервер принимает только объявленное и проверяет границы', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий вопросов' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const system = {
      id: 'ask', name: 'Со спросом',
      tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] } , ствол: { shape: 'book', use: 'action', label: 'Ствол', columns: [], bindings: [{ label: 'Выстрел', effect: 'выстрел', args: {} }] } },
      effects: {
        выстрел: {
          label: 'Выстрел', activation: 'manual',
          params: [{ key: 'дистанция', label: 'Дистанция', kind: 'number', ask: { by: 'actor', kind: 'number', min: 1, max: 50 } }],
          steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@дистанция' } }],
        },
      },
      
    };
    const book = { records: [{ id: 'ствол', table: 'ствол', label: 'Ствол', cells: {} }] };
    const sheet = (id: string) => ({
      id, systemId: 'ask', name: id, values: { хиты: 20 }, has: [{ of: 'ствол' }], effects: []
    });

    const systemId = (await as(http().post('/systems')).send({ title: 'Со спросом', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир', systemId, compendiumIds: [bookId], sheets: [sheet('а'), sheet('б')],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол' })).body.id as string;

    const act = (inputs?: Record<string, unknown>) => as(http().post(`/rooms/${roomId}/act`))
      .send({ roomId, actionId: 'ствол:0', fromId: 'а', toId: 'б', ...(inputs ? { inputs } : {}) });

    expect((await act().expect(400)).body.message).toContain('Дистанция');
    expect((await act({ дистанция: 0 }).expect(400)).body.message).toContain('не меньше 1');
    expect((await act({ дистанция: 99 }).expect(400)).body.message).toContain('не больше 50');
    expect((await act({ дистанция: 5, лишнее: 1 }).expect(400)).body.message).toContain('лишнее');

    const done = await act({ дистанция: 5 }).expect(201);
    expect(done.body.sheets.find((s: { id: string }) => s.id === 'б').values.хиты).toBe(15);
  });
});

describe('одно действие по нескольким целям', () => {
  it('число бросается один раз, пауза на второй цели не теряет остальных', async () => {
    const { as, roomId, arven, mirra, rooms } = await table();
    const state = (await as(http().get(`/rooms/${roomId}`))).body;
    const third = (await (async () => {
      await rooms.createSheet((await as(http().get('/auth/me'))).body.userId, roomId, 'Третий');
      return (await as(http().get(`/rooms/${roomId}`))).body.sheets.find((s: { name: string }) => s.name === 'Третий');
    })());
    expect(third, 'третий лист заведён').toBeTruthy();
    expect(state.sheets.length).toBeGreaterThan(1);

    const done = await as(http().post(`/rooms/${roomId}/act`)).send({
      roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id, toIds: [mirra.id, third.id],
    }).expect(201);

    const said = done.body.log.map((entry: { text: string }) => entry.text).join('\n');
    const hits = said.split('\n').filter((line: string) => line.includes('применяет'));
    expect(hits.length, said).toBe(2);
    expect(hits[0]).toContain(mirra.name);
    expect(hits[1]).toContain('Третий');
  });
});

describe('моменты хода', () => {
  it('яд срабатывает в начале хода того, на ком висит, и пишет строку журнала', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий яда' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const system = {
      id: 'яд', name: 'С ядом',
      tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] } },
      constants: { к20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
      initiative: { die: { constant: 'к20' } },
      effects: {
        отравление: {
          label: 'Отравление', activation: 'passive',
          duration: { kind: 'permanent' },
          on: [{ on: 'moment:turn-start', steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '3' } }] }],
        },
      },
    };
    const sheet = (id: string, worn: string[]) => ({
      id, systemId: 'яд', name: id, values: { хиты: 20 },
      has: [], effects: worn.map(effectId => ({ effectId })),
    });

    const systemId = (await as(http().post('/systems')).send({ title: 'С ядом', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Пусто', systemId, compendium: { records: [] } })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир яда', systemId, compendiumIds: [bookId],
      sheets: [sheet('травленый', ['отравление']), sheet('здоровый', [])],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол яда' })).body.id as string;

    const started = await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'start', order: ['травленый', 'здоровый'] }).expect(201);
    const first = started.body.sheets.find((s: { id: string }) => s.id === 'травленый');
    expect(first.values.хиты, 'в начале своего хода яд сработал').toBe(17);
    expect(started.body.log.map((e: { text: string }) => e.text).join(' ')).toContain('Отравление');

    const next = await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'next' }).expect(201);
    const healthy = next.body.sheets.find((s: { id: string }) => s.id === 'здоровый');
    expect(healthy?.values.хиты ?? 20, 'чужой ход яда не трогает').toBe(20);

    const again = await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'next' }).expect(201);
    const poisoned = again.body.sheets.find((s: { id: string }) => s.id === 'травленый');
    expect(poisoned.values.хиты, 'на следующем своём ходу — ещё раз').toBe(14);
  });
});

describe('ячейка тратится один раз на действие', () => {
  it('удар по трём целям списывает одну ячейку, а урон достаётся каждому', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий ячеек' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const system = {
      id: 'ячейки', name: 'С ячейками',
      tables: { лист: { shape: 'single', columns: [
        { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
        { key: 'ячейки', label: 'Ячейки', kind: 'number', default: 3, min: 0 },
        { key: 'целей', label: 'Целей', kind: 'number', default: 0 },
      ] } , свиток: { shape: 'book', use: 'action', label: 'Свиток', columns: [], bindings: [{ label: 'Огненный шар', effect: 'шар', args: {} }] } },
      effects: {
        шар: {
          label: 'Огненный шар', activation: 'manual',
          self: [{ type: 'apply', target: { tag: 'ячейки' }, direction: 'subtract', value: { expr: '1' } }],
          steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '5' } }],
        },
        счёт: {
          label: 'Счёт целей', activation: 'passive', duration: { kind: 'permanent' },
          on: [{ on: 'done', of: 'шар', steps: [{ type: 'apply', target: { tag: 'целей' }, direction: 'add', value: { expr: 'сколько(@цели.лист)' } }] }],
        },
      },
      
    };
    const book = { records: [{ id: 'свиток', table: 'свиток', label: 'Свиток', cells: {} }] };
    const sheet = (id: string) => ({
      id, systemId: 'ячейки', name: id, values: { хиты: 20, ячейки: 3 },
      has: [{ of: 'свиток' }], effects: id === 'маг' ? [{ effectId: 'счёт' }] : [],
    });

    const systemId = (await as(http().post('/systems')).send({ title: 'С ячейками', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга ячеек', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир ячеек', systemId, compendiumIds: [bookId],
      sheets: [sheet('маг'), sheet('а'), sheet('б'), sheet('в')],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол ячеек' })).body.id as string;

    const done = await as(http().post(`/rooms/${roomId}/act`)).send({
      roomId, actionId: 'свиток:0', fromId: 'маг', toId: 'а', toIds: ['а', 'б', 'в'],
    }).expect(201);

    const after = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    const of = (id: string) => after.find((s: { id: string }) => s.id === id).values;
    expect(of('маг').ячейки, 'одна ячейка на всё действие').toBe(2);
    expect(of('маг').целей, '«я совершил действие» — один раз, видит все три цели').toBe(3);
    expect([of('а').хиты, of('б').хиты, of('в').хиты]).toEqual([15, 15, 15]);
    expect(done.body.log.map((e: { text: string }) => e.text).join(' ')).toContain('Ячейки');
  });
});

describe('появилось и ушло с листа', () => {
  it('надели вещь — её эффект «при наложении»; сняли эффект кнопкой — слушатель «с меня ушло»', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий вещей' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const me = (await as(http().get('/auth/me'))).body.userId as string;

    const add = (tag: string) => ({ type: 'apply', target: { tag }, direction: 'add', value: { expr: '1' } });
    const system = {
      id: 'вещи', name: 'С вещами',
      tables: { лист: { shape: 'single', columns: [
        { key: 'надето', label: 'Надето', kind: 'number' },
        { key: 'снято', label: 'Снято', kind: 'number' },
      ] } , оружие: { shape: 'book', use: 'item', label: 'Оружие', columns: [], bindings: [] } },
      effects: {
        заточка: { label: 'Заточка', activation: 'passive', attach: [add('надето')] },
        бафф: { label: 'Бафф', activation: 'passive', duration: { kind: 'permanent' }, modifiers: [] },
        сторож: { label: 'Сторож', activation: 'passive', on: [{ on: 'lost:бафф', steps: [add('снято')] }] },
      },
      grants: ['сторож'],
      
    };
    const book = { records: [{ id: 'меч', table: 'оружие', label: 'Меч', cells: {}, grants: ['заточка'] }] };
    const sheet = { id: 'воин', systemId: 'вещи', name: 'Воин', values: {}, has: [], effects: [] };

    const systemId = (await as(http().post('/systems')).send({ title: 'С вещами', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга вещей', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир вещей', systemId, compendiumIds: [bookId], sheets: [sheet],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол вещей' })).body.id as string;
    const rooms = app.get(RoomsService);

    const worn = await rooms.setBelonging(me, roomId, 'воин', 'has', 'меч', true);
    expect(worn.sheets[0]!.values.надето, 'выданное вещью появилось').toBe(1);
    expect(worn.log.map(e => e.text).join(' ')).toContain('Заточка');

    await rooms.setBelonging(me, roomId, 'воин', 'effects', 'бафф', true);
    const shed = await rooms.setBelonging(me, roomId, 'воин', 'effects', 'бафф', false);
    expect(shed.sheets[0]!.values.снято, 'слушатель «с меня ушло» сработал').toBe(1);
    expect(shed.log.map(e => e.text).join(' ')).toContain('Сторож');
  });
});

describe('вопросы к человеку переживают пересборку броска', () => {
  it('реакция отправителя собирает конверт заново, и названное игроком число не теряется', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий вопросов' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const system = {
      id: 'вопросы', name: 'С вопросами',
      tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] } , приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
      constants: { к20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
      roll_edits: { плюс: { label: 'Плюс', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } },
      effects: {
        удар: {
          label: 'Удар', activation: 'manual',
          params: [{ key: 'сила', label: 'Сила', kind: 'number', ask: { by: 'actor', kind: 'number', min: 1, max: 10 } }],
          steps: [
            { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { expr: '0' }, continueOn: 'success' },
            { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '@сила' } },
          ],
        },
        вдохновение: {
          label: 'Вдохновение', activation: 'passive',
          on: [{ on: 'acting', confirm: true, claims: ['плюс'], steps: [] }],
        },
      },
      
    };
    const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] };
    const sheet = (id: string, worn: string[]) => ({
      id, systemId: 'вопросы', name: id, values: { хиты: 20 },
      has: [{ of: 'приём' }], effects: worn.map(effectId => ({ effectId })),
    });

    const systemId = (await as(http().post('/systems')).send({ title: 'С вопросами', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга вопросов', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир вопросов', systemId, compendiumIds: [bookId],
      sheets: [sheet('боец', ['вдохновение']), sheet('цель', [])],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол вопросов' })).body.id as string;

    const paused = await as(http().post(`/rooms/${roomId}/act`)).send({
      roomId, actionId: 'приём:0', fromId: 'боец', toId: 'цель', inputs: { сила: 7 },
    }).expect(201);
    expect(paused.body.pending?.options.map((o: { id: string }) => o.id)).toEqual(['вдохновение']);

    const answered = await as(http().post(`/rooms/${roomId}/answer`)).send({
      roomId, pendingId: paused.body.pending.id, chosen: ['вдохновение'],
    }).expect(201);
    expect(answered.body.log.map((e: { text: string }) => e.text).join(' ')).toContain('собран заново');

    const after = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    expect(after.find((s: { id: string }) => s.id === 'цель').values.хиты, 'названная сила дошла до цели').toBe(13);
  });
});

describe('цель правит свой бросок, увидев его', () => {
  it('заявленная целью правка меняет её спасбросок, а не только журнал', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий спасбросков' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const system = {
      id: 'спасение', name: 'Со спасброском',
      tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] } , приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Залп', effect: 'залп', args: {} }] } },
      constants: { к20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
      roll_edits: { удача: { label: 'Удача', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } },
      effects: {
        залп: {
          label: 'Залп', activation: 'manual',
          steps: [
            { id: 'спас', type: 'threshold', side: 'target', roll: { die: { constant: 'к20' } }, versus: { expr: '11' }, continueOn: 'fail' },
            { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '6' } },
          ],
        },
        везение: {
          label: 'Везение', activation: 'passive',
          on: [{ on: 'targeted', confirm: true, claims: ['удача'], steps: [] }],
        },
      },
      
    };
    const book = { records: [{ id: 'приём', table: 'приём', label: 'Залп', cells: {} }] };
    const sheet = (id: string, worn: string[]) => ({
      id, systemId: 'спасение', name: id, values: { хиты: 20 },
      has: [{ of: 'приём' }], effects: worn.map(effectId => ({ effectId })),
    });

    const systemId = (await as(http().post('/systems')).send({ title: 'Со спасброском', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга спасбросков', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир спасбросков', systemId, compendiumIds: [bookId],
      sheets: [sheet('стрелок', []), sheet('цель', ['везение'])],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол спасбросков' })).body.id as string;

    const paused = await as(http().post(`/rooms/${roomId}/act`)).send({
      roomId, actionId: 'приём:0', fromId: 'стрелок', toId: 'цель',
    }).expect(201);
    expect(paused.body.pending?.options.map((o: { id: string }) => o.id)).toEqual(['везение']);

    const answered = await as(http().post(`/rooms/${roomId}/answer`)).send({
      roomId, pendingId: paused.body.pending.id, chosen: ['везение'],
    }).expect(201);
    const сказано = answered.body.log.map((e: { text: string }) => e.text).join(' ');
    expect(сказано, сказано).toContain('пересчитан с заявленной правкой');
    expect(сказано, 'бросок сделан двумя костями').toMatch(/\[\d+, \d+\]/);
  });
});

describe('поле стало верным', () => {
  it('ведущий вписал ноль хитов — слушатель поля вешает состояние и пишет в журнал', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий порога' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const me = (await as(http().get('/auth/me'))).body.userId as string;

    const system = {
      id: 'порог', name: 'С порогом',
      tables: { лист: { shape: 'single', columns: [
        { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
        { key: 'без_сил', label: 'Без сил', expr: '#хиты <= 0' },
      ] } },
      effects: {
        без_сознания: { label: 'Без сознания', activation: 'passive', duration: { kind: 'permanent' }, modifiers: [] },
        падение: {
          label: 'Падение', activation: 'passive',
          on: [{ on: 'field:без_сил', steps: [{ type: 'status', mode: 'apply', effect: { const: 'без_сознания' } }] }],
        },
      },
      grants: ['падение'],
    };
    const sheet = { id: 'воин', systemId: 'порог', name: 'Воин', values: { хиты: 5 }, has: [], effects: [] };

    const systemId = (await as(http().post('/systems')).send({ title: 'С порогом', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Пусто', systemId, compendium: { records: [] } })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({ title: 'Мир порога', systemId, compendiumIds: [bookId], sheets: [sheet] })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол порога' })).body.id as string;
    const rooms = app.get(RoomsService);

    const still = await rooms.setValue(me, roomId, 'воин', 'хиты', 3);
    expect(still.sheets[0]!.effects).toEqual([]);
    expect(still.log).toEqual([]);

    const down = await rooms.setValue(me, roomId, 'воин', 'хиты', 0);
    expect(down.sheets[0]!.effects.map(e => e.effectId)).toEqual(['без_сознания']);
    expect(down.log.map(e => e.text).join(' ')).toContain('Падение');

    const lower = await rooms.setValue(me, roomId, 'воин', 'хиты', -2);
    expect(lower.log, 'порог уже был перейдён — второй раз не срабатывает').toEqual([]);
  });
});

describe('права за столом', () => {
  it('чужим закреплённым листом нельзя ходить, отвечать за него и менять его снаряжение', async () => {
    const { as, roomId, arven, mirra, rooms } = await table();
    const other = (await http().post('/auth/login').send({ name: 'Игрок-сосед' })).body;
    await http().post(`/rooms/${roomId}/join`).set('Authorization', `Bearer ${other.token}`).expect(201);
    await rooms.claimSheet(other.userId, roomId, mirra.id);
    const gm = (await as(http().get('/auth/me'))).body.userId as string;
    const owner = (await http().post('/auth/login').send({ name: 'Хозяйка Арвен' })).body;
    await http().post(`/rooms/${roomId}/join`).set('Authorization', `Bearer ${owner.token}`).expect(201);
    await rooms.claimSheet(owner.userId, roomId, arven.id);

    await expect(rooms.act(other.userId, { roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id }))
      .rejects.toThrow('чужой лист');
    await expect(rooms.setBelonging(other.userId, roomId, arven.id, 'has', 'chain-mail', false))
      .rejects.toThrow('чужой лист');

    await rooms.setValue(gm, roomId, arven.id, 'inspiration', 1);
    await rooms.setBelonging(gm, roomId, arven.id, 'effects', 'inspire', true);
    const paused = await rooms.act(owner.userId, { roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id });
    expect(paused.pending?.sheetId).toBe(arven.id);
    await expect(rooms.answer(other.userId, { roomId, pendingId: paused.pending!.id, chosen: [] }))
      .rejects.toThrow('чужой лист');
    const answered = await rooms.answer(gm, { roomId, pendingId: paused.pending!.id, chosen: [] });
    expect(answered.pending).toBeNull();
  });
});

describe('два сообщения стола сразу', () => {
  it('одновременные действия по одной цели не теряют друг друга', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий гонки' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const me = (await as(http().get('/auth/me'))).body.userId as string;

    const system = {
      id: 'гонка', name: 'Гонка',
      tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] } , приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
      effects: { удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '5' } }] } },
      
    };
    const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] };
    const sheet = (id: string) => ({ id, systemId: 'гонка', name: id, values: { хиты: 20 }, has: [{ of: 'приём' }], effects: [] });

    const systemId = (await as(http().post('/systems')).send({ title: 'Гонка', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга гонки', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({ title: 'Мир гонки', systemId, compendiumIds: [bookId], sheets: [sheet('а'), sheet('б')] })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол гонки' })).body.id as string;
    const rooms = app.get(RoomsService);

    await Promise.all([
      rooms.act(me, { roomId, actionId: 'приём:0', fromId: 'а', toId: 'б' }),
      rooms.act(me, { roomId, actionId: 'приём:0', fromId: 'а', toId: 'б' }),
      rooms.setValue(me, roomId, 'а', 'хиты', 11),
    ]);
    const after = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    expect(after.find((s: { id: string }) => s.id === 'б').values.хиты, 'оба удара дошли').toBe(10);
    expect(after.find((s: { id: string }) => s.id === 'а').values.хиты).toBe(11);
  });
});

describe('цепочка ответок', () => {
  it('шипы против шипов идут до предела, и журнал говорит, что цепочка оборвана', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий шипов' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const system = {
      id: 'шипы', name: 'С шипами',
      tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }] }, приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
      effects: {
        удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '1' } }] },
        шипы: {
          label: 'Шипы', activation: 'passive',
          on: [{ on: 'affected', to: 'other', steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '1' } }] }],
        },
      },
    };
    const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] };
    const sheet = (id: string) => ({ id, systemId: 'шипы', name: id, values: { хиты: 20 }, has: [{ of: 'приём' }], effects: [{ effectId: 'шипы' }] });
    const systemId = (await as(http().post('/systems')).send({ title: 'С шипами', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга шипов', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({ title: 'Мир шипов', systemId, compendiumIds: [bookId], sheets: [sheet('а'), sheet('б')] })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол шипов' })).body.id as string;

    const done = await as(http().post(`/rooms/${roomId}/act`)).send({ roomId, actionId: 'приём:0', fromId: 'а', toId: 'б' }).expect(201);
    expect(done.body.log.map((e: { text: string }) => e.text).join('\n')).toContain('цепочка ответов оборвана');
    const after = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    expect(after.find((s: { id: string }) => s.id === 'б').values.хиты, 'удар и две ответки').toBe(17);
    expect(after.find((s: { id: string }) => s.id === 'а').values.хиты, 'две ответки').toBe(18);
  });
});

describe('реакция после разрешения', () => {
  it('удар уже прошёл, стол спрашивает цель, ответ бьёт нападавшего', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий возмездия' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const system = {
      id: 'возмездие', name: 'С возмездием',
      tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 20 }, { key: 'видел', label: 'Видел', kind: 'number', default: 0 }] } , приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
      constants: { к20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
      effects: {
        итог: {
          label: 'Итог', activation: 'passive',
          on: [{ on: 'done', of: 'удар', steps: [{ type: 'apply', target: { tag: 'видел' }, direction: 'set', value: { expr: '@хиты' } }] }],
        },
        удар: {
          label: 'Удар', activation: 'manual',
          steps: [
            { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { expr: '0' }, continueOn: 'success' },
            { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '5' } },
          ],
        },
        возмездие: {
          label: 'Возмездие', activation: 'passive',
          on: [{ on: 'affected', of: 'удар', to: 'other', confirm: true, steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '2' } }] }],
        },
      },
      
    };
    const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] };
    const sheet = (id: string, worn: string[]) => ({
      id, systemId: 'возмездие', name: id, values: { хиты: 20 },
      has: [{ of: 'приём' }], effects: worn.map(effectId => ({ effectId })),
    });

    const systemId = (await as(http().post('/systems')).send({ title: 'С возмездием', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга возмездия', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир возмездия', systemId, compendiumIds: [bookId],
      sheets: [sheet('боец', ['итог']), sheet('цель', ['возмездие'])],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол возмездия' })).body.id as string;

    const hit = await as(http().post(`/rooms/${roomId}/act`)).send({
      roomId, actionId: 'приём:0', fromId: 'боец', toId: 'цель',
    }).expect(201);
    expect(hit.body.pending?.stage).toBe('after');
    expect(hit.body.pending?.sheetId).toBe('цель');
    expect(hit.body.pending?.question).toContain('подействовали');
    const between = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    expect(between.find((s: { id: string }) => s.id === 'цель').values.хиты, 'удар уже прошёл до вопроса').toBe(15);
    expect(between.find((s: { id: string }) => s.id === 'боец').values.видел ?? 0, '«совершил действие» ждёт ответа на вопрос').toBe(0);

    const answered = await as(http().post(`/rooms/${roomId}/answer`)).send({
      roomId, pendingId: hit.body.pending.id, chosen: ['возмездие'],
    }).expect(201);
    expect(answered.body.pending).toBeNull();
    expect(answered.body.log.map((e: { text: string }) => e.text).join(' ')).toContain('Возмездие');

    const after = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    expect(after.find((s: { id: string }) => s.id === 'боец').values.хиты, 'ответка дошла до нападавшего').toBe(18);
    expect(after.find((s: { id: string }) => s.id === 'цель').values.хиты, 'удар второй раз не прошёл').toBe(15);
    expect(after.find((s: { id: string }) => s.id === 'боец').values.видел, '«совершил действие» — в самом конце, после ответки').toBe(18);
  });
});

describe('отдых и плата ячейкой', () => {
  it('нет ячейки — действие отклонено словами; долгий отдых возвращает ячейки; в бою не отдыхают', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий отдыха' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const system = {
      id: 'отдых', name: 'С отдыхом',
      tables: { лист: { shape: 'single', columns: [
        { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
        { key: 'ячейки', label: 'Ячейки', kind: 'number', default: 1, min: 0 },
      ] } , чары: { shape: 'book', use: 'action', label: 'Чары', columns: [], bindings: [{ label: 'Стрела', effect: 'стрела', args: {} }] } },
      effects: {
        ячейка: {
          label: 'Ячейка',
          steps: [
            { id: 'есть', type: 'compare', value: { expr: '@получатель.ячейки' }, versus: { expr: '1' }, breakIf: 'less' },
            { type: 'apply', target: { tag: 'ячейки' }, direction: 'subtract', value: { expr: '1' } },
          ],
        },
        стрела: {
          label: 'Стрела', activation: 'manual',
          self: [{ type: 'emit', event: 'ячейка', amount: { expr: '1' }, strict: true }],
          steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { expr: '4' } }],
        },
        сон: {
          label: 'Сон', activation: 'passive',
          on: [{ on: 'moment:long-rest', steps: [{ type: 'apply', target: { tag: 'ячейки' }, direction: 'set', value: { expr: '1' } }] }],
        },
      },
      grants: ['сон'],
      
    };
    const book = { records: [{ id: 'стрела', table: 'чары', label: 'Стрела', cells: {} }] };
    const sheet = (id: string) => ({ id, systemId: 'отдых', name: id, values: {}, has: [{ of: 'стрела' }], effects: [] });

    const systemId = (await as(http().post('/systems')).send({ title: 'С отдыхом', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга отдыха', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({ title: 'Мир отдыха', systemId, compendiumIds: [bookId], sheets: [sheet('маг'), sheet('цель')] })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол отдыха' })).body.id as string;
    const shot = { roomId, actionId: 'стрела:0', fromId: 'маг', toId: 'цель' };

    await as(http().post(`/rooms/${roomId}/act`)).send(shot).expect(201);
    const refused = await as(http().post(`/rooms/${roomId}/act`)).send(shot).expect(400);
    expect(refused.body.message).toContain('не хватает «Ячейки»');
    const between = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    expect(between.find((s: { id: string }) => s.id === 'цель').values.хиты, 'отклонённое действие цель не тронуло').toBe(16);

    const rested = await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'long-rest' }).expect(201);
    expect(rested.body.log.map((e: { text: string }) => e.text).join(' ')).toContain('Долгий отдых');
    await as(http().post(`/rooms/${roomId}/act`)).send(shot).expect(201);

    await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'start', order: ['маг', 'цель'] }).expect(201);
    const denied = await as(http().post(`/rooms/${roomId}/turn`)).send({ roomId, op: 'short-rest' }).expect(400);
    expect(denied.body.message).toContain('в бою не отдыхают');
  });
});

describe('лист заводят с типом из системы', () => {
  it('тип берётся из тех, что завёл автор; чужой отвергается словами', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий типов' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const me = (await as(http().get('/auth/me'))).body.userId as string;

    const system = {
      id: 'типы', name: 'С типами',
      tables: { лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number', default: 5 }] } },
      effects: {},
      sheets: { питомец: { label: 'Питомец', hint: 'Зверь героя.' } },
    };
    const systemId = (await as(http().post('/systems')).send({ title: 'С типами', system })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({ title: 'Мир типов', systemId, compendiumIds: [], sheets: [] })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол типов' })).body.id as string;
    const rooms = app.get(RoomsService);

    const made = await rooms.createSheet(me, roomId, 'Шарик', 'питомец');
    const state = (await as(http().get(`/rooms/${roomId}`))).body;
    expect(state.sheets.find((s: { name: string }) => s.name === 'Шарик').of).toBe('питомец');
    expect(made.log.map(e => e.text).join(' ')).toContain('Шарик');
    await expect(rooms.createSheet(me, roomId, 'Дракон', 'дракон')).rejects.toThrow('нет типа листа «дракон»');
  });
});

describe('группа листов за столом', () => {
  it('ведущий ставит лист в группу, урон по участнику пишется в лист группы', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий отряда' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const me = (await as(http().get('/auth/me'))).body.userId as string;

    const system = {
      id: 'отряды', name: 'С отрядами',
      tables: { группа: { shape: 'single', owner: 'group', columns: [
    { key: 'урон', label: 'Урон отряда', kind: 'number' },
  ] } , приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [] } },
      effects: { удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'apply', target: { tag: 'урон' }, direction: 'add', value: { expr: '3' } }] } },
      
    };
    const book = { records: [{ id: 'удар', table: 'приём', label: 'Удар', bindings: [{ label: 'Удар', effect: 'удар', args: {} }] }] };
    const sheet = (id: string) => ({ id, systemId: 'отряды', name: id, values: {}, has: [{ of: 'удар' }], effects: [] });

    const systemId = (await as(http().post('/systems')).send({ title: 'С отрядами', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга отрядов', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир отрядов', systemId, compendiumIds: [bookId], sheets: [sheet('герой'), sheet('гоблин'), sheet('отряд')],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол отрядов' })).body.id as string;
    const rooms = app.get(RoomsService);

    const joined = await rooms.setSheetGroup(me, roomId, 'гоблин', 'отряд');
    expect(joined.log.map(e => e.text).join(' ')).toContain('в группе «отряд»');
    await expect(rooms.setSheetGroup(me, roomId, 'отряд', 'гоблин')).rejects.toThrow('группа для других');

    await rooms.act(me, { roomId, actionId: 'удар:0', fromId: 'герой', toId: 'гоблин' });
    const state = (await as(http().get(`/rooms/${roomId}`))).body.sheets as { id: string; values: Record<string, number> }[];
    expect(state.find(s => s.id === 'отряд')!.values.урон).toBe(3);
    expect(state.find(s => s.id === 'гоблин')!.values.урон).toBeUndefined();
  });
});
