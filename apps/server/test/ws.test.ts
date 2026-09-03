import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import type { INestApplication } from '@nestjs/common';
import { WebSocket } from 'ws';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import type { Database } from '../src/db/db.ts';

// @ts-expect-error — образцы движка без деклараций.
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';

const { system: dnd, compendium, sheets } = SAMPLE_WORLDS[0];

let app: INestApplication;
let db: Database;
let port = 0;
let idAt = 0;

function waitFor(socket: WebSocket, type: string, timeout = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`не дождались «${type}»`)), timeout);
    const onMessage = (raw: Buffer) => {
      const message = JSON.parse(String(raw));
      const payload = message.data ?? message;
      if (payload.type !== type) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(payload);
    };
    socket.on('message', onMessage);
  });
}

const open = (): Promise<WebSocket> => new Promise(resolve => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket.once('open', () => resolve(socket));
});

const say = (socket: WebSocket, event: string, data: object) =>
  socket.send(JSON.stringify({ event, data }));

const post = (path: string, body: object, token?: string) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }).then(r => r.json());

const publish = async (title: string, token: string, worldSheets: unknown[]) => {
  const system = await post('/systems', { title, system: dnd }, token);
  const book = await post('/compendiums', {
    title: `${title} · книга`, systemId: system.id, compendium,
  }, token);
  await post(`/systems/${system.id}/publish`, {}, token);
  await post(`/compendiums/${book.id}/publish`, {}, token);
  return post('/worlds', {
    title, systemId: system.id, compendiumIds: [book.id], sheets: worldSheets,
  }, token);
};

beforeAll(async () => {
  db = openDatabase(':memory:');
  const ref = await Test.createTestingModule({
    imports: [AppModule.create({
      database: db,
      now: () => '2026-08-10T00:00:00.000Z',
      newId: () => `id-${++idAt}`,
      die: () => 15,
    })],
  }).compile();

  app = ref.createNestApplication();
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  await app.listen(0);
  port = (app.getHttpServer().address() as { port: number }).port;
});

afterAll(async () => {
  await app.close();
  db.close();
});

describe('канал стола', () => {
  it('двое в комнате: ход одного приходит второму дельтой', async () => {
    const gm = await post('/auth/login', { name: 'Ведущий' });
    const player = await post('/auth/login', { name: 'Игрок' });

    const published = await publish('Мир', gm.token,
      sheets.filter((s: { systemId: string }) => s.systemId === dnd.id));
    const room = await post('/rooms', { worldId: published.id, title: 'Стол' }, gm.token);

    const first = await open();
    const second = await open();

    const firstState = waitFor(first, 'room:state');
    say(first, 'room:join', { roomId: room.id, token: gm.token });
    const state = await firstState;
    expect(state.state.sheets.length).toBeGreaterThan(1);

    const secondState = waitFor(second, 'room:state');
    say(second, 'room:join', { roomId: room.id, token: player.token });
    await secondState;

    const [arven, mirra] = state.state.sheets;
    const delivered = waitFor(second, 'room:delta');
    say(first, 'room:act', {
      intent: { roomId: room.id, actionId: 'longsword-item:0', fromId: arven.id, toId: mirra.id },
    });

    const delta = await delivered;
    expect(delta.delta.sheets.length).toBeGreaterThan(0);

    expect(delta.delta).not.toHaveProperty('system');
    expect(delta.delta.log.length).toBeGreaterThan(0);

    first.close();
    second.close();
  });

  it('без токена в комнату не пускают, и канал говорит об этом словами', async () => {
    const socket = await open();
    const failure = waitFor(socket, 'error');
    say(socket, 'room:join', { roomId: 'нет-такой', token: 'подделка' });

    const message = await failure;
    expect(message.message).toBeTruthy();
    socket.close();
  });

  it('ход без входа в комнату отклоняется', async () => {
    const socket = await open();
    const failure = waitFor(socket, 'error');
    say(socket, 'room:act', {
      intent: { roomId: 'r', actionId: 'a:0', fromId: 'x', toId: 'y' },
    });

    const message = await failure;
    expect(message.message).toContain('войдите');
    socket.close();
  });
});

describe('партия строит себя сама', () => {
  it('лист заводится в комнате, снаряжение надевается — и мир, приехавший пустым, играбелен', async () => {
    const gm = await post('/auth/login', { name: 'Мастерица' });

    const published = await publish('Пустой мир', gm.token, []);
    const room = await post('/rooms', { worldId: published.id, title: 'Стол с нуля' }, gm.token);

    const socket = await open();
    const state = waitFor(socket, 'room:state');
    say(socket, 'room:join', { roomId: room.id, token: gm.token });
    expect((await state).state.sheets).toHaveLength(0);

    const created = waitFor(socket, 'room:delta');
    say(socket, 'sheet:create', { roomId: room.id, name: 'Арвен Собственноручная' });
    const delta = await created;
    expect(delta.delta.sheets).toHaveLength(1);
    const sheet = delta.delta.sheets[0];
    expect(sheet.name).toBe('Арвен Собственноручная');
    expect(sheet.values).toEqual({});
    expect(delta.delta.log[0].text).toContain('заведён');

    const equipped = waitFor(socket, 'room:delta');
    say(socket, 'sheet:belong', {
      roomId: room.id, sheetId: sheet.id, list: 'equipped', id: 'longsword-item', on: true,
    });
    expect((await equipped).delta.sheets[0].equipped).toEqual(['longsword-item']);

    const refused = waitFor(socket, 'error');
    say(socket, 'sheet:belong', {
      roomId: room.id, sheetId: sheet.id, list: 'equipped', id: 'нет-такого', on: true,
    });
    expect((await refused).message).toContain('нет предмета');

    const refusedEffect = waitFor(socket, 'error');
    say(socket, 'sheet:belong', {
      roomId: room.id, sheetId: sheet.id, list: 'effects', id: 'strike', on: true,
    });
    expect((await refusedEffect).message).toContain('не вешают');

    socket.close();
  });
});
