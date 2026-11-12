import { describe, it, expect } from 'vitest';
import { parse, start, result, addTo, addendsText } from '../src/core/dice.ts';
import { dieAddend } from '../src/core/dice-addend.ts';
import { rollEdits } from '../src/core/edits.ts';
import { newPass } from '../src/engine/calc.ts';
import { lintSystem } from '../src/model/lint.ts';
import { compile } from '../src/formula/index.ts';
import type { PendingAddend } from '../src/core/dice.ts';
import type { DieConstant, Die, RollEdit, System, Sheet } from '../src/model/types.ts';

const к20 = { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } as DieConstant;

const queue = (...values: number[]): Die => () => values.shift() ?? 1;

const bare = { tables: {}, effects: {} } as unknown as System;

const plusDie = (label: string, notation: string, minus = false): PendingAddend =>
  dieAddend(label, bare, { die: { expr: notation }, ...(minus ? { minus: true } : {}) }, {
    number: ref => Number(compile(String((ref as { expr: string }).expr)).evaluate(() => 0)),
    text: ref => (ref as { expr: string }).expr,
  });

const advantage = { label: 'Преимущество', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }] } as RollEdit;

describe('прибавки броска', () => {
  it('кость прибавки кидается после набора, преимущество её не отбрасывает, натуральная — только набор', () => {
    const die = queue(7, 19, 3);
    const roll = addTo(start(parse(к20), [advantage], die), [plusDie('Благословлён', '1к4')], die);
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
    const roll = addTo(start(parse(к20), [reliable], die), [plusDie('Порча', '1к4', true)], die);
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
      advantage: { label: 'Преимущество', ops: [{ op: 'plus', die: '1к6' }], cancels: ['disadvantage'] },
      disadvantage: { label: 'Помеха', ops: [{ op: 'plus', die: '1к6', minus: true }], cancels: ['advantage'] },
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

  it('линт: неизвестное действие, «прибавить» без формулы, прибавка не «add», кинуть в условии правки', () => {
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
    expect(texts).toContain('здесь кости не бросают — бросок делает шаг «Бросок» в эффекте');
  });

  it('линт: кость как число, «кинуть» вне броска и в слове, «гасится» в пустоту', () => {
    const broken = {
      ...system,
      roll_edits: { a: { label: 'А', ops: [{ op: 'plus', value: { expr: 'к4 + 1' } }, { op: 'plus', value: { expr: 'кинуть(к4)' } }], cancels: ['нет_такого'] } },
      effects: {
        урон: { label: 'Урон', activation: 'manual', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [] },
        x: {
          label: 'Икс', activation: 'passive',
          modifiers: [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'add', value: { expr: 'кинуть(к6)' } }],
          on: [{ on: 'seen', if: { expr: 'кинуть(к20) > 10' }, steps: [] }],
        },
      },
    } as unknown as System;
    const texts = lintSystem(broken).map(p => p.text);
    expect(texts).toContain('в формуле «к4 + 1» кость стоит как число — кости бросает шаг «Бросок»: поставьте его перед этим шагом и возьмите его итог (@имя)');
    expect(texts).toContain('у правки броска «А»: кость прибавки выберите в «Сколько», а не формулой');
    expect(texts.filter(text => text === 'здесь кости не бросают — бросок делает шаг «Бросок» в эффекте')).toHaveLength(2);
    expect(texts).toContain('правка броска «А» гасит слово «нет_такого», которого нет в словаре');
  });
});
