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

describe('публикация проверяет систему линтом', () => {
  it('эффект «срабатывает сам» без слушателя — отказ человеческим текстом', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Автор' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const system = {
      name: 'Сломанная', fields: [],
      effects: { thorns: { label: 'Шипы', activation: 'triggered', trigger: { on: '' }, steps: [] } },
    };
    const id = (await as(http().post('/systems')).send({ title: 'Сломанная', system })).body.id as string;
    const rejected = await as(http().post(`/systems/${id}/publish`)).send({}).expect(400);
    expect(rejected.body.message).toContain('1 ошибка');
    expect(rejected.body.issues[0]).toContain('Эффекты · эффект «Шипы»');
    expect(rejected.body.issues[0]).toContain('не сказано на что');

    await as(http().put(`/systems/${id}`)).send({
      title: 'Сломанная',
      system: { ...system, effects: { thorns: { ...system.effects.thorns, trigger: { on: '*' } } } },
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
      fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } }],
      effects: {
        выстрел: {
          label: 'Выстрел', activation: 'manual',
          params: [{ key: 'дистанция', label: 'Дистанция', kind: 'number', ask: { by: 'actor', kind: 'number', min: 1, max: 50 } }],
          steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { param: 'дистанция' } }],
        },
      },
      records: { ствол: { kind: 'action', label: 'Ствол', props: [], bindings: [{ label: 'Выстрел', effect: 'выстрел', args: {} }] } },
    };
    const book = { items: [], actions: [{ id: 'ствол', rk: 'ствол', label: 'Ствол', props: {} }] };
    const sheet = (id: string) => ({
      id, systemId: 'ask', kind: 'pc', name: id, values: { хиты: 20 }, equipped: [], effects: [], actions: ['ствол'],
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
      await rooms.createSheet((await as(http().get('/auth/me'))).body.userId, roomId, 'Третий', 'npc');
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
      fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } }],
      constants: { к20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
      initiative: { die: { constant: 'к20' } },
      effects: {
        отравление: {
          label: 'Отравление', activation: 'triggered',
          trigger: { on: 'moment:turn-start' },
          duration: { kind: 'permanent' },
          steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { const: 3 } }],
        },
      },
    };
    const sheet = (id: string, worn: string[]) => ({
      id, systemId: 'яд', kind: 'pc', name: id, values: { хиты: 20 },
      equipped: [], actions: [], effects: worn.map(effectId => ({ effectId })),
    });

    const systemId = (await as(http().post('/systems')).send({ title: 'С ядом', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Пусто', systemId, compendium: { items: [], actions: [] } })).body.id;
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
      fields: [
        { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
        { tag: 'ячейки', label: 'Ячейки', value: { kind: 'stored', type: 'number', default: 3, min: 0 } },
      ],
      effects: {
        шар: {
          label: 'Огненный шар', activation: 'manual',
          self: [{ type: 'apply', target: { tag: 'ячейки' }, direction: 'subtract', value: { const: 1 } }],
          steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { const: 5 } }],
        },
      },
      records: { свиток: { kind: 'action', label: 'Свиток', props: [], bindings: [{ label: 'Огненный шар', effect: 'шар', args: {} }] } },
    };
    const book = { items: [], actions: [{ id: 'свиток', rk: 'свиток', label: 'Свиток', props: {} }] };
    const sheet = (id: string) => ({
      id, systemId: 'ячейки', kind: 'pc', name: id, values: { хиты: 20, ячейки: 3 },
      equipped: [], actions: ['свиток'], effects: [],
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
    expect([of('а').хиты, of('б').хиты, of('в').хиты]).toEqual([15, 15, 15]);
    expect(done.body.log.map((e: { text: string }) => e.text).join(' ')).toContain('Ячейки');
  });
});

describe('моменты вещей и эффектов', () => {
  it('надели вещь, повесили и сняли эффект — слушатели срабатывают и пишут в журнал', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий вещей' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const me = (await as(http().get('/auth/me'))).body.userId as string;

    const system = {
      id: 'вещи', name: 'С вещами',
      fields: [
        { tag: 'надето', label: 'Надето', value: { kind: 'stored', type: 'number', default: 0 } },
        { tag: 'снято', label: 'Снято', value: { kind: 'stored', type: 'number', default: 0 } },
      ],
      effects: {
        при_надевании: {
          label: 'При надевании', activation: 'triggered', trigger: { on: 'moment:equipped' },
          steps: [{ type: 'apply', target: { tag: 'надето' }, direction: 'add', value: { const: 1 } }],
        },
        при_спадении: {
          label: 'При спадении', activation: 'triggered', trigger: { on: 'moment:expired' },
          steps: [{ type: 'apply', target: { tag: 'снято' }, direction: 'add', value: { const: 1 } }],
        },
        бафф: { label: 'Бафф', activation: 'passive', duration: { kind: 'temporary' }, modifiers: [] },
      },
      room_rules: ['при_надевании', 'при_спадении'],
      records: { оружие: { kind: 'item', label: 'Оружие', props: [], bindings: [] } },
    };
    const book = { items: [{ id: 'меч', rk: 'оружие', label: 'Меч', props: {} }], actions: [] };
    const sheet = { id: 'воин', systemId: 'вещи', kind: 'pc', name: 'Воин', values: {}, equipped: [], actions: [], effects: [] };

    const systemId = (await as(http().post('/systems')).send({ title: 'С вещами', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга вещей', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир вещей', systemId, compendiumIds: [bookId], sheets: [sheet],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол вещей' })).body.id as string;
    const rooms = app.get(RoomsService);

    const worn = await rooms.setBelonging(me, roomId, 'воин', 'equipped', 'меч', true);
    expect(worn.sheets[0]!.values.надето, 'слушатель «когда вещь надели» сработал').toBe(1);
    expect(worn.log.map(e => e.text).join(' ')).toContain('При надевании');

    await rooms.setBelonging(me, roomId, 'воин', 'effects', 'бафф', true);
    const shed = await rooms.setBelonging(me, roomId, 'воин', 'effects', 'бафф', false);
    expect(shed.sheets[0]!.values.снято, 'слушатель «когда эффект спал» сработал').toBe(1);
    expect(shed.log.map(e => e.text).join(' ')).toContain('При спадении');
  });
});

describe('вопросы к человеку переживают пересборку броска', () => {
  it('реакция отправителя собирает конверт заново, и названное игроком число не теряется', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий вопросов' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const system = {
      id: 'вопросы', name: 'С вопросами',
      fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } }],
      constants: { к20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
      roll_edits: { плюс: { label: 'Плюс', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } },
      effects: {
        удар: {
          label: 'Удар', activation: 'manual',
          params: [{ key: 'сила', label: 'Сила', kind: 'number', ask: { by: 'actor', kind: 'number', min: 1, max: 10 } }],
          steps: [
            { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { const: 0 }, continueOn: 'success' },
            { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { param: 'сила' } },
          ],
        },
        вдохновение: {
          label: 'Вдохновение', activation: 'reaction',
          trigger: { on: '*', window: 'sender', claims: ['плюс'] }, steps: [],
        },
      },
      records: { приём: { kind: 'action', label: 'Приём', props: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
    };
    const book = { items: [], actions: [{ id: 'приём', rk: 'приём', label: 'Удар', props: {} }] };
    const sheet = (id: string, worn: string[]) => ({
      id, systemId: 'вопросы', kind: 'pc', name: id, values: { хиты: 20 },
      equipped: [], actions: ['приём'], effects: worn.map(effectId => ({ effectId })),
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
      fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } }],
      constants: { к20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
      roll_edits: { удача: { label: 'Удача', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } },
      effects: {
        залп: {
          label: 'Залп', activation: 'manual',
          steps: [
            { id: 'спас', type: 'threshold', side: 'target', roll: { die: { constant: 'к20' } }, versus: { const: 11 }, continueOn: 'fail' },
            { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { const: 6 } },
          ],
        },
        везение: {
          label: 'Везение', activation: 'reaction',
          trigger: { on: '*', window: 'target', claims: ['удача'] }, steps: [],
        },
      },
      records: { приём: { kind: 'action', label: 'Приём', props: [], bindings: [{ label: 'Залп', effect: 'залп', args: {} }] } },
    };
    const book = { items: [], actions: [{ id: 'приём', rk: 'приём', label: 'Залп', props: {} }] };
    const sheet = (id: string, worn: string[]) => ({
      id, systemId: 'спасение', kind: 'pc', name: id, values: { хиты: 20 },
      equipped: [], actions: ['приём'], effects: worn.map(effectId => ({ effectId })),
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
      fields: [
        { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
        { tag: 'без_сил', label: 'Без сил', value: { kind: 'formula', expr: '#хиты <= 0' } },
      ],
      effects: {
        без_сознания: { label: 'Без сознания', activation: 'passive', duration: { kind: 'temporary' }, modifiers: [] },
        падение: {
          label: 'Падение', activation: 'triggered', trigger: { on: 'field:без_сил' },
          steps: [{ type: 'status', mode: 'apply', effect: { const: 'без_сознания' } }],
        },
      },
      room_rules: ['падение'],
    };
    const sheet = { id: 'воин', systemId: 'порог', kind: 'pc', name: 'Воин', values: { хиты: 5 }, equipped: [], actions: [], effects: [] };

    const systemId = (await as(http().post('/systems')).send({ title: 'С порогом', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Пусто', systemId, compendium: { items: [], actions: [] } })).body.id;
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
    await expect(rooms.setBelonging(other.userId, roomId, arven.id, 'equipped', 'chain-mail', false))
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
      fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } }],
      effects: { удар: { label: 'Удар', activation: 'manual', steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { const: 5 } }] } },
      records: { приём: { kind: 'action', label: 'Приём', props: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
    };
    const book = { items: [], actions: [{ id: 'приём', rk: 'приём', label: 'Удар', props: {} }] };
    const sheet = (id: string) => ({ id, systemId: 'гонка', kind: 'pc', name: id, values: { хиты: 20 }, equipped: [], actions: ['приём'], effects: [] });

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

describe('реакция после разрешения', () => {
  it('удар уже прошёл, стол спрашивает цель, ответ бьёт нападавшего', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий возмездия' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const system = {
      id: 'возмездие', name: 'С возмездием',
      fields: [{ tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } }],
      constants: { к20: { label: 'Кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
      effects: {
        удар: {
          label: 'Удар', activation: 'manual',
          steps: [
            { id: 'бросок', type: 'threshold', roll: { die: { constant: 'к20' } }, versus: { const: 0 }, continueOn: 'success' },
            { type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { const: 5 } },
          ],
        },
        возмездие: {
          label: 'Возмездие', activation: 'reaction',
          trigger: { on: 'удар', window: 'after' },
          steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { const: 2 } }],
        },
      },
      records: { приём: { kind: 'action', label: 'Приём', props: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] } },
    };
    const book = { items: [], actions: [{ id: 'приём', rk: 'приём', label: 'Удар', props: {} }] };
    const sheet = (id: string, worn: string[]) => ({
      id, systemId: 'возмездие', kind: 'pc', name: id, values: { хиты: 20 },
      equipped: [], actions: ['приём'], effects: worn.map(effectId => ({ effectId })),
    });

    const systemId = (await as(http().post('/systems')).send({ title: 'С возмездием', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга возмездия', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир возмездия', systemId, compendiumIds: [bookId],
      sheets: [sheet('боец', []), sheet('цель', ['возмездие'])],
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

    const answered = await as(http().post(`/rooms/${roomId}/answer`)).send({
      roomId, pendingId: hit.body.pending.id, chosen: ['возмездие'],
    }).expect(201);
    expect(answered.body.pending).toBeNull();
    expect(answered.body.log.map((e: { text: string }) => e.text).join(' ')).toContain('Возмездие');

    const after = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    expect(after.find((s: { id: string }) => s.id === 'боец').values.хиты, 'ответка дошла до нападавшего').toBe(18);
    expect(after.find((s: { id: string }) => s.id === 'цель').values.хиты, 'удар второй раз не прошёл').toBe(15);
  });
});

describe('отдых и плата ячейкой', () => {
  it('нет ячейки — действие отклонено словами; долгий отдых возвращает ячейки; в бою не отдыхают', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Ведущий отдыха' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const system = {
      id: 'отдых', name: 'С отдыхом',
      fields: [
        { tag: 'хиты', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 20 } },
        { tag: 'ячейки', label: 'Ячейки', value: { kind: 'stored', type: 'number', default: 1, min: 0 } },
      ],
      effects: {
        ячейка: {
          label: 'Ячейка',
          steps: [
            { id: 'есть', type: 'compare', value: { tag: 'ячейки' }, versus: { const: 1 }, breakIf: 'less' },
            { type: 'apply', target: { tag: 'ячейки' }, direction: 'subtract', value: { const: 1 } },
          ],
        },
        стрела: {
          label: 'Стрела', activation: 'manual',
          self: [{ type: 'emit', event: 'ячейка', amount: { const: 1 }, strict: true }],
          steps: [{ type: 'apply', target: { tag: 'хиты' }, direction: 'subtract', value: { const: 4 } }],
        },
        сон: {
          label: 'Сон', activation: 'triggered', trigger: { on: 'moment:long-rest' },
          steps: [{ type: 'apply', target: { tag: 'ячейки' }, direction: 'set', value: { const: 1 } }],
        },
      },
      room_rules: ['сон'],
      records: { чары: { kind: 'action', label: 'Чары', props: [], bindings: [{ label: 'Стрела', effect: 'стрела', args: {} }] } },
    };
    const book = { items: [], actions: [{ id: 'стрела', rk: 'чары', label: 'Стрела', props: {} }] };
    const sheet = (id: string) => ({ id, systemId: 'отдых', kind: 'pc', name: id, values: {}, equipped: [], actions: ['стрела'], effects: [] });

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
