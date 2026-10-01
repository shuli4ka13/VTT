import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { rollLead, seeRoll } from '../src/engine/lead-die.ts';
import { parse, start, result, see, keep, times, faces } from '../src/core/dice.ts';
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

const plain = (edits: RollEdit[]) => !edits.some(edit => (edit.ops ?? []).some(op => ['keepBest', 'keepWorst', 'bonusDie'].includes(String(op.op))));

describe('набор костей против старой модели', () => {
  it('в образцах есть кости и правки для сравнения', () => {
    expect(constants.length).toBeGreaterThan(5);
    expect(dictionaries.some(d => d.edits.length)).toBe(true);
  });

  for (const { system, key, def } of constants) {
    it(`${system} · ${key}: итог, натуральное, кости, части и правки совпадают`, () => {
      const dictionary = dictionaries.find(d => d.system === system)!.edits;
      for (let seed = 1; seed <= 60; seed++) {
        const random = rng(seed * 31 + key.length);
        const edits = dictionary.filter(() => random() < 0.3);
        const thrown = tape(random);
        const old = rollLead(def, thrown.die, edits);
        const fresh = start(parse(def), edits, replay(thrown.values));
        const now = result(fresh);
        const note = `${system}/${key} зерно ${seed} правки ${edits.map(e => e.label).join(',')}`;
        expect(now.total, note).toBe(old.total);
        expect(now.natural, note).toBe(old.natural);
        expect(now.dice.rolls, note).toEqual(old.rolls);
        expect(now.dice.kept, note).toBe(old.kept);
        expect(now.parts, note).toEqual(old.parts);
        expect(faces(fresh), note).toEqual(fresh.dice.map(d => (d.minus ? -d.face : d.face)));
        expect(fresh.claim.versusShift, note).toBe(old.versusShift);
        expect(fresh.claim.degreeShift, note).toBe(old.degreeShift);
        if (plain(edits)) {
          expect(now.atMax, note).toBe(old.tally.atMax);
          expect(now.atMin, note).toBe(old.tally.atMin);
        }

        const ops: SeenOp[] = [
          { kind: 'reroll', upTo: 1 + Math.floor(random() * 3) },
          { kind: 'add', count: 1, ...(random() < 0.5 ? { keep: 'best' as const } : {}) },
          { kind: 'plus', value: 2 },
        ];
        const op = ops[Math.floor(random() * ops.length)]!;
        const more = tape(random);
        const oldSeen = seeRoll(old, op, more.die);
        const newSeen = result(see(fresh, op, replay(more.values)));
        expect(newSeen.total, `${note} · ${op.kind}`).toBe(oldSeen.total);
        expect(newSeen.natural, `${note} · ${op.kind}`).toBe(oldSeen.natural);
        expect(newSeen.dice.rolls, `${note} · ${op.kind}`).toEqual(oldSeen.rolls);
      }
    });
  }
});

describe('счёт максимумов и единиц — по оставленным главным костям', () => {
  const d20: DieConstant = { kind: 'die', label: 'к20', dice: [{ count: 1, sides: 20 }] };
  const worst: RollEdit = { label: 'помеха', ops: [{ op: 'addDie', count: 1 }, { op: 'keepWorst', n: 1 }] };
  const bless: RollEdit = { label: 'благословение', ops: [{ op: 'bonusDie', sides: 4 }] };

  it('помеха: выпало 20 и 3, оставлена 3 — максимума нет', () => {
    const roll = result(start(parse(d20), [worst], replay([20, 3])));
    expect(roll.natural).toBe(3);
    expect(roll.atMax).toBe(0);
  });

  it('кость сверх на максимуме — не максимум ведущей кости', () => {
    const roll = result(start(parse(d20), [bless], replay([7, 4])));
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
    expect(parse('2к6').terms).toEqual([{ count: 2, sides: 6 }]);
    expect(parse('к20').terms).toEqual([{ count: 1, sides: 20 }]);
    expect(parse(' 2d6 ').terms).toEqual([{ count: 2, sides: 6 }]);
    expect(() => parse('два кубика')).toThrow(/не понимаю/);
  });

  it('умножение записи множит все части', () => {
    expect(times(parse('2к6'), 3).terms[0]!.count).toBe(6);
  });

  it('отбор не трогает кость сверх и чужие части', () => {
    const dice = [
      { id: 0, sides: 6, face: 6, value: 6, part: 'надежда' },
      { id: 1, sides: 6, face: 2, value: 2 },
      { id: 2, sides: 6, face: 5, value: 5 },
      { id: 3, sides: 4, face: 4, value: 4, extra: true },
    ];
    expect(keep(dice, 1, 'best', 'unnamed').map(d => d.id)).toEqual([0, 2, 3]);
    expect(keep(dice, 1, 'worst', 'main').map(d => d.id)).toEqual([1, 3]);
  });
});

describe('бросок — одна функция, стороны явные', async () => {
  const { throwDice, diceTools } = await import('../src/core/roll.ts');
  const { Views } = await import('../src/core/view.ts');
  const world = SAMPLE_WORLDS.find(w => w.system.id === 'dnd5e')!;
  const base = flattenSystem(world.system);
  const advantage = Object.entries(base.roll_edits ?? {}).find(([, e]) => (e.ops ?? []).some(op => op.op === 'keepBest'))![0];
  const system = { ...base, effects: { ...base.effects, лежит: { label: 'лежит', activation: 'passive', modifiers: [
    { kind: 'edit', call: 'roll', param: 'edits', as: 'against', edit: advantage },
  ] } as never } };
  const attacker = world.sheets.find((s: { id: string }) => s.id === 'orc')!;
  const target = { ...world.sheets.find((s: { id: string }) => s.id === 'arven')!, effects: [{ effectId: 'лежит' }] };
  const views = new Views(system, world.compendium);

  it('правка «по мне» с противника работает в любом броске, где он — против', () => {
    const spec = parse('к20');
    const plain = throwDice({ spec, roller: views.of([attacker, target], attacker.id), against: null, tags: [], claims: [], die: replay([3, 18]) });
    const versus = throwDice({ spec, roller: views.of([attacker, target], attacker.id), against: views.of([attacker, target], target.id), tags: [], claims: [], die: replay([3, 18]) });
    expect(plain.result.total).toBe(3);
    expect(versus.result.total).toBe(18);
  });

  it('кинуть(…, оставить) идёт через тот же отбор', () => {
    const tools = diceTools(replay([2, 6, 4]));
    expect(tools.roll!('к6', 3, 2)).toBe(10);
    expect(diceTools(replay([2, 6, 4])).roll!('к6', 3, -1)).toBe(2);
    expect(diceTools().peak!('2к6', 2)).toBe(24);
    expect(diceTools(replay([5])).roll!('к6', 0)).toBe(0);
  });
});
