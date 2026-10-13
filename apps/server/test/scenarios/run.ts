import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import { calc, newPass } from '@vtt/engine/engine/calc';
import { flattenSystem } from '@vtt/engine/model/inherit';
import type { RoomDelta, Sheet, System } from '@vtt/schema';
import { allowBigWorlds } from '../../src/common/body-limit.ts';
import { AppModule } from '../../src/app.module.ts';
import { openDatabase } from '../../src/db/db.ts';
import { RoomsService } from '../../src/rooms/rooms.service.ts';

export type Answer = string[];

export type Step =
  | {
    act: string; from: string; to: string | string[];
    inputs?: Record<string, number | string>; edits?: string[];
    answers?: Answer[];
    refused?: string;
  }
  | { turn: 'start' | 'next' | 'stop'; order?: string[]; answers?: Answer[] }
  | { set: [sheetId: string, tag: string, value: number | string | boolean | null] };

export interface Scenario {
  name: string;
  rule: string;
  world: string;
  declineRest?: boolean;
  sheets?: Record<string, { values?: Record<string, unknown>; effects?: string[]; has?: { of: string; off?: boolean }[] }>;
  dice: number[];
  steps: Step[];
  expect: {
    values?: Record<string, Record<string, unknown>>;
    effects?: Record<string, { has?: string[]; not?: string[] }>;
    log?: string[];
    notLog?: string[];
  };
}

const samples = fileURLToPath(new URL('../../../../samples/', import.meta.url));

function worldOf(scenario: Scenario): { system: System; compendium: unknown; sheets: Sheet[] } {
  const world = JSON.parse(readFileSync(`${samples}${scenario.world}.world.json`, 'utf8'));
  const sheets = (world.sheets as Sheet[]).map(sheet => {
    const patch = scenario.sheets?.[sheet.id];
    if (!patch) return sheet;
    return {
      ...sheet,
      values: { ...sheet.values, ...(patch.values ?? {}) } as Sheet['values'],
      ...(patch.effects ? { effects: patch.effects.map(effectId => ({ effectId })) } : {}),
      ...(patch.has ? { has: patch.has } : {}),
    };
  });
  return { system: world.system, compendium: world.compendium, sheets };
}

const queue = (dice: number[]) => {
  const rest = [...dice];
  return (sides: number): number => {
    if (!rest.length) throw new Error(`сценарий: кубик к${sides} бросили больше раз, чем записано в dice`);
    const value = rest.shift()!;
    if (value < 1 || value > sides) throw new Error(`сценарий: на к${sides} не может выпасть ${value}`);
    return value;
  };
};

export interface Played {
  sheets: Sheet[];
  log: string[];
  system: System;
  compendium: unknown;
  diceLeft: number;
}

export async function playScenario(scenario: Scenario): Promise<Played> {
  const db = openDatabase(':memory:');
  let idAt = 0;
  const dice = [...scenario.dice];
  const die = queue(dice);
  const ref = await Test.createTestingModule({
    imports: [AppModule.create({ database: db, now: () => '2026-10-01T00:00:00.000Z', newId: () => `id-${++idAt}`, die: sides => { const v = die(sides); dice.shift(); return v; } })],
  }).compile();
  const app = ref.createNestApplication({ bodyParser: false });
  allowBigWorlds(app);
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.init();
  await app.listen(0, '127.0.0.1');
  try {
    const http = () => request(app.getHttpServer());
    const login = await http().post('/auth/login').send({ name: 'Ведущий' });
    const token = login.body.token as string;
    const userId = login.body.userId as string;
    const ok = async (r: request.Test) => {
      const res = await r.set('Authorization', `Bearer ${token}`);
      if (res.status >= 300) throw new Error(JSON.stringify(res.body));
      return res.body;
    };

    const { system, compendium, sheets } = worldOf(scenario);
    const systemId = (await ok(http().post('/systems').send({ title: system.name, system }))).id;
    const bookId = (await ok(http().post('/compendiums').send({ title: 'Книга', systemId, compendium }))).id;
    await ok(http().post(`/systems/${systemId}/publish`).send({}));
    await ok(http().post(`/compendiums/${bookId}/publish`).send({}));
    const worldId = (await ok(http().post('/worlds').send({ title: 'Мир', systemId, compendiumIds: [bookId], sheets }))).id;
    const roomId = (await ok(http().post('/rooms').send({ worldId, title: 'Стол' }))).id as string;
    const rooms = app.get(RoomsService);
    const log: string[] = [];

    const settle = async (first: Promise<RoomDelta>, answers: Answer[] = [], refused?: string) => {
      let delta: RoomDelta;
      try {
        delta = await first;
      } catch (err) {
        const message = (err as Error).message;
        if (refused !== undefined && message.includes(refused)) { log.push(`отказ: ${message}`); return; }
        throw new Error(`сценарий: ход отклонён — ${message}`, { cause: err });
      }
      if (refused !== undefined) throw new Error(`сценарий: ждали отказа «${refused}», а ход прошёл`);
      log.push(...delta.log.map(entry => entry.text));
      const left = [...answers];
      while (delta.pending) {
        if (!left.length && !scenario.declineRest) throw new Error(`сценарий: неожиданный вопрос — ${delta.pending.question} (${delta.pending.options.map(o => o.id).join(', ')})`);
        const chosen = left.length ? left.shift()! : [];
        delta = await rooms.answer(userId, { roomId, pendingId: delta.pending.id, chosen });
        log.push(...delta.log.map(entry => entry.text));
      }
      if (left.length) throw new Error(`сценарий: остались неиспользованные ответы ${JSON.stringify(left)}`);
    };

    for (const step of scenario.steps) {
      if ('act' in step) {
        const targets = Array.isArray(step.to) ? step.to : [step.to];
        await settle(rooms.act(userId, {
          roomId, actionId: step.act, fromId: step.from, toIds: targets,
          ...(step.inputs ? { inputs: step.inputs } : {}),
          ...(step.edits ? { claims: { [step.from]: step.edits } } : {}),
        }), step.answers, step.refused);
      } else if ('turn' in step) {
        await settle(rooms.turn(userId, { roomId, op: step.turn, ...(step.order ? { order: step.order } : {}) }), step.answers);
      } else {
        const [sheetId, tag, value] = step.set;
        await settle(rooms.setValue(userId, roomId, sheetId, tag, value));
      }
    }

    const final = (await ok(http().get(`/rooms/${roomId}`))).sheets as Sheet[];
    return { sheets: final, log, system, compendium, diceLeft: dice.length };
  } finally {
    await app.close();
    db.close();
  }
}

export function readValue(played: Played, sheetId: string, tag: string): unknown {
  const sheet = played.sheets.find(s => s.id === sheetId);
  if (!sheet) throw new Error(`сценарий: в комнате нет листа «${sheetId}»`);
  const system = flattenSystem(played.system);
  return calc(system, sheet, tag, newPass(system, sheet, { compendium: played.compendium as never }));
}

export function check(scenario: Scenario, played: Played): string[] {
  const problems: string[] = [];
  for (const [sheetId, values] of Object.entries(scenario.expect.values ?? {})) {
    for (const [tag, want] of Object.entries(values)) {
      let got: unknown;
      try { got = readValue(played, sheetId, tag); } catch (err) { got = `ошибка: ${(err as Error).message}`; }
      if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${sheetId}.${tag}: ждали ${JSON.stringify(want)}, получили ${JSON.stringify(got)}`);
    }
  }
  for (const [sheetId, rule] of Object.entries(scenario.expect.effects ?? {})) {
    const worn = (played.sheets.find(s => s.id === sheetId)?.effects ?? []).map(e => e.effectId);
    for (const id of rule.has ?? []) if (!worn.includes(id)) problems.push(`${sheetId}: нет эффекта «${id}» (висит: ${worn.join(', ') || 'ничего'})`);
    for (const id of rule.not ?? []) if (worn.includes(id)) problems.push(`${sheetId}: висит лишний эффект «${id}»`);
  }
  const text = played.log.join('\n');
  for (const part of scenario.expect.log ?? []) if (!text.includes(part)) problems.push(`в журнале нет «${part}»`);
  for (const part of scenario.expect.notLog ?? []) if (text.includes(part)) problems.push(`в журнале лишнее «${part}»`);
  if (played.diceLeft) problems.push(`не все кости использованы: осталось ${played.diceLeft}`);
  return problems;
}
