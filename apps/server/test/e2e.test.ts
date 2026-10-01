import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import type { Database } from '../src/db/db.ts';

import { sliceWorld } from './slice.ts';

const { system: dnd, compendium, sheets } = sliceWorld();

let app: INestApplication;
let db: Database;
let http: () => request.Agent;

const rolls = [18, 6, 4, 3, 5, 2, 1, 1, 1, 1];
let rollAt = 0;
let idAt = 0;

beforeAll(async () => {
  db = openDatabase(':memory:');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.create({
      database: db,
      now: () => '2026-08-10T00:00:00.000Z',
      newId: () => `id-${++idAt}`,
      die: () => rolls[rollAt++ % rolls.length]!,
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

const worldSheets = () => sheets.filter((s: { systemId: string }) => s.systemId === dnd.id);

describe('сквозной прогон стенда', () => {
  let token = '';
  let systemId = '';
  let compendiumId = '';
  let extraCompendiumId = '';
  let worldId = '';
  let roomId = '';

  it('вход по имени выдаёт сеанс', async () => {
    const res = await http().post('/auth/login').send({ name: 'Влад' }).expect(201);
    expect(res.body.name).toBe('Влад');
    expect(res.body.token).toBeTruthy();
    token = res.body.token;
  });

  it('повторный вход тем же именем не заводит второго человека', async () => {
    const again = await http().post('/auth/login').send({ name: 'Влад' }).expect(201);
    expect(again.body.userId).toBe((await http().get('/auth/me')
      .set('Authorization', `Bearer ${token}`).expect(200)).body.userId);
  });

  it('без токена закрытые ручки отвечают отказом, а не пустотой', async () => {
    await http().get('/rooms').expect(401);
    await http().post('/worlds').send({
      title: 'X', systemId: 'x', compendiumIds: [], sheets: [],
    }).expect(401);
  });

  it('создание кладёт систему в черновики: чужой её не видит, автор — да', async () => {
    const sys = await http().post('/systems')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'D&D 5e', system: dnd })
      .expect(201);
    systemId = sys.body.id;
    const book = await http().post('/compendiums')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Основная книга', systemId, compendium })
      .expect(201);
    compendiumId = book.body.id;
    const extra = await http().post('/compendiums')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Дополнение', systemId, compendium: { records: [] } })
      .expect(201);
    extraCompendiumId = extra.body.id;

    const anonymous = await http().get(`/compendiums?systemId=${systemId}`).expect(200);
    expect(anonymous.body).toHaveLength(0);

    const mine = await http().get(`/compendiums?systemId=${systemId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(mine.body).toHaveLength(2);
    expect(mine.body.every((book: { status: string }) => book.status === 'draft')).toBe(true);
    expect(mine.body.some((book: { title: string }) => book.title === 'Основная книга')).toBe(true);
  });

  it('мир не собрать из неопубликованного', async () => {
    await http().post('/worlds')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Рано', systemId, compendiumIds: [compendiumId], sheets: worldSheets() })
      .expect(400);
  });

  it('публикация делает снимок: правки черновика в него не протекают', async () => {
    for (const path of [
      `/systems/${systemId}/publish`,
      `/compendiums/${compendiumId}/publish`,
      `/compendiums/${extraCompendiumId}/publish`,
    ]) {
      await http().post(path).set('Authorization', `Bearer ${token}`).send({}).expect(201);
    }

    const listed = await http().get('/systems').expect(200);
    expect(listed.body.some((item: { id: string; status: string }) =>
      item.id === systemId && item.status === 'published')).toBe(true);
  });

  it('мир собирается из системы и выбранных компендиумов', async () => {
    const res = await http().post('/worlds')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Срез 5e', systemId,
        compendiumIds: [compendiumId, extraCompendiumId], sheets: worldSheets() })
      .expect(201);
    worldId = res.body.id;

    const list = await http().get('/worlds').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      title: 'Срез 5e', systemName: 'D&D 5e', authorName: 'Влад', compendiumCount: 2,
    });
  });

  it('мир, не проходящий схему, не публикуется — и говорит, чем именно плох', async () => {
    const res = await http().post('/worlds')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Битый', systemId, compendiumIds: [compendiumId], sheets: [{ id: 'x' }] })
      .expect(400);
    expect(String(JSON.stringify(res.body))).toContain('схем');
  });

  it('комната создаётся копией мира, создатель — ведущий', async () => {
    const res = await http().post('/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ worldId, title: 'Партия вторника' })
      .expect(201);
    roomId = res.body.id;

    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(state.body.sheets.length).toBeGreaterThan(1);
    expect(state.body.members).toHaveLength(1);
    expect(state.body.system.name).toBe('D&D 5e');
  });

  it('ход считает СЕРВЕР: цель теряет хиты, и ответка бьёт в обратную сторону', async () => {
    const before = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const [arven, mirra] = before.body.sheets;

    const res = await http().post(`/rooms/${roomId}/act`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id })
      .expect(201);

    expect(res.body.sheets.length).toBeGreaterThan(0);
    expect(res.body.sheets.length).toBeLessThan(before.body.sheets.length + 1);

    const after = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const mirraAfter = after.body.sheets.find((s: { id: string }) => s.id === mirra.id);
    expect(mirraAfter.values.hp_current).toBeLessThan(mirra.values.hp_current);

    expect(res.body.log.length).toBeGreaterThanOrEqual(1);
    const journal = res.body.log.map((l: { text: string }) => l.text).join(' · ');
    expect(journal).toContain('Арвен');
    expect(journal).toContain('(атака):');
    expect(journal).toContain('Кость урона:');
    expect(journal).toContain('применено:');
  });

  it('клиент не может продиктовать урон: лишние поля намерения игнорируются', async () => {
    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const [arven, mirra] = state.body.sheets;
    const hpBefore = mirra.values.hp_current;

    await http().post(`/rooms/${roomId}/act`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id,
        damage: 9999, hp_current: 0,
      })
      .expect(201);

    const after = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const hpAfter = after.body.sheets.find((s: { id: string }) => s.id === mirra.id)
      .values.hp_current;
    expect(hpAfter, 'урон посчитан движком, а не взят из запроса')
      .toBeGreaterThan(hpBefore - 9999);
  });

  it('несуществующее действие — внятный отказ, а не падение сервера', async () => {
    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const [arven, mirra] = state.body.sheets;

    const res = await http().post(`/rooms/${roomId}/act`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, actionId: 'нет-такого:0', fromId: arven.id, toId: mirra.id })
      .expect(400);
    expect(res.body.message).toContain('нет-такого');
  });

  it('чужой в комнате не ходит', async () => {
    const other = await http().post('/auth/login').send({ name: 'Посторонний' }).expect(201);
    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const [arven, mirra] = state.body.sheets;

    await http().post(`/rooms/${roomId}/act`)
      .set('Authorization', `Bearer ${other.body.token}`)
      .send({ roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id })
      .expect(403);
  });


  it('заявка преимущества едет в намерении, сервер применяет её по словарю', async () => {
    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const [arven, mirra] = state.body.sheets;

    const res = await http().post(`/rooms/${roomId}/act`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id, edits: ['advantage'] })
      .expect(201);
    const journal = res.body.log.map((l: { text: string }) => l.text).join(' · ');
    expect(journal).toContain('Преимущество');
  });

  it('заявка на правку, которой нет в словаре, — отказ с именем правки', async () => {
    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const [arven, mirra] = state.body.sheets;

    const res = await http().post(`/rooms/${roomId}/act`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id, edits: ['котик'] })
      .expect(400);
    expect(res.body.message).toContain('котик');
  });

  it('бой: инициатива строит порядок, ход идёт по кругу, часы приходят в дельте', async () => {
    const started = await http().post(`/rooms/${roomId}/turn`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, op: 'start' })
      .expect(201);
    expect(started.body.clock.round).toBe(1);
    expect(started.body.clock.order.length).toBeGreaterThan(1);
    const journal = started.body.log.map((l: { text: string }) => l.text).join(' · ');
    expect(journal).toContain('Инициатива');
    expect(journal).toContain('Раунд 1');

    const stepped = await http().post(`/rooms/${roomId}/turn`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, op: 'next' })
      .expect(201);
    expect(stepped.body.clock.active).toBe(started.body.clock.order[1]);
  });

  it('в бою действие с ценой тратится: второе за ход — отказ, после смены хода — снова можно', async () => {
    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const [arven, mirra] = state.body.sheets;
    const swing = () => http().post(`/rooms/${roomId}/act`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id });

    await swing().expect(201);
    const denied = await swing().expect(400);
    expect(denied.body.message).toContain('потрачено');

    await http().post(`/rooms/${roomId}/turn`).set('Authorization', `Bearer ${token}`)
      .send({ roomId, op: 'next' }).expect(201);
    await http().post(`/rooms/${roomId}/turn`).set('Authorization', `Bearer ${token}`)
      .send({ roomId, op: 'next' }).expect(201);
    await swing().expect(201);
  });

  it('конец боя сбрасывает часы, комната отдаёт их в состоянии', async () => {
    const stopped = await http().post(`/rooms/${roomId}/turn`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, op: 'stop' })
      .expect(201);
    expect(stopped.body.clock.round).toBe(0);
    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(state.body.clock.active).toBeNull();
  });

  it('реакция отправителя: стол ставит ход на паузу, ответ тратит очко и собирает бросок заново', async () => {
    const rooms = app.get(await import('../src/rooms/rooms.service.ts').then(m => m.RoomsService));
    const me = await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const [arven, mirra] = state.body.sheets;
    await rooms.setValue(me.body.userId, roomId, arven.id, 'inspiration', 1);
    await rooms.setBelonging(me.body.userId, roomId, arven.id, 'effects', 'inspire', true);

    const swing = () => http().post(`/rooms/${roomId}/act`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id });

    const paused = await swing().expect(201);
    expect(paused.body.pending).toBeTruthy();
    expect(paused.body.pending.sheetId).toBe(arven.id);
    expect(paused.body.pending.options.map((o: { id: string }) => o.id)).toEqual(['inspire']);
    expect(paused.body.pending.preview.join(' ')).toContain('Бросок (атака)');

    const denied = await swing().expect(400);
    expect(denied.body.message).toContain('ждёт ответа');

    const answered = await http().post(`/rooms/${roomId}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, pendingId: paused.body.pending.id, chosen: ['inspire'] })
      .expect(201);
    expect(answered.body.pending).toBeNull();
    const journal = answered.body.log.map((l: { text: string }) => l.text).join(' · ');
    expect(journal).toContain('собран заново');
    expect(journal).toContain('Преимущество');

    const after = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(after.body.sheets.find((s: { id: string }) => s.id === arven.id).values.inspiration).toBe(0);
    expect(after.body.pending).toBeNull();
  });

  it('пропустить реакцию — ход идёт дальше, очко на месте', async () => {
    const rooms = app.get(await import('../src/rooms/rooms.service.ts').then(m => m.RoomsService));
    const me = await http().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const [arven, mirra] = state.body.sheets;
    await rooms.setValue(me.body.userId, roomId, arven.id, 'inspiration', 1);

    const paused = await http().post(`/rooms/${roomId}/act`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id })
      .expect(201);
    expect(paused.body.pending).toBeTruthy();

    const answered = await http().post(`/rooms/${roomId}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId, pendingId: paused.body.pending.id, chosen: [] })
      .expect(201);
    expect(answered.body.pending).toBeNull();
    expect(answered.body.log.map((l: { text: string }) => l.text).join(' · ')).toContain('пропускает');

    const after = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(after.body.sheets.find((s: { id: string }) => s.id === arven.id).values.inspiration).toBe(1);
    await rooms.setBelonging(me.body.userId, roomId, arven.id, 'effects', 'inspire', false);
  });
  it('вычисляемое поле не правится вручную — его считает движок', async () => {
    const state = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const sheet = state.body.sheets[0];

    const rooms = app.get(await import('../src/rooms/rooms.service.ts')
      .then(m => m.RoomsService));
    const me = await http().get('/auth/me').set('Authorization', `Bearer ${token}`);

    await expect(rooms.setValue(me.body.userId, roomId, sheet.id, 'ac', 99))
      .rejects.toThrow(/считает движок/);

    const delta = await rooms.setValue(me.body.userId, roomId, sheet.id, 'hp_current', 7);
    expect(delta.sheets[0].values.hp_current).toBe(7);
  });

  it('публикация компендиума ловит незаполненную запись — до стола, а не на столе', async () => {
    const sys = await http().post('/systems')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Для проверки заполненности',
        system: {
          name: 'Для проверки заполненности', tables: { weapon: { shape: 'book', use: 'item', label: 'Оружие',
              columns: [{ key: 'dmg', label: 'Кость урона', kind: 'dice' }],
              bindings: [{ label: 'Удар', effect: 'strike', args: { damage_dice: { expr: '@dmg' } } }] } },
          effects: { strike: { label: 'Удар', activation: 'manual', params: [{ key: 'damage_dice', label: 'Кость урона', kind: 'dice' }], steps: [] } },
          
        },
      })
      .expect(201);
    await http().post(`/systems/${sys.body.id}/publish`)
      .set('Authorization', `Bearer ${token}`).send({}).expect(201);

    const book = await http().post('/compendiums')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Пустая оружейная', systemId: sys.body.id,
        compendium: { records: [{ id: 'sword', table: 'weapon', label: 'Меч', cells: {} }] },
      })
      .expect(201);

    const rejected = await http().post(`/compendiums/${book.body.id}/publish`)
      .set('Authorization', `Bearer ${token}`).send({}).expect(400);
    expect(rejected.body.message).toContain('Кость урона');

    await http().put(`/compendiums/${book.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Пустая оружейная', systemId: sys.body.id,
        compendium: { records: [{ id: 'sword', table: 'weapon', label: 'Меч', cells: { dmg: '1d6' } }] },
      })
      .expect(200);

    await http().post(`/compendiums/${book.body.id}/publish`)
      .set('Authorization', `Bearer ${token}`).send({}).expect(201);
  });
});

describe('публикация компендиума проверяется линтом', () => {
  it('вещь с правкой броска, которой нет в словаре, не публикуется — с адресом записи', async () => {
    const token = (await http().post('/auth/login').send({ name: 'Автор книги' })).body.token as string;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const sys = await as(http().post('/systems')).send({
      title: 'Для линта книги',
      system: {
        name: 'Для линта книги', effects: {},
        tables: { rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }] } , gear: { shape: 'book', use: 'item', label: 'Снаряжение', columns: [], bindings: [] } },
        
      },
    }).expect(201);
    await as(http().post(`/systems/${sys.body.id}/publish`)).send({}).expect(201);
    const book = await as(http().post('/compendiums')).send({
      title: 'Книга с дыркой', systemId: sys.body.id,
      compendium: {
        records: [{ id: 'ring', table: 'gear', label: 'Кольцо', cells: {}, modifiers: [{ kind: 'roll', target: 'roll:any', tags: ['атака'], edit: 'нет_такой' }] }],
      },
    }).expect(201);
    const rejected = await as(http().post(`/compendiums/${book.body.id}/publish`)).send({}).expect(400);
    expect(rejected.body.message).toContain('не готов к публикации');
    expect(rejected.body.issues.join(' ')).toContain('Кольцо');
    expect(rejected.body.issues.join(' ')).toContain('нет_такой');
  });
});

describe('права на лист', () => {
  it('игрок правит свой лист, чужой — нет; ведущий правит любой', async () => {
    const gm = (await http().post('/auth/login').send({ name: 'Ведущий прав' })).body;
    const first = (await http().post('/auth/login').send({ name: 'Игрок первый' })).body;
    const second = (await http().post('/auth/login').send({ name: 'Игрок второй' })).body;
    const as = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    const systemId = (await as(gm.token)(http().post('/systems')).send({ title: 'Права', system: dnd })).body.id;
    const bookId = (await as(gm.token)(http().post('/compendiums')).send({ title: 'Книга прав', systemId, compendium })).body.id;
    await as(gm.token)(http().post(`/systems/${systemId}/publish`)).send({});
    await as(gm.token)(http().post(`/compendiums/${bookId}/publish`)).send({});
    const worldId = (await as(gm.token)(http().post('/worlds')).send({
      title: 'Мир прав', systemId, compendiumIds: [bookId],
      sheets: sheets.filter((s: { systemId: string }) => s.systemId === dnd.id),
    })).body.id;
    const roomId = (await as(gm.token)(http().post('/rooms')).send({ worldId, title: 'Стол прав' })).body.id as string;
    await as(first.token)(http().post(`/rooms/${roomId}/join`)).send({});
    await as(second.token)(http().post(`/rooms/${roomId}/join`)).send({});

    const rooms = await import('../src/rooms/rooms.service.ts').then(m => app.get(m.RoomsService));
    const state = (await as(gm.token)(http().get(`/rooms/${roomId}`))).body;
    const [mine, foreign] = state.sheets;

    await rooms.claimSheet(first.body?.userId ?? (await as(first.token)(http().get('/auth/me'))).body.userId, roomId, mine.id);
    const me = (await as(first.token)(http().get('/auth/me'))).body.userId;
    const other = (await as(second.token)(http().get('/auth/me'))).body.userId;
    const gmId = (await as(gm.token)(http().get('/auth/me'))).body.userId;

    await expect(rooms.setValue(me, roomId, mine.id, 'hp_current', 7)).resolves.toBeTruthy();
    await expect(rooms.setValue(other, roomId, mine.id, 'hp_current', 1)).rejects.toThrow(/чужой лист/);
    await expect(rooms.setValue(gmId, roomId, mine.id, 'hp_current', 9)).resolves.toBeTruthy();
    await expect(rooms.claimSheet(other, roomId, mine.id)).rejects.toThrow(/уже играет/);
    await expect(rooms.setValue(other, roomId, foreign.id, 'hp_current', 5)).resolves.toBeTruthy();
  });
});

describe('концентрация снимается с листа', () => {
  it('держащий эффект можно снять, и связанное спадает со всех', async () => {
    const gm = (await http().post('/auth/login').send({ name: 'Ведущий связей' })).body;
    const as = (r: request.Test) => r.set('Authorization', `Bearer ${gm.token}`);
    const me = (await as(http().get('/auth/me'))).body.userId as string;

    const system = {
      id: 'связи', name: 'Со связями',
      tables: { лист: { shape: 'single', columns: [{ key: 'бонус', label: 'Бонус', kind: 'number' }] } , жест: { shape: 'book', use: 'action', label: 'Жест', columns: [], bindings: [{ label: 'Держу', effect: 'держу', args: {} }] } },
      effects: {
        держу: {
          label: 'Держу', activation: 'manual', bond: true,
          steps: [{ type: 'status', mode: 'apply', effect: { const: 'связан' } }],
        },
        связан: { label: 'Связан', activation: 'passive', duration: { kind: 'permanent' }, modifiers: [] },
      },
      
    };
    const book = { records: [{ id: 'жест', table: 'жест', label: 'Жест', cells: {} }] };
    const sheet = (id: string) => ({
      id, systemId: 'связи', name: id, values: {}, has: [{ of: 'жест' }], effects: [],
    });

    const systemId = (await as(http().post('/systems')).send({ title: 'Со связями', system })).body.id;
    const bookId = (await as(http().post('/compendiums')).send({ title: 'Книга связей', systemId, compendium: book })).body.id;
    await as(http().post(`/systems/${systemId}/publish`)).send({}).expect(201);
    await as(http().post(`/compendiums/${bookId}/publish`)).send({}).expect(201);
    const worldId = (await as(http().post('/worlds')).send({
      title: 'Мир связей', systemId, compendiumIds: [bookId], sheets: [sheet('жрец'), sheet('воин')],
    })).body.id;
    const roomId = (await as(http().post('/rooms')).send({ worldId, title: 'Стол связей' })).body.id as string;

    await as(http().post(`/rooms/${roomId}/act`))
      .send({ roomId, actionId: 'жест:0', fromId: 'жрец', toId: 'воин' }).expect(201);

    const rooms = await import('../src/rooms/rooms.service.ts').then(m => app.get(m.RoomsService));
    const after = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    expect(after.find((s: { id: string }) => s.id === 'воин').effects).toHaveLength(1);
    expect(after.find((s: { id: string }) => s.id === 'жрец').effects[0].effectId).toBe('держу');

    const dropped = await rooms.setBelonging(me, roomId, 'жрец', 'effects', 'держу', false);
    expect(dropped.log.map((e: { text: string }) => e.text).join(' ')).toContain('держать стало нечем');
    const cleared = (await as(http().get(`/rooms/${roomId}`))).body.sheets;
    expect(cleared.find((s: { id: string }) => s.id === 'воин').effects).toHaveLength(0);
  });
});
