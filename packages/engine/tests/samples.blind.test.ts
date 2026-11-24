import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { availableActions } from '../src/events/actions.ts';
import { asksOf, choicesOf, askKindOf, isPerTarget } from '../src/model/asks.ts';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import { isRuleError } from '../src/engine/errors.ts';
import { NOBODY } from '../src/engine/owners.ts';
import type { Journal } from '../src/core/external.ts';
import type { Sheet, System, Compendium } from '../src/model/types.ts';

interface World { system: System; compendium: Compendium; sheets: Sheet[] }

function inputsFor(world: World, actionId: string): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const param of asksOf(actionId, world)) {
    const kind = askKindOf(param);
    const value = kind === 'choice' ? choicesOf(world.system, param)[0] : kind === 'number' ? 1 : kind === 'boolean' ? 'нет' : 'x';
    if (value === undefined) continue;
    inputs[param.key] = isPerTarget(param) ? { [NOBODY]: value } : value;
  }
  return inputs;
}

function play(world: World, actionId: string, fromId: string, die: (sides: number) => number): 'done' | 'refused' {
  let journal: Journal = emptyJournal();
  const inputs = inputsFor(world, actionId);
  try {
    for (let round = 0; round < 64; round++) {
      const out = act({ ...world, clock: null, die, journal }, { actionId, fromId, toIds: [NOBODY], ...(Object.keys(inputs).length ? { inputs: inputs as never } : {}) });
      if (out.kind === 'done') {
        expect(JSON.stringify(out.sheets).includes(NOBODY), `${actionId}: служебный лист попал в листы`).toBe(false);
        expect(out.log.join(' ').includes('Symbol('), `${actionId}: невыясненное попало в журнал`).toBe(false);
        return 'done';
      }
      const first = out.question.offers[0];
      journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: first ? [first.id] : [] } };
    }
  } catch (err) {
    if (isRuleError(err)) return 'refused';
    throw err;
  }
  throw new Error(`«${actionId}» задаёт вопросы без конца`);
}

const ALL = [...SAMPLE_WORLDS.map(sample => ({ sample, mark: '' })), ...LITE_WORLDS.map(sample => ({ sample, mark: ' · лёгкий' }))];

for (const { sample, mark } of ALL) {
  const system = flattenSystem(sample.system);
  const world: World = { system, compendium: sample.compendium, sheets: sample.sheets };

  describe(`образцы играются без цели: ${sample.system.name}${mark}`, () => {
    it('каждое действие каждого листа с целью «никто» отрабатывает или отказывает по правилам; листы целы', () => {
      let done = 0;
      const refused: string[] = [];
      for (const sheet of world.sheets.filter(one => one.id !== 'desk')) {
        for (const action of availableActions(sheet, world)) {
          for (const share of [0, 0.5, 1]) {
            const result = play(world, action.id, sheet.id, sides => Math.max(1, Math.ceil(share * sides)));
            if (result === 'done') done++;
            else if (share === 0.5) refused.push(`${sheet.id}: ${action.label}`);
          }
        }
      }
      expect(done, `ни одно действие не прошло; отказы: ${refused.slice(0, 8).join('; ')}`).toBeGreaterThan(0);
    }, 300_000);
  });
}
