import { describe, it, expect } from 'vitest';
import { parse, start, result, addTo, addendsText } from '../src/core/dice.ts';
import { rollEdits } from '../src/core/edits.ts';
import { newPass } from '../src/engine/calc.ts';
import { lintSystem } from '../src/model/lint.ts';
import { compile } from '../src/formula/index.ts';
import type { PendingAddend } from '../src/core/dice.ts';
import type { DieConstant, Die, RollEdit, System, Sheet } from '../src/model/types.ts';

const к20 = { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } as DieConstant;

const queue = (...values: number[]): Die => () => values.shift() ?? 1;

const plusDie = (label: string, expr: string): PendingAddend => ({
  label,
  value: die => Number(compile(expr).evaluate(() => 0, {
    roll: (notation, many) => {
      const rolled = start(parse(notation), [], die);
      return result(rolled).total * Math.max(1, Math.floor(many));
    },
  })),
});

const advantage = { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } as RollEdit;

describe('прибавки броска', () => {
  it('кость прибавки кидается после набора, преимущество её не отбрасывает, натуральная — только набор', () => {
    const die = queue(7, 19, 3);
    const roll = addTo(start(parse(к20), [advantage], die), [plusDie('Благословлён', 'кинуть(к4)')], die);
    const now = result(roll);
    expect(now.dice.rolls).toEqual([7, 19]);
    expect(now.natural).toBe(19);
    expect(now.total).toBe(22);
    expect(roll.addends).toEqual([{ label: 'Благословлён', value: 3, dice: [{ sides: 4, value: 3 }] }]);
    expect(now.edited).toBe(true);
  });

  it('«не меньше 10» и переброс единиц не трогают прибавку', () => {
    const reliable = { label: 'Надёжный', ops: [{ op: 'floorDie', least: 10 }] } as RollEdit;
    const die = queue(4, 1);
    const roll = addTo(start(parse(к20), [reliable], die), [plusDie('Порча', '-кинуть(к4)')], die);
    expect(result(roll).total).toBe(9);
    expect(roll.addends[0]!.dice).toEqual([{ sides: 4, value: 1 }]);
  });

  it('текст прибавок: кость, знак, число без кости', () => {
    expect(addendsText([
      { label: 'Благословлён', value: 3, dice: [{ sides: 4, value: 3 }] },
      { label: 'Под порчей', value: -2, dice: [{ sides: 4, value: 2 }] },
      { label: 'Замедлен', value: -2, dice: [] },
    ])).toBe(' + Благословлён к4: 3 − Под порчей к4: 2 − Замедлен: 2');
  });
});

describe('слово словаря прибавляет', () => {
  const system = {
    id: 'с', name: 'с', tables: { лист: { shape: 'single', owner: 'sheet', columns: [] } }, effects: {},
    roll_edits: {
      advantage: { label: 'Преимущество', ops: [{ op: 'plus', value: { expr: 'кинуть(к6)' } }], canceledBy: 'disadvantage' },
      disadvantage: { label: 'Помеха', ops: [{ op: 'plus', value: { expr: '-кинуть(к6)' } }], canceledBy: 'advantage' },
    },
  } as unknown as System;
  const sheet = { id: 'я', systemId: 'с', name: 'я', values: {}, has: [], effects: [] } as unknown as Sheet;
  const roller = newPass(system, sheet);

  it('заявка «Преимущество» даёт прибавку к6 и не пишется словом броска', () => {
    const { edits, addends } = rollEdits([], ['advantage'], roller);
    const die = queue(9, 4);
    const roll = addTo(start(parse(к20), edits, die), addends, die);
    expect(roll.edits).toEqual([]);
    expect(roll.addends).toEqual([{ label: 'Преимущество', value: 4, dice: [{ sides: 6, value: 4 }] }]);
    expect(result(roll).total).toBe(13);
  });

  it('преимущество и помеха гасят друг друга — прибавок нет', () => {
    expect(rollEdits([], ['advantage', 'disadvantage'], roller).addends).toEqual([]);
  });

  it('линт: неизвестное действие, «прибавить» без формулы, прибавка не «add», кинуть в условии', () => {
    const broken = {
      ...system,
      roll_edits: { a: { label: 'А', ops: [{ op: 'bonusDice' }] }, b: { label: 'Б', ops: [{ op: 'plus' }] } },
      effects: {
        x: {
          label: 'Икс', activation: 'passive', modifiers: [
            { kind: 'edit', call: 'roll', param: 'bonus', op: 'mul', value: { expr: '2' } },
            { kind: 'edit', call: 'roll', param: 'bonus', op: 'add', value: { expr: '1' }, if: { expr: 'кинуть(к20) > 10' } },
          ],
        },
      },
    } as unknown as System;
    const texts = lintSystem(broken).map(p => p.text);
    expect(texts).toContain('у правки броска «А» неизвестное действие «bonusDice»');
    expect(texts).toContain('у правки броска «Б» «прибавить» без формулы');
    expect(texts).toContain('прибавка к броску только прибавляет, а здесь «mul»');
    expect(texts).toContain('в условии правки кости не бросают — «кинуть» уберите');
  });
});
