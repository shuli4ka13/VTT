import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { parse, withCount, withKeep, start, result, see, keep, times, addTo, LOWEST } from '../src/core/dice.ts';
import type { SeenOp } from '../src/core/dice.ts';
import type { DieConstant, RollEdit } from '../src/model/types.ts';

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

const tape = (random: () => number) => {
  const values: number[] = [];
  return { values, die: (sides: number) => { const v = 1 + Math.floor(random() * sides); values.push(v); return v; } };
};

const replay = (values: number[]) => { let at = 0; return (sides: number) => values[at++] ?? sides; };

const constants: { system: string; key: string; def: DieConstant }[] = [];
const dictionaries: { system: string; edits: (RollEdit & { label: string })[] }[] = [];
for (const world of SAMPLE_WORLDS) {
  const system = flattenSystem(world.system);
  for (const [key, def] of Object.entries(system.constants ?? {})) {
    if ((def as { kind?: string }).kind !== 'die') continue;
    const fixed = (def as DieConstant).dice.every(term => typeof (term.count ?? 1) === 'number');
    if (fixed) constants.push({ system: system.id, key, def: def as DieConstant });
  }
  dictionaries.push({ system: system.id, edits: Object.entries(system.roll_edits ?? {}).map(([key, edit]) => ({ ...edit, label: edit.label || key })) });
}

describe('набор костей: свойства на костях и правках образцов', () => {
  it('в образцах есть кости и правки', () => {
    expect(constants.length).toBeGreaterThan(5);
    expect(dictionaries.some(d => d.edits.length)).toBe(true);
  });

  for (const { system, key, def } of constants) {
    it(`${system} · ${key}: та же лента — тот же итог; натуральное без вычитаемых костей не больше итога`, () => {
      const dictionary = dictionaries.find(d => d.system === system)!.edits;
      for (let seed = 1; seed <= 40; seed++) {
        const random = rng(seed * 31 + key.length);
        const edits = dictionary.filter(() => random() < 0.3);
        const thrown = tape(random);
        const first = start(parse(def), edits, thrown.die);
        const again = start(parse(def), edits, replay(thrown.values));
        const note = `${system}/${key} зерно ${seed} правки ${edits.map(e => e.label).join(',')}`;
        expect(result(again), note).toEqual(result(first));
        const now = result(first);
        if (!first.dice.some(d => d.minus) && !first.addends.length) expect(now.natural, note).toBeLessThanOrEqual(now.total);
        const pick = random();
        const op: SeenOp = pick < 0.34 ? { kind: 'reroll', upTo: 2 } : pick < 0.67 ? { kind: 'add', count: 1, keep: 'best' } : { kind: 'reroll', which: LOWEST };
        const more = tape(random);
        const after = see(first, op, replay(more.values.length ? more.values : [1, 1, 1]));
        expect(result(after), note).toBeDefined();
        if ('which' in op) {
          expect(first.dice.every(d => after.dice.some(x => x.id === d.id)), `${note}: кости на месте`).toBe(true);
          expect(first.dice.filter(d => after.dice.find(x => x.id === d.id)!.face !== d.face).length, `${note}: заменена не больше одной`).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});

describe('счёт максимумов и единиц — по оставленным главным костям', () => {
  const d20: DieConstant = { kind: 'die', label: 'к20', dice: [{ count: 1, sides: 20 }] };
  const worst: RollEdit = { label: 'помеха', ops: [{ op: 'addDie', count: 1 }, { op: 'keepWorst', n: 1 }] };

  it('помеха: выпало 20 и 3, оставлена 3 — максимума нет', () => {
    const roll = result(start(parse(d20), [worst], replay([20, 3])));
    expect(roll.natural).toBe(3);
    expect(roll.atMax).toBe(0);
  });

  it('перебросить меньшую: прибавки вне набора не трогаются', () => {
    const die = replay([7, 4, 15]);
    const thrown = addTo(start(parse(d20), [], die), [{ label: 'благословение', value: one => one(4) }], die);
    const after = result(see(thrown, { kind: 'reroll', which: LOWEST }, die));
    expect(after.total).toBe(19);
    expect(after.natural).toBe(15);
  });

  it('кость прибавки на максимуме — не максимум ведущей кости', () => {
    const die = replay([7, 4]);
    const roll = result(addTo(start(parse(d20), [], die), [{ label: 'благословение', value: one => one(4) }], die));
    expect(roll.total).toBe(11);
    expect(roll.natural).toBe(7);
    expect(roll.atMax).toBe(0);
  });

  it('«не меньше 10» не прячет единицу от счёта', () => {
    const floor: RollEdit = { label: 'надёжный', ops: [{ op: 'floorDie', least: 10 }] };
    const roll = result(start(parse(d20), [floor], replay([1])));
    expect(roll.total).toBe(10);
    expect(roll.atMin).toBe(1);
  });

  it('переброс «увидев кости» меняет физическую кость: счёт по новой', () => {
    const roll = start(parse(d20), [], replay([1]));
    const again = result(see(roll, { kind: 'reroll', upTo: 1 }, replay([20])));
    expect(again.atMin).toBe(0);
    expect(again.atMax).toBe(1);
  });
});

describe('разбор записи и отбор', () => {
  it('«2к6», «к20» и «2d6» — одна функция', () => {
    expect(parse('2d6').terms).toEqual([{ count: 2, sides: 6 }]);
    expect(parse('d20').terms).toEqual([{ count: 1, sides: 20 }]);
    expect(parse(' 2d6 ').terms).toEqual([{ count: 2, sides: 6 }]);
    expect(parse('2d6').terms).toEqual([{ count: 2, sides: 6 }]);
    expect(() => parse('два кубика')).toThrow(/не понимаю/);
  });

  it('умножение записи множит все части', () => {
    expect(times(parse('2d6'), 3).terms[0]!.count).toBe(6);
  });

  it('отбор не трогает чужие части', () => {
    const dice = [
      { id: 0, sides: 6, face: 6, value: 6, part: 'надежда' },
      { id: 1, sides: 6, face: 2, value: 2 },
      { id: 2, sides: 6, face: 5, value: 5 },
    ];
    expect(keep(dice, 1, 'best', 'unnamed').map(d => d.id)).toEqual([0, 2]);
    expect(keep(dice, 1, 'worst', 'main').map(d => d.id)).toEqual([1]);
  });
});

describe('бросок — одна функция, стороны явные', async () => {
  const { throwDice, diceTools } = await import('../src/core/roll.ts');
  const { Views } = await import('../src/core/view.ts');
  const { rollHeld } = await import('../src/core/edits.ts');
  const world = SAMPLE_WORLDS.find(w => w.system.id === 'dnd5e')!;
  const base = flattenSystem(world.system);
  const advantage = Object.entries(base.roll_edits ?? {}).find(([, e]) => (e.ops ?? []).some(op => op.op === 'keepBest'))![0];
  const system = { ...base, effects: { ...base.effects, лежит: { label: 'лежит', activation: 'passive', modifiers: [
    { kind: 'edit', call: 'roll', param: 'edits', if: { expr: '@against == @holder' }, edit: advantage },
  ] } as never } };
  const attacker = world.sheets.find((s: { id: string }) => s.id === 'orc')!;
  const target = { ...world.sheets.find((s: { id: string }) => s.id === 'arven')!, effects: [{ effectId: 'лежит' }] };
  const views = new Views(system, world.compendium);

  it('правка «по мне» с противника работает в любом броске, где он — против', () => {
    const spec = parse('d20');
    const sheets = [attacker, target];
    const holders = sheets.map(s => ({ id: s.id, view: views.of(sheets, s.id) }));
    const throwAgainst = (againstId: string | null) => throwDice({
      spec, roller: views.of(sheets, attacker.id), held: rollHeld(holders, attacker.id, againstId, []), tags: [], claims: [], die: replay([3, 18]),
    });
    const plain = throwAgainst(null);
    const versus = throwAgainst(target.id);
    expect(plain.result.total).toBe(3);
    expect(versus.result.total).toBe(18);
  });

  it('«оставить» шага идёт через тот же отбор, «максимум костей» — без броска', () => {
    const three = withKeep(withCount(parse('d6'), 3, 'т'), 2, 'т');
    expect(result(start(three, [], replay([2, 6, 4]))).total).toBe(10);
    const worst = withKeep(withCount(parse('d6'), 3, 'т'), 1, 'т', 'worst');
    expect(result(start(worst, [], replay([2, 6, 4]))).total).toBe(2);
    expect(diceTools().peak!('2d6', 2)).toBe(24);
    expect(result(start(withCount(parse('d6'), 0, 'т'), [], replay([5]))).total).toBe(0);
  });
});

describe('подписи правок в броске — только то, что подействовало', () => {
  const up = { label: 'Критический успех', ops: [{ op: 'explode', at: 'max' }] } as never;
  const down = { label: 'Критический провал', ops: [{ op: 'explode', at: 'min' }] } as never;
  const advantage = { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } as never;
  const faces = (...list: number[]) => () => list.shift() ?? 5;

  it('середина — ни один взрыв не сработал', () => {
    expect(start(parse('1d10'), [up, down], faces(8)).edits).toEqual([]);
  });

  it('максимум — только успех', () => {
    expect(start(parse('1d10'), [up, down], faces(10, 4)).edits).toEqual(['Критический успех']);
  });

  it('правка заявки видна всегда', () => {
    expect(start(parse('1d20'), [advantage], faces(7, 12)).edits).toEqual(['Преимущество']);
  });
});
