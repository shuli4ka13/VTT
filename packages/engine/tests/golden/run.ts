import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { PLAYABLE_WORLDS } from '../../src/model/systems.ts';
import { availableActions } from '../../src/events/actions.ts';
import { asksOf, askKindOf, choicesOf } from '../../src/model/asks.ts';
import { perform } from '../../src/core/perform.ts';
import { emptyJournal } from '../../src/core/external.ts';
import { Views } from '../../src/core/view.ts';
import { calcAll } from '../../src/engine/calc.ts';
import { isDesk } from '../../src/engine/owners.ts';
import type { Op } from '../../src/core/perform.ts';
import type { Journal, Question } from '../../src/core/external.ts';
import type { Clock } from '../../src/engine/clock.ts';
import type { System, Sheet, Compendium, Die } from '../../src/model/types.ts';

type World = { title: string; system: System; compendium: Compendium; sheets: Sheet[] };
type Answer = 'нет' | 'да';
type Outcome = { sheets: Sheet[]; clock: Clock | null; log: string[] } | { error: string };

const MODE = process.env.GOLDEN ?? '';
const HERE = new URL('.', import.meta.url).pathname;

const DICE: Record<string, () => Die> = {
  низ: () => () => 1,
  верх: () => sides => sides,
  шаг: () => {
    let k = 0;
    return sides => ((k++ * 7) % sides) + 1;
  },
};

function play(world: World, sheets: Sheet[], clock: Clock | null, op: Op, die: Die, answer: Answer): Outcome {
  let journal: Journal = emptyJournal();
  let ids = 0;
  for (let round = 0; round < 64; round++) {
    let out;
    try {
      out = perform({ system: world.system, compendium: world.compendium, clock, sheets, die, journal, newId: () => `id${ids++}` }, op);
    } catch (err) {
      return { error: String((err as Error).message ?? err) };
    }
    if (out.kind === 'done') return { sheets: out.sheets, clock: out.clock, log: out.log };
    const question: Question = out.question;
    const chosen = answer === 'да' && question.offers[0] ? [question.offers[0].id] : [];
    journal = { ...out.journal, answers: { ...out.journal.answers, [question.key]: chosen } };
  }
  return { error: 'вопросы без конца' };
}

function digest(world: World, outcome: Outcome): { result: unknown; log: unknown } {
  if ('error' in outcome) return { result: { error: outcome.error }, log: null };
  const views = new Views(world.system, world.compendium);
  const sheets = outcome.sheets.map(sheet => {
    let calc: unknown;
    try {
      calc = calcAll(world.system, sheet, views.of(outcome.sheets, sheet.id));
    } catch (err) {
      calc = { error: String((err as Error).message ?? err) };
    }
    return { id: sheet.id, values: sheet.values, has: sheet.has ?? [], effects: sheet.effects ?? [], calc };
  });
  return { result: { sheets, clock: outcome.clock }, log: outcome.log };
}

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);

function inputsOf(world: World, from: Sheet, actionId: string): Record<string, number | string> {
  const params = asksOf(actionId, world);
  const candidates = (param: (typeof params)[number]): (number | string)[] => {
    const kind = askKindOf(param);
    if (kind === 'choice') return choicesOf(world.system, param);
    if (kind === 'text') return ['текст'];
    const low = typeof param.min === 'number' ? param.min : 0;
    return [...new Set([low, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => n >= low))];
  };
  const out: Record<string, number | string> = {};
  for (const param of params) out[param.key] = candidates(param)[0] ?? 0;
  const works = (inputs: Record<string, number | string>): boolean => {
    const outcome = play(world, world.sheets, null, { op: 'act', intent: { actionId, fromId: from.id, toIds: [], inputs } }, DICE.низ!(), 'нет');
    return !('error' in outcome);
  };
  if (!params.length || works(out)) return out;
  for (const param of params) {
    for (const value of candidates(param)) {
      const next = { ...out, [param.key]: value };
      if (works(next)) return next;
    }
  }
  return out;
}

interface Case { id: string; run: () => Outcome }

function cases(world: World, fast: boolean): Case[] {
  const out: Case[] = [];
  const people = world.sheets.filter(sheet => !isDesk(sheet));
  const order = people.map(sheet => sheet.id);
  const diceNames = fast ? ['низ'] : Object.keys(DICE);
  const answers: Answer[] = fast ? ['нет'] : ['нет', 'да'];

  for (const dice of diceNames) {
    out.push({ id: `покой|${dice}`, run: () => ({ sheets: world.sheets, clock: null, log: [] }) });
  }

  const started = play(world, world.sheets, null, { op: 'turn', turn: 'start', order }, DICE.низ!(), 'нет');
  const battle = 'error' in started ? null : started;

  for (const from of people) {
    for (const action of availableActions(from, world)) {
      const others = people.filter(sheet => sheet.id !== from.id);
      const targetSets: string[][] = fast
        ? [others[0] ? [others[0].id] : []]
        : [[], ...others.map(sheet => [sheet.id]), ...(others.length > 1 ? [[others[0]!.id, others[1]!.id]] : [])];
      const inputs = inputsOf(world, from, action.id);
      for (const toIds of targetSets) {
        for (const dice of diceNames) {
          for (const answer of answers) {
            const intent = { actionId: action.id, fromId: from.id, toIds, ...(Object.keys(inputs).length ? { inputs } : {}) };
            const base = `${from.id}|${action.id}|${toIds.join('+') || '—'}|${dice}|${answer}`;
            out.push({ id: `вне боя|${base}`, run: () => play(world, world.sheets, null, { op: 'act', intent }, DICE[dice]!(), answer) });
            if (battle && (fast || toIds.length === Math.min(1, others.length))) {
              const clock = battle.clock ? { ...battle.clock, active: from.id } : null;
              out.push({ id: `в бою|${base}`, run: () => play(world, battle.sheets, clock, { op: 'act', intent }, DICE[dice]!(), answer) });
            }
          }
        }
      }
    }
  }

  for (const answer of answers) {
    out.push({
      id: `ход боя|${answer}`,
      run: () => {
        const steps: Op[] = [
          { op: 'turn', turn: 'start', order },
          ...Array.from({ length: order.length * 2 }, (): Op => ({ op: 'turn', turn: 'next' })),
          { op: 'turn', turn: 'stop' }, { op: 'turn', turn: 'scene' }, { op: 'turn', turn: 'short-rest' }, { op: 'turn', turn: 'long-rest' },
        ];
        let sheets = world.sheets;
        let clock: Clock | null = null;
        const log: string[] = [];
        const die = DICE.шаг!();
        for (const [at, op] of steps.entries()) {
          const outcome = play(world, sheets, clock, op, die, answer);
          if ('error' in outcome) return { error: `шаг ${at}: ${outcome.error}` };
          sheets = outcome.sheets;
          clock = outcome.clock;
          log.push(...outcome.log, `— ${hash(digest(world, outcome).result)}`);
        }
        return { sheets, clock, log };
      },
    });
  }
  return out;
}

export function golden(index: number, name: string): void {
  const world = PLAYABLE_WORLDS[index] as unknown as World;
  const file = join(HERE, `${name}.snap.json`);
  describe.skipIf(!MODE)(`золотой снимок: ${world.system.name}`, () => {
    const fast = MODE === 'fast';
    const now = new Map<string, [string, string]>();
    const full = process.env.GOLDEN_FULL;

    it('прогон', () => {
      if (full) mkdirSync(full, { recursive: true });
      const dump: Record<string, unknown> = {};
      for (const one of cases(world, fast)) {
        const { result, log } = digest(world, one.run());
        now.set(one.id, [hash(result), hash(log)]);
        if (full) dump[one.id] = { result, log };
      }
      if (full) writeFileSync(join(full, `${name}.json`), JSON.stringify(dump, null, 1));
      if (process.env.GOLDEN_UPDATE) {
        writeFileSync(file, `${JSON.stringify(Object.fromEntries([...now].sort(([a], [b]) => a.localeCompare(b))), null, 0)}\n`);
      }
      expect(now.size).toBeGreaterThan(0);
    }, 3_600_000);

    const saved = (): Record<string, [string, string]> => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});
    const differs = (column: 0 | 1): string[] => {
      const old = saved();
      return [...now].filter(([id, pair]) => !old[id] || old[id]![column] !== pair[column]).map(([id]) => id);
    };

    it('итоги совпадают', () => {
      const bad = differs(0);
      expect(bad.slice(0, 40), `расхождений итогов: ${bad.length}`).toEqual([]);
    });

    it('журнал совпадает', () => {
      const bad = differs(1);
      expect(bad.slice(0, 40), `расхождений журнала: ${bad.length}`).toEqual([]);
    });
  });
}
