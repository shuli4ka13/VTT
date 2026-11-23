import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import type { INestApplication } from '@nestjs/common';
import { WebSocket } from 'ws';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import type { Database } from '../src/db/db.ts';

const SECRET = 424242;
const AMBUSH = 515151;
const OWN = 'МЕТКА-ВЛАДЕЛЬЦА';
const PURSE = 909090;

const system = {
  id: 'роли', name: 'Роли',
  tables: {
    лист: { shape: 'single', owner: 'sheet', label: 'Лист', columns: [
      { key: 'хп', label: 'Хиты', kind: 'number', default: 20, min: 0 },
      { key: 'тайна', label: 'Тайна ведущего', kind: 'number', sees: 'gm', edits: 'gm' },
      { key: 'заметки', label: 'Заметки', kind: 'note', sees: 'owner' },
      { key: 'ранг', label: 'Ранг', kind: 'number', edits: 'gm' },
      { key: 'счётчик', label: 'Счётчик', kind: 'number', sees: 'none', edits: 'none' },
    ] },
    сцена: { shape: 'single', owner: 'desk', label: 'Сцена', columns: [{ key: 'засада', label: 'Засада', kind: 'number', sees: 'gm', edits: 'gm' }] },
    отряд: { shape: 'single', owner: 'group', label: 'Отряд', columns: [{ key: 'казна', label: 'Казна', kind: 'number', sees: 'owner' }] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  effects: {
    удар: {
      label: 'Удар', activation: 'manual',
      params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } }],
      steps: [
        { type: 'each', of: 'цели' },
        { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '1' } },
        { type: 'apply', target: { expr: '@цель.тайна' }, direction: 'add', value: { expr: '1' } },
      ],
    },
    щит: { label: 'Щит', activation: 'passive', on: [{ on: 'before:удар', if: { expr: '@цель == @holder' }, confirm: true, steps: [] }] },
  },
};

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] };

const sheet = (id: string, name: string, values: Record<string, unknown>, effects: string[] = []) => ({
  id, systemId: 'роли', name, values, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })),
});

let app: INestApplication;
let db: Database;
let port = 0;
let idAt = 0;

const call = (method: string, path: string, token: string, body?: object) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async response => ({ status: response.status, text: await response.text() }));

const login = async (name: string): Promise<{ token: string; userId: string }> =>
  JSON.parse((await call('POST', '/auth/login', '', { name })).text);

const open = (): Promise<WebSocket> => new Promise(resolve => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket.once('open', () => resolve(socket));
});

const say = (socket: WebSocket, event: string, data: object) => socket.send(JSON.stringify({ event, data }));

function heard(socket: WebSocket) {
  const all: { type: string; raw: string; data: any }[] = [];
  const waiting: { type: string; from: number; done: (message: any) => void }[] = [];
  socket.on('message', (raw: Buffer) => {
    const message = JSON.parse(String(raw));
    const data = message.data ?? message;
    all.push({ type: data.type, raw: String(raw), data });
    for (const one of [...waiting]) {
      if (one.type !== data.type || all.length <= one.from) continue;
      waiting.splice(waiting.indexOf(one), 1);
      one.done(data);
    }
  });
  const next = (type: string): Promise<any> => new Promise((resolve, reject) => {
    const from = all.length;
    const timer = setTimeout(() => reject(new Error(`не дождались «${type}»`)), 3000);
    waiting.push({ type, from, done: message => { clearTimeout(timer); resolve(message); } });
  });
  return { all, next, text: () => all.map(one => one.raw).join('\n') };
}

beforeAll(async () => {
  db = openDatabase(':memory:');
  const ref = await Test.createTestingModule({
    imports: [AppModule.create({ database: db, now: () => '2026-11-23T00:00:00.000Z', newId: () => `id-${++idAt}`, die: () => 10 })],
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

describe('роли полей за столом', () => {
  it('значение поля ведущего не уходит игроку ни одним путём; поле владельца приходит тому, кто играет листом', async () => {
    const gm = await login('Ведущий ролей');
    const player = await login('Игрок ролей');
    const post = async (path: string, body: object) => JSON.parse((await call('POST', path, gm.token, body)).text);
    const made = await post('/systems', { title: 'Роли', system });
    const bound = await post('/compendiums', { title: 'Книга ролей', systemId: made.id, compendium: book });
    await post(`/systems/${made.id}/publish`, {});
    await post(`/compendiums/${bound.id}/publish`, {});
    const world = await post('/worlds', {
      title: 'Мир ролей', systemId: made.id, compendiumIds: [bound.id],
      sheets: [
        sheet('а', 'Арвен', { хп: 10, тайна: SECRET, заметки: OWN, счётчик: 3 }),
        sheet('б', 'Борк', { хп: 10, тайна: SECRET + 1 }, ['щит']),
        sheet('стол', 'Стол', { засада: AMBUSH }),
        sheet('банда', 'Банда', { казна: PURSE, заметки: `${OWN}-БАНДЫ` }),
      ],
    });
    const room = await post('/rooms', { worldId: world.id, title: 'Стол ролей' });
    const answers: string[] = [];
    const asPlayer = async (method: string, path: string, body?: object) => {
      const out = await call(method, path, player.token, body);
      answers.push(out.text);
      return out;
    };

    const lead = await open();
    const leadHears = heard(lead);
    const leadState = leadHears.next('room:state');
    say(lead, 'room:join', { roomId: room.id, token: gm.token });
    const full = (await leadState).state;
    expect(full.sheets.find((one: { id: string }) => one.id === 'а').values).toMatchObject({ тайна: SECRET, заметки: OWN });
    expect(full.sheets.find((one: { id: string }) => one.id === 'стол').values).toEqual({ засада: AMBUSH });

    await asPlayer('POST', `/rooms/${room.id}/join`);
    const guest = await open();
    const hears = heard(guest);
    const joined = hears.next('room:state');
    say(guest, 'room:join', { roomId: room.id, token: player.token });
    const mine = (await joined).state;
    const arven = mine.sheets.find((one: { id: string }) => one.id === 'а').values;
    expect(arven).toEqual({ хп: 10, счётчик: 3 });

    const asked = hears.next('room:delta');
    say(lead, 'room:act', { intent: { roomId: room.id, actionId: 'приём:0', fromId: 'а', toIds: ['б'] } });
    const pending = (await asked).delta.pending;
    expect(pending, 'вопрос с превью дошёл до игрока').toBeTruthy();
    const done = hears.next('room:delta');
    say(lead, 'room:answer', { intent: { roomId: room.id, pendingId: pending.id, chosen: [] } });
    const struck = (await done).delta;
    expect(struck.sheets.find((one: { id: string }) => one.id === 'б').values).toEqual({ хп: 9 });
    expect(struck.log.map((line: { text: string }) => line.text).join(' ')).toContain('Хиты: 10 → 9');

    const written = hears.next('room:delta');
    say(lead, 'sheet:set', { roomId: room.id, sheetId: 'а', tag: 'тайна', value: SECRET + 7 });
    expect((await written).delta.sheets.every((one: { values: object }) => !Object.hasOwn(one.values, 'тайна'))).toBe(true);
    const shifted = hears.next('room:delta');
    say(lead, 'sheet:shift', { roomId: room.id, sheetId: 'стол', tag: 'засада', by: 3 });
    await shifted;

    const refused = hears.next('error');
    say(guest, 'sheet:set', { roomId: room.id, sheetId: 'а', tag: 'тайна', value: 1 });
    expect((await refused).message).toContain('не видите');
    const byGm = hears.next('error');
    say(guest, 'sheet:shift', { roomId: room.id, sheetId: 'а', tag: 'ранг', by: 1 });
    expect((await byGm).message).toContain('правит ведущий');
    const unseenRoll = hears.next('error');
    say(guest, 'sheet:roll', { roomId: room.id, sheetId: 'а', tag: 'тайна' });
    expect((await unseenRoll).message).toContain('не видите');
    const byRules = leadHears.next('error');
    say(lead, 'sheet:set', { roomId: room.id, sheetId: 'а', tag: 'счётчик', value: 9 });
    expect((await byRules).message).toContain('ставят правила');

    await asPlayer('GET', `/rooms/${room.id}`);
    const journal = await asPlayer('GET', `/rooms/${room.id}/journal`);
    expect(JSON.parse(journal.text).some((entry: { op: string }) => entry.op === 'set'), 'ход ведущего в журнале виден, значение — нет').toBe(true);

    const before = [hears.text(), ...answers].join('\n');
    expect(before).not.toContain('4242');
    expect(before).not.toContain(String(AMBUSH));
    expect(before).not.toContain(String(AMBUSH + 3));
    expect(before).not.toContain(OWN);
    expect(before).not.toContain(String(PURSE));

    const fresh = hears.next('room:state');
    say(guest, 'sheet:claim', { roomId: room.id, sheetId: 'а' });
    const owned = (await fresh).state.sheets.find((one: { id: string }) => one.id === 'а').values;
    expect(owned.заметки).toBe(OWN);
    expect(Object.hasOwn(owned, 'тайна')).toBe(false);

    const noted = hears.next('room:delta');
    say(guest, 'sheet:set', { roomId: room.id, sheetId: 'а', tag: 'заметки', value: 'новая запись' });
    expect((await noted).delta.sheets[0].values.заметки).toBe('новая запись');

    expect(hears.text(), 'казну группы не видит и владелец листа, пока лист не в группе').not.toContain(String(PURSE));
    const grouped = hears.next('room:state');
    say(lead, 'sheet:group', { roomId: room.id, sheetId: 'а', group: 'банда' });
    expect((await grouped).state.sheets.find((one: { id: string }) => one.id === 'банда').values, 'поле группы пришло, личное поле листа-группы — нет').toEqual({ казна: PURSE });

    const self = hears.next('error');
    say(guest, 'sheet:group', { roomId: room.id, sheetId: 'а', group: 'б' });
    expect((await self).message).toContain('ставит ведущий');

    await asPlayer('GET', `/rooms/${room.id}`);
    await asPlayer('GET', `/rooms/${room.id}/journal`);
    const after = [hears.text(), ...answers].join('\n');
    expect(after).not.toContain('4242');
    expect(after).not.toContain(String(AMBUSH));
    expect(after).not.toContain(`${OWN}-БАНДЫ`);

    expect(leadHears.text()).toContain(String(SECRET + 7));
    lead.close();
    guest.close();
  });
});
