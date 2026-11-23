import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import type { INestApplication } from '@nestjs/common';
import { WebSocket } from 'ws';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import type { Database } from '../src/db/db.ts';

import { sliceWorld } from './slice.ts';
import { fieldsOf } from '@vtt/engine';

const { system: dnd, compendium, sheets } = sliceWorld();

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

  app = ref.createNestApplication({ bodyParser: false });
  allowBigWorlds(app);
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
      intent: { roomId: room.id, actionId: 'longsword-item:0', fromId: arven.id, toIds: [mirra.id] },
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

  it('канал отвечает на языке, названном при входе в комнату', async () => {
    const gm = await post('/auth/login', { name: 'Ведущий языка' });
    const published = await publish('Мир языка', gm.token, sheets.filter((s: { systemId: string }) => s.systemId === dnd.id));
    const room = await post('/rooms', { worldId: published.id, title: 'Стол' }, gm.token);

    const english = await open();
    const entered = waitFor(english, 'room:state');
    say(english, 'room:join', { roomId: room.id, token: gm.token, lang: 'en' });
    await entered;
    const refused = waitFor(english, 'error');
    say(english, 'room:act', { intent: { nonsense: true } });
    expect((await refused).message).toBe('the intent does not pass the schema');
    english.close();

    const russian = await open();
    const joined = waitFor(russian, 'room:state');
    say(russian, 'room:join', { roomId: room.id, token: gm.token });
    await joined;
    const failure = waitFor(russian, 'error');
    say(russian, 'room:act', { intent: { nonsense: true } });
    expect((await failure).message).toBe('намерение не проходит схему');
    russian.close();
  });

  it('ход без входа в комнату отклоняется', async () => {
    const socket = await open();
    const failure = waitFor(socket, 'error');
    say(socket, 'room:act', {
      intent: { roomId: 'r', actionId: 'a:0', fromId: 'x', toIds: ['y'] },
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
    expect((await state).state.sheets.filter((sheet: { id: string }) => sheet.id !== 'desk')).toHaveLength(0);

    const created = waitFor(socket, 'room:delta');
    say(socket, 'sheet:create', { roomId: room.id, name: 'Арвен Собственноручная' });
    const delta = await created;
    expect(delta.delta.sheets).toHaveLength(1);
    const sheet = delta.delta.sheets[0];
    expect(sheet.name).toBe('Арвен Собственноручная');
    expect(sheet.values).toMatchObject({ str: 10, dex: 10, level: 1, hp_max: 1, hp_current: 1 });
    expect(delta.delta.log[0].text).toContain('заведён');

    const equipped = waitFor(socket, 'room:delta');
    say(socket, 'sheet:belong', {
      roomId: room.id, sheetId: sheet.id, list: 'has', id: 'longsword-item', on: true,
    });
    expect((await equipped).delta.sheets[0].has).toEqual([{ of: 'longsword-item' }]);

    const refused = waitFor(socket, 'error');
    say(socket, 'sheet:belong', {
      roomId: room.id, sheetId: sheet.id, list: 'has', id: 'нет-такого', on: true,
    });
    expect((await refused).message).toContain('нет записи');

    const refusedEffect = waitFor(socket, 'error');
    say(socket, 'sheet:belong', {
      roomId: room.id, sheetId: sheet.id, list: 'effects', id: 'strike', on: true,
    });
    expect((await refusedEffect).message).toContain('не вешают');

    socket.close();
  });
});

describe('бросок с листа', () => {
  it('поле с броском даёт строку журнала, поле без броска — отказ', async () => {
    const gm = await post('/auth/login', { name: 'Ведущий броска' });
    const published = await publish('Мир броска', gm.token,
      sheets.filter((s: { systemId: string }) => s.systemId === dnd.id));
    const room = await post('/rooms', { worldId: published.id, title: 'Стол броска' }, gm.token);

    const socket = await open();
    const joined = waitFor(socket, 'room:state');
    say(socket, 'room:join', { roomId: room.id, token: gm.token });
    const state = await joined;
    const [hero] = state.state.sheets;
    const rollable = fieldsOf(state.state.system).find(field => field.roll)!;
    expect(rollable, 'в образце есть поле с броском').toBeTruthy();

    const rolled = waitFor(socket, 'room:delta');
    say(socket, 'sheet:roll', { roomId: room.id, sheetId: hero.id, tag: rollable.tag });
    const delta = await rolled;
    const said = delta.delta.log.map((entry: { text: string }) => entry.text).join(' ');
    expect(said).toContain(hero.name);
    expect(said).toMatch(/\[\d+/);

    const refused = waitFor(socket, 'error');
    const plain = fieldsOf(state.state.system).find(field => !field.roll && field.value.kind === 'stored')!;
    say(socket, 'sheet:roll', { roomId: room.id, sheetId: hero.id, tag: plain.tag });
    expect((await refused).message).toContain('не бросают');

    socket.close();
  });
});

describe('быстрый урон и лечение', () => {
  it('сдвиг считает сервер от своего значения и прижимает к границам поля; чужой лист игрок не сдвигает', async () => {
    const gm = await post('/auth/login', { name: 'Ведущий сдвига' });
    const owner = await post('/auth/login', { name: 'Хозяйка Мирры' });
    const guest = await post('/auth/login', { name: 'Гость сдвига' });
    const published = await publish('Мир сдвига', gm.token,
      sheets.filter((s: { systemId: string }) => s.systemId === dnd.id));
    const room = await post('/rooms', { worldId: published.id, title: 'Стол сдвига' }, gm.token);

    const enter = async (token: string) => {
      const socket = await open();
      const joined = waitFor(socket, 'room:state');
      say(socket, 'room:join', { roomId: room.id, token });
      return { socket, state: (await joined).state };
    };
    const lead = await enter(gm.token);
    const hers = await enter(owner.token);
    const other = await enter(guest.token);
    const mirra = lead.state.sheets.find((sheet: { id: string }) => sheet.id === 'mirra');
    expect(mirra.values).toMatchObject({ hp_max: 21, hp_current: 21 });

    const hp = async (by: number): Promise<number> => {
      const delivered = waitFor(lead.socket, 'room:delta');
      say(lead.socket, 'sheet:shift', { roomId: room.id, sheetId: 'mirra', tag: 'hp_current', by });
      return (await delivered).delta.sheets[0].values.hp_current;
    };
    expect(await hp(-7)).toBe(14);
    expect(await hp(-100)).toBe(0);
    expect(await hp(5)).toBe(5);
    expect(await hp(1000)).toBe(21);

    const claimed = waitFor(lead.socket, 'room:members');
    say(hers.socket, 'sheet:claim', { roomId: room.id, sheetId: 'mirra' });
    await claimed;

    const refused = waitFor(other.socket, 'error');
    say(other.socket, 'sheet:shift', { roomId: room.id, sheetId: 'mirra', tag: 'hp_current', by: -5 });
    expect((await refused).message).toContain('чужой лист');

    const own = waitFor(lead.socket, 'room:delta');
    say(hers.socket, 'sheet:shift', { roomId: room.id, sheetId: 'mirra', tag: 'hp_current', by: -5 });
    expect((await own).delta.sheets[0].values.hp_current).toBe(16);

    const broken = waitFor(lead.socket, 'error');
    say(lead.socket, 'sheet:shift', { roomId: room.id, sheetId: 'mirra', tag: 'hp_current', by: 'много' });
    expect((await broken).message).toContain('не проходит схему');

    for (const one of [lead, hers, other]) one.socket.close();
  });
});

