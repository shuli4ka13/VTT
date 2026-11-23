import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import { RoomsService } from '../src/rooms/rooms.service.ts';

const world = () => {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL('../../../samples/warhammer.lite.world.json', import.meta.url)), 'utf8'));
  return { ...raw, sheets: raw.sheets.map((s: any) => s.id === 'kultist' ? { ...s, values: { ...s.values, 'harakteristiki.blizhniy_boy.znachenie': 45 } } : s) };
};

async function stand(die: (sides: number) => number) {
  const db = openDatabase(':memory:');
  let idAt = 0;
  const ref = await Test.createTestingModule({
    imports: [AppModule.create({ database: db, now: () => '2026-11-13T00:00:00.000Z', newId: () => `id-${++idAt}`, die })],
  }).compile();
  const app = ref.createNestApplication({ bodyParser: false });
  allowBigWorlds(app);
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  await app.listen(0, '127.0.0.1');
  const http = () => request(app.getHttpServer());
  const user = async (name: string) => {
    const res = await http().post('/auth/login').send({ name });
    return { token: res.body.token as string, userId: res.body.userId as string };
  };
  const gm = await user('Ведущий');
  const player = await user('Игрок');
  const as = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const ok = async (r: request.Test) => { const res = await as(gm.token)(r); if (res.status >= 300) throw new Error(JSON.stringify(res.body)); return res.body; };
  const { system, compendium, sheets } = world();
  const systemId = (await ok(http().post('/systems').send({ title: system.name, system }))).id;
  const bookId = (await ok(http().post('/compendiums').send({ title: 'Книга', systemId, compendium }))).id;
  await ok(http().post(`/systems/${systemId}/publish`).send({}));
  await ok(http().post(`/compendiums/${bookId}/publish`).send({}));
  const worldId = (await ok(http().post('/worlds').send({ title: 'Мир', systemId, compendiumIds: [bookId], sheets }))).id;
  const roomId = (await ok(http().post('/rooms').send({ worldId, title: 'Стол' }))).id as string;
  const rooms = app.get(RoomsService);
  await rooms.join(player.userId, roomId);
  const journal = () => ok(http().get(`/rooms/${roomId}/journal`));
  const state = () => ok(http().get(`/rooms/${roomId}`));
  return { rooms, roomId, gm, player, journal, state, close: async () => { await app.close(); db.close(); } };
}

const strike = (roomId: string) => ({ roomId, actionId: 'sword:0', fromId: 'vaal', toIds: ['kultist'], inputs: { chem: 'blizhniy_boy' } });
const tape = (...rolls: number[]) => { const queue = [...rolls]; return (_sides: number) => queue.shift() ?? 1; };

describe('шаг «Спросить» на сервере', () => {
  it('ничья: вопрос ведущему висит как один выбор, игрок ответить не вправе, неверное число ответов отклоняется, ответ ведущего завершает действие', async () => {
    const room = await stand(tape(38, 38));
    const paused = await room.rooms.act(room.gm.userId, strike(room.roomId));
    expect(paused.pending?.stage).toBe('step');
    expect(paused.pending?.one).toBe(true);
    expect(paused.pending?.question).toBe('Ведущий: Ничья. Кто победил?');
    expect(paused.pending?.options).toEqual([{ id: 'yes', label: 'Бьющий' }, { id: 'no', label: 'Защитник' }]);
    const pendingId = paused.pending!.id;

    await expect(room.rooms.answer(room.player.userId, { roomId: room.roomId, pendingId, chosen: ['yes'] })).rejects.toThrow();
    await expect(room.rooms.answer(room.gm.userId, { roomId: room.roomId, pendingId, chosen: [] })).rejects.toThrow('один ответ');
    await expect(room.rooms.answer(room.gm.userId, { roomId: room.roomId, pendingId, chosen: ['yes', 'no'] })).rejects.toThrow('один ответ');
    expect((await room.state()).pending?.id).toBe(pendingId);

    const done = await room.rooms.answer(room.gm.userId, { roomId: room.roomId, pendingId, chosen: ['yes'] });
    expect(done.pending).toBeNull();
    expect(done.log.map(line => line.text).join('\n')).toContain('«Ничья. Кто победил?»: Бьющий');
    expect((await room.state()).pending ?? null).toBeNull();
    await room.close();
  });

  it('переигровка по журналу совпадает', async () => {
    const first = await stand(tape(38, 38));
    const paused = await first.rooms.act(first.gm.userId, strike(first.roomId));
    await first.rooms.answer(first.gm.userId, { roomId: first.roomId, pendingId: paused.pending!.id, chosen: ['yes'] });
    const written = await first.journal();
    const dice = written.flatMap((entry: { dice: number[] }) => entry.dice);
    expect(dice.length).toBeGreaterThan(0);

    let at = 0;
    const second = await stand(() => {
      if (at >= dice.length) throw new Error('кость бросили сверх журнала');
      return dice[at++]!;
    });
    const swap = (value: unknown) => JSON.parse(JSON.stringify(value).split(first.roomId).join(second.roomId));
    const again = await second.rooms.act(second.gm.userId, swap(written[0].input));
    await second.rooms.answer(second.gm.userId, { roomId: second.roomId, pendingId: again.pending!.id, chosen: ['yes'] });
    expect(at).toBe(dice.length);
    const norm = (value: unknown) => JSON.stringify(value).split(second.roomId).join(first.roomId);
    expect(norm(await second.journal())).toBe(norm(written));
    expect(norm((await second.state()).sheets)).toBe(norm((await first.state()).sheets));
    await first.close();
    await second.close();
  });
});
