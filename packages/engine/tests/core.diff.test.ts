import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { availableActions } from '../src/events/actions.ts';
import { idleClock, startCombat } from '../src/engine/clock.ts';
import { act as oldAct } from '../src/lang/act.ts';
import { act as newAct } from '../src/core/act.ts';
import { emptyJournal } from '../src/lang/journal.ts';
import type { Question } from '../src/lang/journal.ts';
import type { Sheet, Die } from '../src/model/types.ts';

type Policy = 'none' | 'first' | 'all';
type Dice = 'low' | 'high' | 'avg' | 'count';

const DICE: Record<Dice, () => Die> = {
  low: () => () => 1,
  high: () => sides => sides,
  avg: () => sides => Math.ceil((sides + 1) / 2),
  count: () => {
    const seen = new Map<number, number>();
    return sides => {
      const n = seen.get(sides) ?? 0;
      seen.set(sides, n + 1);
      return ((n * 7 + 3) % sides) + 1;
    };
  },
};

const answer = (policy: Policy, question: Question): string[] =>
  policy === 'none' ? [] : policy === 'first' ? question.offers.slice(0, 1).map(o => o.id) : question.offers.map(o => o.id);

function play(which: typeof oldAct, world: Parameters<typeof oldAct>[0], intent: Parameters<typeof oldAct>[1], policy: Policy, dice: Dice) {
  let journal = emptyJournal();
  const die = DICE[dice]();
  try {
    for (let round = 0; round < 32; round++) {
      const out = which({ ...world, die, journal }, intent);
      if (out.kind === 'done') {
        return {
          log: out.log,
          sheets: out.sheets.map(s => ({ id: s.id, values: s.values, effects: (s.effects ?? []).map(({ inst: _inst, ...rest }: Record<string, unknown>) => rest) })),
        };
      }
      journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: answer(policy, out.question) } } as typeof journal;
    }
    return { error: 'без конца' };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

for (const sample of SAMPLE_WORLDS) {
  const system = flattenSystem(sample.system);
  const compendium = sample.compendium;
  const players = sample.sheets.filter((s: Sheet) => s.id !== 'стол');
  describe(`два ядра: ${system.id}`, () => {
    for (const inCombat of [false, true]) {
      it(inCombat ? 'в бою' : 'вне боя', () => {
        const clock = inCombat ? startCombat(idleClock(), sample.sheets.map((s: Sheet) => s.id)) : null;
        const diffs: string[] = [];
        for (const from of players) {
          for (const action of availableActions(from, { system, compendium })) {
            const others = players.filter((s: Sheet) => s.id !== from.id);
            for (const toIds of [[others[0]!.id], [from.id], others.slice(0, 3).map((s: Sheet) => s.id)]) {
              for (const policy of ['none', 'first', 'all'] as Policy[]) {
                for (const dice of ['low', 'high', 'avg', 'count'] as Dice[]) {
                  const world = { system, compendium, clock, sheets: sample.sheets, die: () => 1, journal: emptyJournal() };
                  const intent = { actionId: action.id, fromId: from.id, toIds };
                  const before = play(oldAct, world, intent, policy, dice);
                  const after = play(newAct as unknown as typeof oldAct, world, intent, policy, dice);
                  if (JSON.stringify(before) !== JSON.stringify(after)) {
                    diffs.push(`${from.id} · ${action.id} → ${toIds.join(',')} · ${policy} · ${dice}\n  было: ${JSON.stringify(before).slice(0, 600)}\n  стало: ${JSON.stringify(after).slice(0, 600)}`);
                  }
                }
              }
            }
          }
        }
        expect(diffs.length, diffs.slice(0, 6).join('\n')).toBe(0);
      }, 120_000);
    }
  });
}
