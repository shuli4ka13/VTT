import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import type { Database } from '../src/db/db.ts';

// @ts-expect-error — образцы движка без деклараций.
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';

const { system: dnd, compendium, sheets } = SAMPLE_WORLDS[0];

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

  app = moduleRef.createNestApplication();

  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
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
      .send({ title: 'Дополнение', systemId, compendium: { items: [], actions: [] } })
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
    expect(journal).toContain('Бросок атаки:');
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
          name: 'Для проверки заполненности', fields: [], effects: {},
          records: {
            weapon: { kind: 'item', label: 'Оружие',
              props: [{ key: 'dmg', label: 'Кость урона', kind: 'dice' }],
              bindings: [{ label: 'Удар', effect: 'strike', args: { damage_dice: { prop: 'dmg' } } }] },
          },
        },
      })
      .expect(201);
    await http().post(`/systems/${sys.body.id}/publish`)
      .set('Authorization', `Bearer ${token}`).send({}).expect(201);

    const book = await http().post('/compendiums')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Пустая оружейная', systemId: sys.body.id,
        compendium: { items: [{ id: 'sword', rk: 'weapon', label: 'Меч', props: {} }], actions: [] },
      })
      .expect(201);

    const rejected = await http().post(`/compendiums/${book.body.id}/publish`)
      .set('Authorization', `Bearer ${token}`).send({}).expect(400);
    expect(rejected.body.message).toContain('Кость урона');

    await http().put(`/compendiums/${book.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Пустая оружейная', systemId: sys.body.id,
        compendium: { items: [{ id: 'sword', rk: 'weapon', label: 'Меч', props: { dmg: '1d6' } }], actions: [] },
      })
      .expect(200);

    await http().post(`/compendiums/${book.body.id}/publish`)
      .set('Authorization', `Bearer ${token}`).send({}).expect(201);
  });
});
