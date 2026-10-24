import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { availableActions } from '../src/events/actions.ts';
import { idleClock, startCombat } from '../src/engine/clock.ts';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import { isRuleError } from '../src/engine/errors.ts';
import type { ActIntent, ActOutcome } from '../src/core/act.ts';
import type { Journal, Question } from '../src/core/external.ts';
import type { Sheet, System, Compendium } from '../src/model/types.ts';

const SEEDS = Number(process.env.FUZZ_SEEDS ?? 6);
const CHAIN = 4;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

interface Ctx { system: System; compendium: Compendium; clock: ReturnType<typeof startCombat> | null }

const noDice = (): number => { throw new Error('повтор бросил новую кость'); };

function pick(random: () => number, question: Question): string[] {
  const roll = random();
  if (roll < 0.3) return [];
  if (roll < 0.85 || question.offers.length < 2) return question.offers.length ? [question.offers[Math.floor(random() * question.offers.length)]!.id] : [];
  return question.offers.filter(() => random() < 0.5).map(offer => offer.id);
}

const shape = (out: ActOutcome) => ({
  kind: out.kind,
  log: out.log,
  sheets: out.sheets.map(s => ({ id: s.id, values: s.values, effects: s.effects })),
  ...(out.kind === 'paused' ? { question: { key: out.question.key, sheetId: out.question.sheetId, offers: out.question.offers.map(o => o.id) } } : {}),
});

function play(ctx: Ctx, sheets: Sheet[], intent: ActIntent, random: () => number) {
  let journal: Journal = emptyJournal();
  const die = (sides: number) => 1 + Math.floor(random() * sides);
  const asked: string[] = [];
  const history: Journal[] = [];
  const shown: string[][] = [];
  for (let round = 0; round < 64; round++) {
    const out = act({ ...ctx, sheets, die, journal }, intent);
    for (const earlier of shown) {
      expect(out.log.slice(0, earlier.length), 'журнал на паузе — начало следующего: сервер дописывает только хвост').toEqual(earlier);
    }
    if (out.kind === 'done') return { out, asked, history };
    shown.push(out.log);
    expect(asked, `вопрос «${out.question.key}» задан повторно`).not.toContain(out.question.key);
    expect(out.question.offers.length, `вопрос «${out.question.key}» без вариантов`).toBeGreaterThan(0);
    const ids = out.question.offers.map(o => o.id);
    expect(new Set(ids).size, `в вопросе «${out.question.key}» повтор вариантов`).toBe(ids.length);
    asked.push(out.question.key);
    journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: pick(random, out.question) } };
    history.push(journal);
  }
  throw new Error('действие задаёт вопросы без конца');
}

function check(ctx: Ctx, sheets: Sheet[], intent: ActIntent, seed: number): Sheet[] {
  const random = rng(seed);
  let played: ReturnType<typeof play>;
  try {
    played = play(ctx, sheets, intent, random);
  } catch (err) {
    if (isRuleError(err)) return sheets;
    throw err;
  }
  const { out, asked } = played;
  if (out.kind !== 'done') throw new Error('не завершилось');

  for (const key of asked) expect(Object.keys(out.journal.answers), `ответ на «${key}» потерян из журнала`).toContain(key);

  const again = act({ ...ctx, sheets, die: noDice, journal: structuredClone(out.journal) }, intent);
  expect(shape(again), 'повтор по журналу дал другой итог').toEqual(shape(out));
  expect(again.journal, 'повтор по журналу дал другой журнал').toEqual(out.journal);

  const wild = act({ ...ctx, sheets, die: noDice, journal: structuredClone(out.journal), declineAll: true }, intent);
  expect(shape(wild), 'полный журнал не должен зависеть от declineAll').toEqual(shape(out));

  for (const sheet of out.sheets) {
    for (const [key, value] of Object.entries(sheet.values ?? {})) {
      if (typeof value === 'number') expect(Number.isFinite(value), `${sheet.id}.${key} = ${value}`).toBe(true);
    }
  }
  return out.sheets;
}

for (const world of SAMPLE_WORLDS) {
  const system = flattenSystem(world.system);
  const compendium = world.compendium;
  const players = world.sheets.filter((s: Sheet) => s.id !== 'стол');

  describe(`перебор: ${system.id}`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      for (const inCombat of [false, true]) {
        it(`зерно ${seed} · ${inCombat ? 'в бою' : 'вне боя'}`, () => {
          const random = rng(seed * 7919 + (inCombat ? 1 : 0));
          const ctx: Ctx = { system, compendium, clock: inCombat ? startCombat(idleClock(), world.sheets.map((s: Sheet) => s.id)) : null };
          let sheets: Sheet[] = world.sheets;
          for (const from of players) {
            const actions = availableActions(from, { system, compendium });
            for (const action of actions) {
              const others = players.filter((s: Sheet) => s.id !== from.id);
              const roll = random();
              const toIds = roll < 0.15 ? [from.id] : roll < 0.35 ? others.map((s: Sheet) => s.id) : [others[Math.floor(random() * others.length)]?.id ?? from.id];
              const fresh = check(ctx, world.sheets, { actionId: action.id, fromId: from.id, toIds }, Math.floor(random() * 1e9));
              void fresh;
            }
          }
          for (let step = 0; step < CHAIN * players.length; step++) {
            const from = players[Math.floor(random() * players.length)]!;
            const live = sheets.find(s => s.id === from.id) ?? from;
            const actions = availableActions(live, { system, compendium });
            if (!actions.length) continue;
            const action = actions[Math.floor(random() * actions.length)]!;
            const to = players[Math.floor(random() * players.length)]!;
            sheets = check(ctx, sheets, { actionId: action.id, fromId: from.id, toIds: [to.id] }, Math.floor(random() * 1e9));
          }
        }, 120_000);
      }
    }
  });
}
