import { describe, it, expect } from 'vitest';
import { parse, start, result, claimOf, PLUS_OP } from '../src/core/dice.ts';
import { editPalette } from '../src/engine/roll-edits.ts';
import { shapeOf, numbersOf, kindOfRule, placesOf, fitsPlace, kindsOf, countUnread } from '../src/model/die-kinds.ts';
import { lintSystem } from '../src/model/lint.ts';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { RollKind } from '../src/words/dice-kinds.ts';
import type { System, DieConstant, RollEdit } from '../src/model/types.ts';

const die = (extra: Record<string, unknown>): DieConstant => ({ label: 'кость', kind: 'die', ...extra } as DieConstant);
const DICE: Record<RollKind, DieConstant[]> = {
  one: [die({ dice: [{ sides: 20 }] }), die({ dice: [{ sides: 100 }] }), die({ dice: [{ sides: 6 }] })],
  sum: [die({ dice: [{ count: 2, sides: 6 }] })],
  best: [die({ dice: [{ count: 2, sides: 6 }], read: 'best' })],
  hits: [die({ dice: [{ count: 3, sides: 6 }], read: { kind: 'count', atLeast: 5 } })],
  parts: [die({ dice: [{ sides: 12, name: 'а' }, { sides: 12, name: 'б' }] })],
};
const SEQUENCES: ((n: number, sides: number) => number)[] = [
  () => 1, (_, sides) => sides, (_, sides) => Math.ceil(sides / 2), (n, sides) => (n % 2 ? sides : 1), (n, sides) => (n % 2 ? 1 : sides),
  (n, sides) => [7, 2, 5, 3, 1, 4][n % 6]! % sides + 1, (n, sides) => [4, 6, 5, 2][n % 4]! % sides + 1,
];
const ROLLS = SEQUENCES;
const makeRoll = (at: number) => { let n = 0; return (sides: number) => SEQUENCES[at]!(n++, sides); };

const system = (constants: Record<string, unknown>, rolls: Record<string, unknown>, extra: Record<string, unknown> = {}): System => ({
  id: 'к', name: 'к', tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'сила', label: 'Сила', kind: 'number', default: 2 }] } },
  constants, rolls, effects: {}, ...extra,
} as unknown as System);
const rule = (dieKey: string, number?: string) => ({ label: 'Проверка', die: dieKey, ...(number ? { number } : {}), fields: [{ table: 'лист', column: 'сила' }] });

describe('виды костей', () => {
  it('форма кости решает, чем может быть число поля', () => {
    expect(shapeOf(DICE.one[0]!)).toBe('sum');
    expect(numbersOf(DICE.one[0]!)).toEqual(['bonus', 'under', 'over', 'count', 'sides']);
    expect(numbersOf(DICE.best[0]!)).toEqual(['count', 'bonus', 'under', 'over']);
    expect(numbersOf(DICE.hits[0]!)).toEqual(['count', 'bonus', 'over']);
    expect(numbersOf(DICE.parts[0]!)).toEqual(['bonus', 'under', 'over']);
    expect(numbersOf(DICE.parts[0]!, true)).toEqual(['sides']);
  });

  it('вид места броска: одна кость становится «несколько в сумму», когда число костей задаёт поле', () => {
    const sys = system({ к20: DICE.one[0], пул: DICE.hits[0] }, { а: rule('к20'), б: rule('к20', 'count'), в: rule('пул', 'count') });
    expect(Object.values(sys.rolls!).map(one => kindOfRule(sys, one).kind)).toEqual(['one', 'sum', 'hits']);
  });

  it('места броска — и правила, и шаги со своей костью', () => {
    const sys = system({ к20: DICE.one[0] }, { а: rule('к20') }, {
      effects: { удар: { label: 'Удар', params: [], steps: [{ id: 'урон', type: 'roll', die: { expr: '2к6' } }, { id: 'ещё', type: 'roll', die: { expr: '@оружие.кость' } }] } },
    });
    expect(placesOf(sys).map(place => place.kind)).toEqual(['one', 'sum', null]);
    const quoted = system({}, {}, { effects: { удар: { label: 'Удар', params: [], steps: [{ id: 'а', type: 'roll', die: { expr: "'2к6'" } }, { id: 'б', type: 'roll', die: { expr: '1к6' }, times: { expr: '3' } }] } }, initiative: { die: { expr: '1к6' }, count: { expr: '@n' } } });
    expect(placesOf(quoted).map(place => place.kind)).toEqual(['sum', 'sum', 'sum']);
    expect(kindsOf(sys)).toEqual(['one', 'sum']);
  });

  it('каждое действие правки, предложенное виду, меняет бросок каждой подходящей кости этого вида', () => {
    const idle: string[] = [];
    const seen = (spec: ReturnType<typeof parse>, ops: unknown[], roll: (sides: number) => number) => {
      const edits = ops.length ? [{ label: 'правка', ops } as unknown as RollEdit] : [];
      const claim = claimOf(spec, edits);
      const out = result(start(spec, edits as never, roll as never));
      return JSON.stringify([out.total, out.parts, claim.versusShift, claim.degreeShift]);
    };
    for (const [kind, dice] of Object.entries(DICE) as [RollKind, DieConstant[]][]) {
      for (const entry of editPalette().filter(one => one.op.op !== PLUS_OP)) {
        const paired = entry.op.op === 'keepBest' || entry.op.op === 'keepWorst' || entry.op.op === 'wild';
        const base = paired ? [{ op: 'addDie' }] : [];
        const variants = entry.op.op === 'dieStep' ? [entry.op, { ...entry.op, by: -1 }] : [entry.op];
        for (const one of dice) {
          const sides = (one.dice ?? []).map(term => term.sides);
          if (!fitsPlace(entry.op, { kind, sides })) continue;
          const spec = parse(one);
          const changes = variants.some(op => ROLLS.some((_, at) => seen(spec, [...base, op], makeRoll(at)) !== seen(spec, base, makeRoll(at))));
          if (!changes) idle.push(`${kind} к${sides.join('+')}: ${entry.label}`);
        }
      }
    }
    expect(idle).toEqual([]);
  });

  it('«Проблемы»: дикий кубик без набора с успехами и переворот цифр без к100 — замечания; с подходящей костью — чисто', () => {
    const texts = (sys: System) => lintSystem(sys).map(one => one.text).filter(text => text.includes('ничего не изменит'));
    const edits = { roll_edits: { дикий: { label: 'Дикий', ops: [{ op: 'wild' }] }, цифры: { label: 'Цифры', ops: [{ op: 'flip' }] } } };
    expect(texts(system({ к20: DICE.one[0] }, { а: rule('к20') }, edits)).length).toBe(2);
    expect(texts(system({ к100: DICE.one[1], пул: DICE.hits[0] }, { а: rule('к100', 'under'), б: rule('пул', 'count') }, edits))).toEqual([]);
    expect(texts(system({}, {}, edits))).toEqual([]);
  });

  it('«Проблемы»: число поля не по форме кости и счётчик, который никто не читает', () => {
    const texts = (sys: System) => lintSystem(sys).map(one => one.text);
    expect(texts(system({ пул: DICE.hits[0] }, { а: rule('пул', 'under') })).some(text => text.includes('не подходит кости'))).toBe(true);
    const counted = system({ к6: DICE.sum[0] }, { а: rule('к6', 'count') });
    expect(countUnread(counted, 'к6')).toBe(true);
    expect(texts(counted).some(text => text.includes('счётчик никто не читает'))).toBe(true);
    expect(countUnread(system({ к6: DICE.sum[0] }, { а: rule('к6') }), 'к6')).toBe(false);
  });

  it('«Проблемы»: «ноль костей» без «сколько костей» и «Итог», читающий порог, — ошибки', () => {
    const errors = (sys: System) => lintSystem(sys).filter(one => one.level === 'error').map(one => one.text);
    const zeroed = system({ к20: DICE.one[0] }, { а: { ...rule('к20'), zero: { count: 2 } } });
    expect(errors(zeroed).some(text => text.includes('если костей ноль'))).toBe(true);
    const early = system({ к20: DICE.one[0] }, { а: { ...rule('к20', 'under'), total: { expr: '@порог - @выпало' } } });
    expect(errors(early).some(text => text.includes('«Итог» считается раньше'))).toBe(true);
    const fine = system({ к20: DICE.one[0] }, { а: { ...rule('к20'), total: { expr: '@число - @выпало' } } });
    expect(errors(fine)).toEqual([]);
  });

  it('у образцов новых замечаний нет', () => {
    const fresh = (sys: System) => lintSystem(sys).map(one => one.text).filter(text => text.includes('ничего не изменит') || text.includes('не подходит кости') || text.includes('счётчик никто не читает'));
    for (const world of [...SAMPLE_WORLDS, ...LITE_WORLDS]) expect(fresh(flattenSystem(world.system)), world.system.name).toEqual([]);
  });
});
