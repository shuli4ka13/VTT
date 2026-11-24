import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import type { JournalEntry, RoomDelta } from '@vtt/schema';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import { RoomsService } from '../src/rooms/rooms.service.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sliceWorld } from './slice.ts';
import { inLang } from '../src/common/words.ts';

const fabula = () => JSON.parse(readFileSync(fileURLToPath(new URL('../../../samples/fabula.lite.world.json', import.meta.url)), 'utf8'));

async function stand(die: (sides: number) => number, world: { system: any; compendium: any; sheets: any[] } = sliceWorld()) {
  const db = openDatabase(':memory:');
  let idAt = 0;
  const ref = await Test.createTestingModule({
    imports: [AppModule.create({ database: db, now: () => '2026-09-30T00:00:00.000Z', newId: () => `id-${++idAt}`, die })],
  }).compile();
  const app = ref.createNestApplication({ bodyParser: false });
  allowBigWorlds(app);
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  await app.listen(0, '127.0.0.1');

  const http = () => request(app.getHttpServer());
  const login = await http().post('/auth/login').send({ name: 'Ведущий' });
  const token = login.body.token as string;
  const userId = login.body.userId as string;
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const ok = async (r: request.Test) => { const res = await as(r); if (res.status >= 300) throw new Error(JSON.stringify(res.body)); return res.body; };

  const { system, compendium, sheets } = world;
  const systemId = (await ok(http().post('/systems').send({ title: system.name, system }))).id;
  const bookId = (await ok(http().post('/compendiums').send({ title: 'Книга', systemId, compendium }))).id;
  await ok(http().post(`/systems/${systemId}/publish`).send({}));
  await ok(http().post(`/compendiums/${bookId}/publish`).send({}));
  const worldId = (await ok(http().post('/worlds').send({ title: 'Мир', systemId, compendiumIds: [bookId], sheets }))).id;
  const roomId = (await ok(http().post('/rooms').send({ worldId, title: 'Стол' }))).id as string;

  const rooms = app.get(RoomsService);
  const state = () => ok(http().get(`/rooms/${roomId}`));
  const journal = (): Promise<JournalEntry[]> => ok(http().get(`/rooms/${roomId}/journal`));
  return { app, db, rooms, roomId, userId, sheets, state, journal, close: async () => { await app.close(); db.close(); } };
}

function play(rooms: RoomsService, roomId: string, entry: Pick<JournalEntry, 'op' | 'userId' | 'input'>): Promise<RoomDelta> {
  const input = entry.input as Record<string, never>;
  switch (entry.op) {
    case 'turn': return rooms.turn(entry.userId, input);
    case 'act': return rooms.act(entry.userId, input);
    case 'answer': return rooms.answer(entry.userId, input);
    case 'set': return rooms.setValue(entry.userId, roomId, input.sheetId, input.tag, input.value);
    case 'rules': return rooms.setRules(entry.userId, roomId, input).then(() => ({ roomId, sheets: [], log: [] }));
    case 'roll': return rooms.rollField(entry.userId, roomId, input.sheetId, input.tag, false, input.claims, input.second, input.versus);
    default: throw new Error(`сценарий не знает хода «${entry.op}»`);
  }
}

const lcg = (seed: number) => (sides: number): number => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return 1 + (seed % sides);
};

describe('журнал стола: намерение + кости = тот же итог', () => {
  it('ход записан целиком, а сыгранное заново по журналу с теми же костями совпадает до байта', async () => {
    const first = await stand(lcg(20260930));
    const [arven, mirra] = first.sheets;
    const me = first.userId;
    const act = (edits?: string[]) => ({ op: 'act', userId: me, input: { roomId: first.roomId, actionId: 'longsword-item:0', fromId: arven.id, toIds: [mirra.id], ...(edits ? { claims: { [arven.id]: edits } } : {}) } });
    const script = [
      act(), act(['advantage']),
      { op: 'set', userId: me, input: { sheetId: mirra.id, tag: 'hp_current', value: 3 } },
      { op: 'set', userId: me, input: { sheetId: arven.id, tag: 'item:longsword-item.damage_type', value: 'колющий' } },
      act(),
      { op: 'turn', userId: me, input: { roomId: first.roomId, op: 'start', who: [arven.id] } },
      { op: 'turn', userId: me, input: { roomId: first.roomId, op: 'join', who: [mirra.id] } },
      { op: 'turn', userId: me, input: { roomId: first.roomId, op: 'next' } },
      { op: 'turn', userId: me, input: { roomId: first.roomId, op: 'leave', who: [arven.id] } },
      { op: 'turn', userId: me, input: { roomId: first.roomId, op: 'stop' } },
    ];
    for (const step of script) {
      let delta = await play(first.rooms, first.roomId, step);
      while (delta.pending) delta = await first.rooms.answer(me, { roomId: first.roomId, pendingId: delta.pending.id, chosen: [] });
    }

    const written = await first.journal();
    expect(written.length).toBeGreaterThanOrEqual(script.length);
    expect(written.map(entry => entry.seq)).toEqual(written.map((_, at) => at));
    expect(written.some(entry => entry.dice.length > 0), 'кости хода лежат в журнале').toBe(true);
    expect(written.every(entry => Array.isArray(entry.result.sheets)), 'итог хода — изменившиеся листы').toBe(true);

    const tape = written.flatMap(entry => entry.dice);
    let at = 0;
    const second = await stand(() => {
      if (at >= tape.length) throw new Error('кость бросили сверх журнала');
      return tape[at++]!;
    });
    for (const entry of written) await play(second.rooms, second.roomId, { ...entry, input: JSON.parse(JSON.stringify(entry.input).split(first.roomId).join(second.roomId)) });

    expect(at, 'все кости журнала израсходованы').toBe(tape.length);
    const norm = (value: unknown) => JSON.stringify(value).split(second.roomId).join(first.roomId);
    expect(norm(await second.journal())).toBe(norm(written));
    const [a, b] = [await first.state(), await second.state()];
    expect(norm(b.sheets)).toBe(norm(a.sheets));
    expect(norm(b.clock)).toBe(norm(a.clock));
    expect(b.log.map((line: { text: string }) => line.text)).toEqual(a.log.map((line: { text: string }) => line.text));

    await first.close();
    await second.close();
  });

  it('язык журнала идёт от системы: запись и повтор при разных языках запроса совпадают до байта', async () => {
    const english = (): ReturnType<typeof sliceWorld> => { const world = sliceWorld(); world.system.langs = ['en']; return world; };
    const first = await stand(lcg(20261124), english());
    const [arven, mirra] = first.sheets;
    const me = first.userId;
    const script = [
      { op: 'act', userId: me, input: { roomId: first.roomId, actionId: 'longsword-item:0', fromId: arven.id, toIds: [mirra.id] } },
      { op: 'turn', userId: me, input: { roomId: first.roomId, op: 'start', who: [arven.id, mirra.id] } },
      { op: 'turn', userId: me, input: { roomId: first.roomId, op: 'next' } },
      { op: 'turn', userId: me, input: { roomId: first.roomId, op: 'stop' } },
    ];
    await inLang('ru', async () => {
      for (const step of script) {
        let delta = await play(first.rooms, first.roomId, step);
        while (delta.pending) delta = await first.rooms.answer(me, { roomId: first.roomId, pendingId: delta.pending.id, chosen: [] });
      }
    });
    const written = await first.journal();
    const tape = written.flatMap(entry => entry.dice);
    let at = 0;
    const second = await stand(() => tape[at++]!, english());
    await inLang('en', async () => {
      for (const entry of written) await play(second.rooms, second.roomId, { ...entry, input: JSON.parse(JSON.stringify(entry.input).split(first.roomId).join(second.roomId)) });
    });
    const norm = (value: unknown) => JSON.stringify(value).split(second.roomId).join(first.roomId);
    expect(norm(await second.journal())).toBe(norm(written));
    const [a, b] = [await first.state(), await second.state()];
    const lines = a.log.map((line: { text: string }) => line.text);
    expect(b.log.map((line: { text: string }) => line.text)).toEqual(lines);
    expect(lines.some((text: string) => /Round \d+\. Turn: /.test(text)), lines.join(' | ')).toBe(true);
    expect(lines.some((text: string) => /Раунд \d+/.test(text))).toBe(false);
    await first.close();
    await second.close();
  });

  it('отказанный ход в журнал не попадает, чужой журнал не читается', async () => {
    const room = await stand(() => 1);
    await expect(room.rooms.act(room.userId, { roomId: room.roomId, actionId: 'нет-такого:0', fromId: room.sheets[0].id, toIds: [room.sheets[1].id] })).rejects.toThrow();
    expect(await room.journal()).toEqual([]);
    await expect(room.rooms.journal('чужой', room.roomId)).rejects.toThrow('участники');
    await room.close();
  });

  it('бросок с двумя характеристиками и названной сложностью пишется в журнал и переигрывается', async () => {
    const first = await stand(lcg(7), fabula());
    const me = first.userId;
    const hero = first.sheets[0].id;
    const script = [
      { op: 'roll', userId: me, input: { sheetId: hero, tag: 'lovkost', second: 'sila', versus: 10 } },
      { op: 'roll', userId: me, input: { sheetId: hero, tag: 'volya', versus: 7 } },
    ];
    for (const step of script) {
      let delta = await play(first.rooms, first.roomId, step);
      while (delta.pending) delta = await first.rooms.answer(me, { roomId: first.roomId, pendingId: delta.pending.id, chosen: [] });
    }
    const written = await first.journal();
    expect(written.map(entry => entry.input)).toEqual([
      { sheetId: hero, tag: 'lovkost', second: 'sila', versus: 10 },
      { sheetId: hero, tag: 'volya', versus: 7 },
    ]);
    expect(written.every(entry => entry.dice.length === 2)).toBe(true);

    const tape = written.flatMap(entry => entry.dice);
    let at = 0;
    const second = await stand(() => {
      if (at >= tape.length) throw new Error('кость бросили сверх журнала');
      return tape[at++]!;
    }, fabula());
    for (const entry of written) await play(second.rooms, second.roomId, { ...entry, input: JSON.parse(JSON.stringify(entry.input).split(first.roomId).join(second.roomId)) });
    expect(at).toBe(tape.length);
    const norm = (value: unknown) => JSON.stringify(value).split(second.roomId).join(first.roomId);
    expect(norm(await second.journal())).toBe(norm(written));
    expect(norm((await second.state()).sheets)).toBe(norm((await first.state()).sheets));

    await first.close();
    await second.close();
  });
});
