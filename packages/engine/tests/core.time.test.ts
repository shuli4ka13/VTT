import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const system = flattenSystem({
  id: 'с', name: 'с', tags: {}, constants: {},
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'сила', label: 'Сила', kind: 'number', default: 3 }] } },
  effects: {
    джаз: { label: 'Джаз', activation: 'passive', duration: { kind: 'minutes', max: { expr: '10 * @k' } },
      params: [{ key: 'k', label: 'к6', kind: 'number', default: 2 }],
      modifiers: [{ kind: 'value', target: 'сила', op: 'add', value: { expr: '1' } }] },
  },
} as unknown as System);
const book = { records: [] } as unknown as Compendium;
const hero = { id: 'г', systemId: 'с', name: 'Герой', values: {}, has: [], effects: [] } as unknown as Sheet;
const run = (sheets: Sheet[], clock: unknown, op: unknown) => {
  const out = perform({ system, compendium: book, clock: clock as never, sheets, die: () => 1 }, op as never);
  if (out.kind !== 'done') throw new Error(out.kind);
  return out;
};

describe('игровое время', () => {
  it('срок в минутах — момент истечения от часов стола; «Прошло время» снимает истёкшее', () => {
    const on = run([hero], { round: 0, order: [], active: null, sec: 100 }, { op: 'belonging', sheetId: 'г', list: 'effects', id: 'джаз', on: true });
    expect(on.sheets[0]!.effects[0]).toMatchObject({ effectId: 'джаз', atSec: 100 + 1200 });
    const early = run(on.sheets, { round: 0, order: [], active: null, sec: 100 }, { op: 'turn', turn: 'time', seconds: 600 });
    expect(early.sheets[0]!.effects).toHaveLength(1);
    expect(early.clock).toMatchObject({ sec: 700 });
    const late = run(early.sheets, early.clock, { op: 'turn', turn: 'time', seconds: 600 });
    expect(late.sheets[0]!.effects).toHaveLength(0);
  });

  it('раунд боя — 3 секунды; конец боя часы не сбрасывает', () => {
    const start = run([hero], { round: 0, order: [], active: null, sec: 50 }, { op: 'turn', turn: 'start', order: ['г'] });
    const next = run(start.sheets, start.clock, { op: 'turn', turn: 'next' });
    expect(next.clock).toMatchObject({ round: 2, sec: 53 });
    const stop = run(next.sheets, next.clock, { op: 'turn', turn: 'stop' });
    expect(stop.clock).toMatchObject({ round: 0, sec: 53 });
  });
});
