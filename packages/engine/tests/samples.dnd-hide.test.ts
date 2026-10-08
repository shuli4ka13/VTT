import { describe, it, expect } from 'vitest';
import { act } from '../src/core/act.ts';
import { emptyJournal } from '../src/core/external.ts';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { availableActions } from '../src/events/actions.ts';
import { calc } from '../src/engine/calc.ts';
import { lapse } from '../src/events/durations.ts';
import { perform } from '../src/core/perform.ts';
import type { Clock } from '../src/engine/clock.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const dnd = () => structuredClone(PLAYABLE_WORLDS.find(w => (w.system as System).id === 'dnd5e')!) as unknown as { system: System; compendium: Compendium; sheets: Sheet[] };

function play(world: ReturnType<typeof dnd>, sheets: Sheet[], actionId: string, fromId: string, toIds: string[], dice: number[], clock: Clock | null = null) {
  let journal = emptyJournal();
  for (let i = 0; i < 8; i++) {
    const rest = [...dice];
    const out = act({ system: world.system, compendium: world.compendium, clock, sheets, die: () => rest.shift() ?? 10, journal } as never, { actionId, fromId, toIds }) as unknown as {
      kind: string; sheets: Sheet[]; log: string[]; journal: typeof journal; question: { key: string };
    };
    if (out.kind !== 'paused') return out;
    journal = { ...out.journal, answers: { ...out.journal.answers, [out.question.key]: [] } };
  }
  throw new Error('действие так и не завершилось');
}

const attackOf = (world: ReturnType<typeof dnd>, sheet: Sheet) =>
  availableActions(sheet, world).find(a => a.effect === 'strike')!.id;

describe('Засада D&D: один бросок Скрытности против внимательности каждого', () => {
  it('кость одна, исход у каждой цели свой; «Не замечает» висит на тех, кто не заметил, и помнит кого', () => {
    const world = dnd();
    const pp = (id: string) => calc(world.system, world.sheets.find(s => s.id === id)!, 'passive_perception', undefined as never);
    expect([pp('goblin'), pp('ogre'), pp('orc')]).toEqual([9, 8, 10]);
    const out = play(world, world.sheets, '+hide', 'arven', ['goblin', 'ogre', 'orc'], [6]);
    const hidden = (id: string) => out.sheets.find(s => s.id === id)!.effects?.filter(e => e.effectId === 'hidden') ?? [];
    expect(out.log.filter(line => line.includes('Бросок')).length).toBe(1);
    expect(hidden('ogre').map(e => e.args)).toEqual([{ кого: 'arven' }]);
    expect(hidden('goblin')).toEqual([]);
    expect(hidden('orc')).toEqual([]);
    expect(hidden('arven')).toEqual([]);
  });

  it('спрятавшийся бьёт незаметившего с преимуществом, незаметивший его — с помехой, остальные — как обычно', () => {
    const world = dnd();
    const after = play(world, world.sheets, '+hide', 'arven', ['goblin', 'ogre', 'orc'], [6]).sheets;
    const arven = after.find(s => s.id === 'arven')!;
    const ogre = after.find(s => s.id === 'ogre')!;
    const goblin = after.find(s => s.id === 'goblin')!;
    const line = (from: Sheet, to: string) => play(world, after, attackOf(world, from), from.id, [to], [3, 17, 4, 4, 4, 4]).log.join(' | ');
    expect(line(arven, 'ogre')).toMatch(/преимуществ/i);
    expect(line(ogre, 'arven')).toMatch(/помех/i);
    expect(line(arven, 'goblin')).not.toMatch(/преимуществ|помех/i);
    expect(line(goblin, 'arven')).not.toMatch(/преимуществ|помех/i);
  });

  it('двое спрятались от одного огра — у огра два «Не замечает», каждое со своим «кого»; повтор тем же — обновляет, а не копит', () => {
    const world = dnd();
    let sheets = play(world, world.sheets, '+hide', 'arven', ['ogre'], [6]).sheets;
    sheets = play(world, sheets, '+hide', 'mirra', ['ogre'], [15]).sheets;
    sheets = play(world, sheets, '+hide', 'arven', ['ogre'], [6]).sheets;
    const ogre = sheets.find(s => s.id === 'ogre')!;
    expect(ogre.effects!.filter(e => e.effectId === 'hidden').map(e => e.args)).toEqual([{ кого: 'arven' }, { кого: 'mirra' }]);
    const arven = sheets.find(s => s.id === 'arven')!;
    expect(play(world, sheets, attackOf(world, arven), 'arven', ['ogre'], [3, 17, 4, 4, 4, 4]).log.join(' ')).toMatch(/Преимуществ/);
  });

  it('в бою «Не замечает» держится до начала следующего хода спрятавшегося, а не того, на ком висит', () => {
    const world = dnd();
    const clock: Clock = { round: 1, order: ['arven', 'ogre'], active: 'arven' };
    let sheets = play(world, world.sheets, '+hide', 'arven', ['ogre'], [6], clock).sheets;
    const worn = () => sheets.find(s => s.id === 'ogre')!.effects!.filter(e => e.effectId === 'hidden');
    expect(worn().length).toBe(1);
    sheets = lapse({ moment: 'turn-end', sheetId: 'arven' }, sheets, world.system, clock).sheets;
    sheets = lapse({ moment: 'turn-start', sheetId: 'ogre' }, sheets, world.system, clock).sheets;
    expect(worn().length).toBe(1);
    sheets = lapse({ moment: 'turn-start', sheetId: 'arven' }, sheets, world.system, clock).sheets;
    expect(worn().length).toBe(0);
  });

  it('два испуга от разных заклинателей — спасся от одного, снялся только он', () => {
    const world = dnd();
    const sheets = world.sheets.map(s => (s.id === 'goblin'
      ? { ...s, effects: [...(s.effects ?? []), { effectId: 'frightened', args: { запомнено: 10 } }, { effectId: 'frightened', args: { запомнено: 25 } }] }
      : s));
    const clock: Clock = { round: 1, order: ['goblin', 'arven'], active: 'goblin' };
    const dice = [15, 15, 15, 15];
    const out = perform({ system: world.system, compendium: world.compendium, clock, sheets, die: () => dice.shift() ?? 15 } as never, { op: 'turn', turn: 'next' } as never) as unknown as { sheets: Sheet[]; log: string[] };
    const left = out.sheets.find(s => s.id === 'goblin')!.effects!.filter(e => e.effectId === 'frightened');
    expect(left.map(e => e.args)).toEqual([{ запомнено: 25 }]);
  });
});

