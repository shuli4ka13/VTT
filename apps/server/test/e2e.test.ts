// Сквозной прогон: вход → публикация мира → комната → ход с триггерной
// ответкой. Проверяется не «ручка ответила 200», а то, ради чего сервер
// вообще нужен: расчёт на его стороне, дельты вместо полного среза
// и отказ верить клиенту.

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

// Кость и часы детерминированы: иначе тест проверял бы удачу, а не сервер.
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
  // Тот же адаптер, что в проде: иначе Nest ищет socket.io и валит процесс,
  // а стенд проверялся бы в конфигурации, которой ни у кого нет.
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  http = () => request(app.getHttpServer());
});

afterAll(async () => {
  await app.close();
  db.close();
});

const worldOf = () => ({
  system: dnd,
  compendium,
  sheets: sheets.filter((s: { systemId: string }) => s.systemId === dnd.id),
});

describe('сквозной прогон стенда', () => {
  let token = '';
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
    await http().post('/worlds').send({ title: 'X', world: worldOf() }).expect(401);
  });

  it('мир публикуется и появляется в списке', async () => {
    const res = await http().post('/worlds')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Срез 5e', world: worldOf() })
      .expect(201);
    worldId = res.body.id;

    const list = await http().get('/worlds').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      title: 'Срез 5e', systemName: 'D&D 5e', authorName: 'Влад',
    });
  });

  it('мир, не проходящий схему, не публикуется — и говорит, чем именно плох', async () => {
    const broken = worldOf();
    const res = await http().post('/worlds')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Битый', world: { ...broken, sheets: [{ id: 'x' }] } })
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

    // Дельта, а не полный срез: приходят только тронутые листы.
    expect(res.body.sheets.length).toBeGreaterThan(0);
    expect(res.body.sheets.length).toBeLessThan(before.body.sheets.length + 1);

    const after = await http().get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    const mirraAfter = after.body.sheets.find((s: { id: string }) => s.id === mirra.id);
    expect(mirraAfter.values.hp_current).toBeLessThan(mirra.values.hp_current);

    // Ответка «Шипы» висит на Мирре и бьёт нападавшего: журнал обязан
    // показать ДВЕ строки — событие и ответ.
    expect(res.body.log.length).toBeGreaterThanOrEqual(1);
    expect(res.body.log.map((l: { text: string }) => l.text).join(' · ')).toContain('Арвен');
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

    // Прямой вызов сервиса: ручки для правки значения нет, она живёт в канале.
    const rooms = app.get(await import('../src/rooms/rooms.service.ts')
      .then(m => m.RoomsService));
    const me = await http().get('/auth/me').set('Authorization', `Bearer ${token}`);

    await expect(rooms.setValue(me.body.userId, roomId, sheet.id, 'ac', 99))
      .rejects.toThrow(/считает движок/);

    // А хранимое — правится.
    const delta = await rooms.setValue(me.body.userId, roomId, sheet.id, 'hp_current', 7);
    expect(delta.sheets[0].values.hp_current).toBe(7);
  });
});

describe('старый мир открывается', () => {
  it('мир версии 1 публикуется через миграцию', async () => {
    const v1 = {
      system: {
        id: 'legacy', name: 'Старый', fields: [], effects: {},
        rules: { strike: { label: 'Удар', params: [], steps: [] } },
      },
      compendium: { items: [], actions: [], effects: [] },
      sheets: [],
    };
    const login = await http().post('/auth/login').send({ name: 'Архивариус' });
    const res = await http().post('/worlds')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ title: 'Из архива', world: v1 })
      .expect(201);
    expect(res.body.id).toBeTruthy();
  });
});

describe('комната, созданная до смены модели', () => {
  // Комнаты в БД переживают релизы движка. Эта — со «старым» миром: пол
  // урона лежит ШАГОМ (floor на apply), как писали до переезда границ на
  // поля. Движок шаговых floor больше не читает — без миграции при чтении
  // хиты уходили в минус молча (живой баг стенда: «ХП: 0 → −3»).
  it('старый floor на шаге держит хиты не ниже нуля через миграцию', async () => {
    const login = await http().post('/auth/login').send({ name: 'Хранитель' });
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${login.body.token}`);

    const world = {
      system: {
        id: 'legacy-floor', name: 'Старый пол',
        fields: [
          { tag: 'hp', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 5 } },
        ],
        effects: {
          strike: {
            label: 'Удар', activation: 'manual', params: [],
            steps: [{
              type: 'apply', target: { tag: 'hp' }, direction: 'subtract',
              value: { const: 8 }, floor: { const: 0 },
            }],
          },
        },
      },
      compendium: {
        items: [],
        actions: [{ id: 'hit', rk: 'приём', label: 'Удар', effect: 'strike', args: {} }],
      },
      sheets: [
        { id: 'a', systemId: 'legacy-floor', kind: 'pc', name: 'А', values: { hp: 5 }, equipped: [], actions: ['hit'], effects: [] },
        { id: 'b', systemId: 'legacy-floor', kind: 'pc', name: 'Б', values: { hp: 5 }, equipped: [], actions: [], effects: [] },
      ],
    };

    const pub = await auth(http().post('/worlds')).send({ title: 'Старый пол', world }).expect(201);
    const made = await auth(http().post('/rooms')).send({ worldId: pub.body.id, title: 'Архив' }).expect(201);
    const roomId = made.body.id;

    const res = await auth(http().post(`/rooms/${roomId}/act`))
      .send({ roomId, actionId: 'hit:0', fromId: 'a', toId: 'b' })
      .expect(201);

    const hit = res.body.sheets.find((s: { id: string }) => s.id === 'b');
    expect(hit.values.hp).toBe(0);
  });
});
