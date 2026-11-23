import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { availableActions } from '../src/events/actions.ts';
import { fieldsOf } from '../src/model/sheet-columns.ts';
import { asksOf, choicesOf, askKindOf, isPerTarget } from '../src/model/asks.ts';
import { act } from '../src/core/act.ts';
import { perform } from '../src/core/perform.ts';
import { emptyJournal } from '../src/core/external.ts';
import { isRuleError } from '../src/engine/errors.ts';
import { rollTagReach } from '../src/model/roll-reach.ts';
import type { ActIntent } from '../src/core/act.ts';
import type { Journal } from '../src/core/external.ts';
import type { Sheet, System, Compendium } from '../src/model/types.ts';

const FULL = Boolean(process.env.PLAY_SEEDS);
const SEEDS = FULL ? Number(process.env.PLAY_SEEDS) : 1;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

interface World { system: System; compendium: Compendium; sheets: Sheet[] }

function rolledTags(entries: readonly unknown[], into: Set<string>): void {
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (Array.isArray(node.rolls) && Array.isArray(node.tags)) for (const tag of node.tags) if (typeof tag === 'string') into.add(tag);
    Object.values(node).forEach(walk);
  };
  walk(entries);
}

const finite = (sheets: Sheet[], where: string): void => {
  for (const sheet of sheets) {
    for (const [key, value] of Object.entries(sheet.values ?? {})) {
      if (typeof value === 'number') expect(Number.isFinite(value), `${where}: ${sheet.id}.${key} = ${value}`).toBe(true);
    }
  }
};

function answersFor(world: World, actionId: string, to: string, seed: number): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const param of asksOf(actionId, world)) {
    const kind = askKindOf(param);
    const options = kind === 'choice' ? choicesOf(world.system, param) : [];
    const value = kind === 'choice' ? options[seed % Math.max(1, options.length)] : kind === 'number' ? 1 : kind === 'boolean' ? 'нет' : 'x';
    if (value === undefined) continue;
    inputs[param.key] = isPerTarget(param) ? { [to]: value } : value;
  }
  return inputs;
}

function playAction(world: World, intent: ActIntent, seed: number, seen: Set<string>): 'done' | 'refused' {
  const random = rng(seed);
  const die = (sides: number) => 1 + Math.floor(random() * sides);
  let journal: Journal = emptyJournal();
  try {
    for (let round = 0; round < 64; round++) {
      const out = act({ ...world, clock: null, die, journal }, intent);
      if (out.kind === 'done') {
        finite(out.sheets, intent.actionId);
        rolledTags(out.entries, seen);
        return 'done';
      }
      const first = out.question.offers[0];
      journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: first ? [first.id] : [] } };
    }
  } catch (err) {
    if (isRuleError(err)) return 'refused';
    throw err;
  }
  throw new Error(`«${intent.actionId}» задаёт вопросы без конца`);
}

function rollField(world: World, sheetId: string, tag: string, seed: number): 'done' | 'refused' {
  const random = rng(seed);
  const die = (sides: number) => 1 + Math.floor(random() * sides);
  let journal: Journal = emptyJournal();
  try {
    for (let round = 0; round < 64; round++) {
      const out = perform({ ...world, clock: null, die, journal }, { op: 'roll', sheetId, tag });
      if (out.kind === 'done') {
        finite(out.sheets, tag);
        return 'done';
      }
      const first = out.question.offers[0];
      journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: first ? [first.id] : [] } };
    }
  } catch (err) {
    if (isRuleError(err)) return 'refused';
    throw err;
  }
  throw new Error(`бросок поля «${tag}» задаёт вопросы без конца`);
}

const ALL = [...SAMPLE_WORLDS.map(sample => ({ sample, mark: '' })), ...LITE_WORLDS.map(sample => ({ sample, mark: ' · лёгкий' }))];

for (const { sample, mark } of ALL) {
  const system = flattenSystem(sample.system);
  const world: World = { system, compendium: sample.compendium, sheets: sample.sheets };
  const players = world.sheets.filter(sheet => sheet.id !== 'desk');

  describe(`образец играется: ${system.name}${mark}`, () => {
    it('каждое действие каждого листа отрабатывает или отказывает по правилам, метки его бросков знает проверка «Проблем»', () => {
      let done = 0;
      const seen = new Set<string>();
      for (const from of players) {
        const to = players.find(sheet => sheet.id !== from.id)?.id ?? from.id;
        for (const action of availableActions(from, world)) {
          for (let seed = 1; seed <= SEEDS; seed++) {
            const inputs = answersFor(world, action.id, to, seed);
            if (playAction(world, { actionId: action.id, fromId: from.id, toIds: [to], inputs } as ActIntent, seed * 7919, seen) === 'done') done += 1;
          }
        }
      }
      expect(done, 'ни одно действие не состоялось').toBeGreaterThan(0);
      const reach = rollTagReach(system, world.compendium);
      if (!reach.open) expect([...seen].filter(tag => !reach.tags.has(tag)), 'метки бросков, которых не знает проверка «Проблем»').toEqual([]);
    }, 300_000);

    it(FULL ? 'каждый бросок по полю каждого листа отрабатывает' : 'бросок по полю каждого вида отрабатывает', () => {
      const all = fieldsOf(system).filter(field => field.roll);
      const kinds = new Map(all.map(field => [JSON.stringify(field.roll), field]));
      const rolled = FULL ? all : [...kinds.values()];
      for (const from of FULL ? players : players.slice(0, 1)) {
        for (const field of rolled) {
          expect(rollField(world, from.id, field.tag, 31), `бросок поля «${field.label ?? field.tag}» листа «${from.id}» отказал`).toBe('done');
        }
      }
    }, 300_000);
  });
}
