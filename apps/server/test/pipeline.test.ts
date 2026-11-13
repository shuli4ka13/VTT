import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import type { RoomDelta } from '@vtt/schema';
import { allowBigWorlds } from '../src/common/body-limit.ts';
import { AppModule } from '../src/app.module.ts';
import { openDatabase } from '../src/db/db.ts';
import { RoomsService } from '../src/rooms/rooms.service.ts';

const system = {
  id: 'конвейер', name: 'Конвейер',
  constants: { к20: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
  rolls: { ловкость: { label: 'Ловкость', die: 'к20', fields: [{ table: 'лист', column: 'ловкость' }] } },
  tables: {
    лист: { shape: 'single', owner: 'sheet', columns: [
      { key: 'хп', label: 'Хиты', kind: 'number', default: 20, min: 0, max: 30 },
      { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 0 },
    ] },
    приём: { shape: 'book', use: 'action', label: 'Приём', columns: [], bindings: [{ label: 'Удар', effect: 'удар', args: {} }] },
  },
  effects: {
    удар: { label: 'Удар', activation: 'manual', params: [{ key: 'действующий', label: 'Кто действует', kind: 'sheet' }, { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель' } }], steps: [{ type: 'each', of: 'цели' }, { type: 'apply', target: { expr: '@цель.хп' }, direction: 'subtract', value: { expr: '1' } }] },
    удача: { label: 'Удача', activation: 'passive', on: [{ on: 'seen', confirm: true, steps: [{ type: 'roll-plus', value: { expr: '5' } }] }] },
    вдох: { label: 'Второе дыхание', activation: 'passive', on: [{ on: 'moment:turn-start', if: { expr: '@ходит == @носитель' }, confirm: true, steps: [{ type: 'apply', target: { expr: '@носитель.хп' }, direction: 'add', value: { expr: '3' } }] }] },
    яд: { label: 'Яд', activation: 'passive' },
    страж: { label: 'Страж', activation: 'passive', on: [{ on: 'gained:яд', if: { expr: '@лист == @носитель' }, confirm: true, steps: [{ type: 'apply', target: { expr: '@носитель.хп' }, direction: 'add', value: { expr: '1' } }] }] },
  },
};

const book = { records: [{ id: 'приём', table: 'приём', label: 'Удар', cells: {} }] };

const sheet = (id: string, name: string, effects: string[]) => ({
  id, systemId: 'конвейер', name, values: { хп: 10 }, has: [{ of: 'приём' }], effects: effects.map(effectId => ({ effectId })),
});

async function stand(die: (sides: number) => number = () => 10) {
  const db = openDatabase(':memory:');
  let idAt = 0;
  const ref = await Test.createTestingModule({
    imports: [AppModule.create({ database: db, now: () => '2026-10-02T00:00:00.000Z', newId: () => `id-${++idAt}`, die })],
  }).compile();
  const app = ref.createNestApplication({ bodyParser: false });
  allowBigWorlds(app);
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  await app.listen(0, '127.0.0.1');
  const http = () => request(app.getHttpServer());
  const login = async (name: string) => {
    const body = (await http().post('/auth/login').send({ name })).body as { token: string; userId: string };
    return { ...body, as: (r: request.Test) => r.set('Authorization', `Bearer ${body.token}`) };
  };
  const gm = await login('Ведущий');
  const ok = async (r: request.Test) => { const res = await gm.as(r); if (res.status >= 300) throw new Error(JSON.stringify(res.body)); return res.body; };
  const systemId = (await ok(http().post('/systems').send({ title: 'Конвейер', system }))).id;
  const bookId = (await ok(http().post('/compendiums').send({ title: 'Книга', systemId, compendium: book }))).id;
  await ok(http().post(`/systems/${systemId}/publish`).send({}));
  await ok(http().post(`/compendiums/${bookId}/publish`).send({}));
  const worldId = (await ok(http().post('/worlds').send({
    title: 'Мир', systemId, compendiumIds: [bookId],
    sheets: [sheet('а', 'Арвен', ['удача']), sheet('б', 'Борк', ['вдох', 'страж'])],
  }))).id;
  const roomId = (await ok(http().post('/rooms').send({ worldId, title: 'Стол' }))).id as string;
  const rooms = app.get(RoomsService);
  const state = () => rooms.state(roomId);
  const hp = async (id: string) => (await state()).sheets.find(s => s.id === id)!.values.хп;
  return { app, db, http, gm, login, rooms, roomId, state, hp, close: async () => { await app.close(); db.close(); } };
}

describe('конвейер: пауза, ответ и отмена в любой операции', () => {
  it('бросок по полю ставит паузу на «увидев кости»; ответ дочитывает, отмена возвращает снимок', async () => {
    const t = await stand(() => 10);
    const paused = await t.rooms.rollField(t.gm.userId, t.roomId, 'а', 'ловкость');
    expect(paused.pending?.stage).toBe('seen');
    expect(paused.log.at(-1)?.text).toContain('стол ждёт решения');
    const done = await t.rooms.answer(t.gm.userId, { roomId: t.roomId, pendingId: paused.pending!.id, chosen: ['удача'] });
    expect(done.pending).toBeNull();
    expect(done.log.some(line => line.text.includes('= 15'))).toBe(true);

    const again = await t.rooms.rollField(t.gm.userId, t.roomId, 'а', 'ловкость');
    const cancelled = await t.rooms.cancel(t.gm.userId, { roomId: t.roomId, pendingId: again.pending!.id });
    expect(cancelled.pending).toBeNull();
    expect((await t.state()).pending).toBeNull();
    await t.close();
  });

  it('ход с вопросом в моменте: часы не двигаются до ответа, отмена возвращает и часы', async () => {
    const t = await stand();
    await t.rooms.turn(t.gm.userId, { roomId: t.roomId, op: 'start', order: ['а', 'б'] });
    const before = (await t.state()).clock;
    const paused = await t.rooms.turn(t.gm.userId, { roomId: t.roomId, op: 'next' });
    expect(paused.pending?.stage).toBe('moment');
    expect((await t.state()).clock).toEqual(before);
    const cancelled = await t.rooms.cancel(t.gm.userId, { roomId: t.roomId, pendingId: paused.pending!.id });
    expect(cancelled.clock).toEqual(before);
    expect((await t.state()).clock).toEqual(before);

    const asked = await t.rooms.turn(t.gm.userId, { roomId: t.roomId, op: 'next' });
    const done = await t.rooms.answer(t.gm.userId, { roomId: t.roomId, pendingId: asked.pending!.id, chosen: ['вдох'] });
    expect(done.pending).toBeNull();
    expect((await t.state()).clock?.active).toBe('б');
    expect(await t.hp('б')).toBe(13);
    await t.close();
  });

  it('надеть эффект с вопросом в пересчёте: пауза, ответ «нет» — эффект на месте, хиты не тронуты', async () => {
    const t = await stand();
    const paused = await t.rooms.setBelonging(t.gm.userId, t.roomId, 'б', 'effects', 'яд', true);
    expect(paused.pending?.stage).toBe('moment');
    const done = await t.rooms.answer(t.gm.userId, { roomId: t.roomId, pendingId: paused.pending!.id, chosen: [] });
    expect(done.pending).toBeNull();
    const б = (await t.state()).sheets.find(s => s.id === 'б')!;
    expect(б.effects.map(e => e.effectId)).toContain('яд');
    expect(б.values.хп).toBe(10);
    await t.close();
  });

  it('пока стол ждёт, другие операции отклоняются', async () => {
    const t = await stand();
    const paused = await t.rooms.rollField(t.gm.userId, t.roomId, 'а', 'ловкость');
    expect(paused.pending).toBeTruthy();
    await expect(t.rooms.setValue(t.gm.userId, t.roomId, 'б', 'хп', 5)).rejects.toThrow('стол ждёт');
    await t.close();
  });
});

describe('конвейер: границы, тайна, рассылка', () => {
  it('ручной ввод вне границ поля отклоняется, мир цел', async () => {
    const t = await stand();
    await expect(t.rooms.setValue(t.gm.userId, t.roomId, 'а', 'хп', 99)).rejects.toThrow('не больше 30');
    expect(await t.hp('а')).toBe(10);
    await t.close();
  });

  it('тайный бросок ведущего: строки и строка ожидания скрыты, игрок видит журнал без костей', async () => {
    const t = await stand();
    const player = await t.login('Игрок');
    await t.rooms.join(player.userId, t.roomId);
    const paused = await t.rooms.rollField(t.gm.userId, t.roomId, 'а', 'ловкость', true);
    expect(paused.log.every(line => line.hidden)).toBe(true);
    expect(paused.pending?.hidden).toBe(true);
    const seen = await t.rooms.journal(player.userId, t.roomId);
    expect(seen.at(-1)?.input).toEqual({ hidden: true });
    expect(seen.at(-1)?.dice).toEqual([]);
    await expect(t.rooms.rollField(player.userId, t.roomId, 'а', 'ловкость', true)).rejects.toThrow('втайне');
    await t.close();
  });

  it('операция через REST рассылает дельту всем за столом', async () => {
    const t = await stand();
    const heard: RoomDelta[] = [];
    t.rooms.onDelta(delta => heard.push(delta));
    await t.gm.as(t.http().post(`/rooms/${t.roomId}/turn`)).send({ roomId: t.roomId, op: 'start', order: ['а', 'б'] }).expect(201);
    expect(heard.some(delta => delta.clock?.active === 'а')).toBe(true);
    await t.close();
  });

  it('сбой записи посреди операции не оставляет полузаписи', async () => {
    const t = await stand();
    t.db.raw.exec('DROP TABLE room_journal');
    await expect(t.rooms.setValue(t.gm.userId, t.roomId, 'а', 'хп', 4)).rejects.toThrow();
    expect(await t.hp('а')).toBe(10);
    expect((await t.state()).log).toEqual([]);
    await t.close();
  });
});

describe('конвейер: журнал ходов', () => {
  it('сыгранное заново по журналу совпадает до байта — со всеми видами операций, ответом и отменой', async () => {
    const lcg = (seed: number) => (sides: number): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return 1 + (seed % sides); };
    const first = await stand(lcg(42));
    const me = first.gm.userId;
    const r = first.roomId;
    const answerAll = async (delta: RoomDelta, chosen: string[]) => {
      let d = delta;
      while (d.pending) d = await first.rooms.answer(me, { roomId: r, pendingId: d.pending.id, chosen });
    };
    await answerAll(await first.rooms.act(me, { roomId: r, actionId: 'приём:0', fromId: 'а', toIds: ['б'] }), []);
    await answerAll(await first.rooms.rollField(me, r, 'а', 'ловкость'), ['удача']);
    const pending = await first.rooms.rollField(me, r, 'а', 'ловкость');
    await first.rooms.cancel(me, { roomId: r, pendingId: pending.pending!.id });
    await answerAll(await first.rooms.setBelonging(me, r, 'б', 'effects', 'яд', true), []);
    await first.rooms.setValue(me, r, 'б', 'хп', 7);
    await first.rooms.createSheet(me, r, 'Новичок');
    const extra = await first.rooms.createSheet(me, r, 'Лишний');
    await first.rooms.dropSheet(me, r, extra.sheets[0]!.id);
    await first.rooms.turn(me, { roomId: r, op: 'start', order: ['а', 'б'] });
    await answerAll(await first.rooms.turn(me, { roomId: r, op: 'next' }), ['вдох']);
    const written = await first.rooms.journal(me, r);
    expect(written.map(e => e.op)).toEqual(expect.arrayContaining(['act', 'roll', 'answer', 'cancel', 'belonging', 'set', 'sheet', 'drop', 'turn']));

    const tape = written.flatMap(e => e.dice);
    let at = 0;
    const second = await stand(() => { if (at >= tape.length) throw new Error('кость сверх журнала'); return tape[at++]!; });
    const swap = (value: unknown) => JSON.parse(JSON.stringify(value).split(r).join(second.roomId));
    for (const entry of written) {
      const input = swap(entry.input) as Record<string, never>;
      const s = second.rooms;
      switch (entry.op) {
        case 'act': await s.act(entry.userId, input); break;
        case 'roll': await s.rollField(entry.userId, second.roomId, input.sheetId, input.tag); break;
        case 'answer': await s.answer(entry.userId, input); break;
        case 'cancel': await s.cancel(entry.userId, input); break;
        case 'belonging': await s.setBelonging(entry.userId, second.roomId, input.sheetId, input.list, input.id, input.on, input.off); break;
        case 'set': await s.setValue(entry.userId, second.roomId, input.sheetId, input.tag, input.value); break;
        case 'sheet': await s.createSheet(entry.userId, second.roomId, input.name, input.of); break;
        case 'drop': await s.dropSheet(entry.userId, second.roomId, input.sheetId); break;
        case 'turn': await s.turn(entry.userId, input); break;
        default: throw new Error(`неизвестный ход ${entry.op}`);
      }
    }
    expect(at).toBe(tape.length);
    const norm = (value: unknown) => JSON.stringify(value).split(second.roomId).join(r);
    expect(norm(await second.rooms.journal(second.gm.userId, second.roomId))).toBe(norm(written));
    expect(norm((await second.state()).sheets)).toBe(norm((await first.state()).sheets));
    await first.close();
    await second.close();
  });
});
