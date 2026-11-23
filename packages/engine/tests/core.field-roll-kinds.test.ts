import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const world = (number: string, die: Record<string, unknown>, extra: Record<string, unknown> = {}, common: Record<string, unknown> = {}) => flattenSystem({
  id: 'с', name: 'с', tags: {}, effects: {},
  constants: { кость: { label: 'Кость', kind: 'die', ...die } },
  rolls: { проверка: { label: 'Проверка', die: 'кость', number, ...common, fields: [{ table: 'лист', column: 'навык', ...extra }] } },
  tables: {
    rolls: { label: 'Броски', key: 'word', columns: [], rows: [{ value: 'проверка' }] },
    лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'навык', label: 'Навык', kind: 'number', default: 40 }] },
  },
} as unknown as System);

const hero = (навык: number): Sheet => ({ id: 'г', systemId: 'с', name: 'Герой', values: { навык }, has: [], effects: [] } as unknown as Sheet);
const roll = (system: System, sheet: Sheet, faces: number[]) => {
  const seen: number[] = [];
  const rest = [...faces];
  const out = perform({ system, compendium: { records: [] } as unknown as Compendium, clock: null, sheets: [sheet], die: (sides: number) => { seen.push(sides); return rest.shift() ?? 1; } } as never, { op: 'roll', sheetId: sheet.id, tag: 'навык' } as never);
  if (out.kind !== 'done') throw new Error('бросок спросил');
  return { log: out.log.join('\n'), seen };
};

describe('число поля в броске: грани, не больше, не меньше', () => {
  it('грани по числу: у поля 8 — кидают к8, числа к кости не прибавляют', () => {
    const system = world('sides', { dice: [{ count: 1, sides: 6 }] });
    const out = roll(system, hero(8), [5]);
    expect(out.seen).toEqual([8]);
    expect(out.log).toContain('[5] = 5');
    expect(errorsOf(lintSystem(system))).toEqual([]);
  });

  it('не больше числа: к100 против 40 — 37 успех, 57 провал', () => {
    const system = world('under', { dice: [{ count: 1, sides: 100 }] });
    expect(roll(system, hero(40), [37]).log).toContain('не больше 40: успех');
    expect(roll(system, hero(40), [57]).log).toContain('не больше 40: провал');
    expect(errorsOf(lintSystem(system))).toEqual([]);
  });

  it('не меньше числа: к20 против 12 — 12 успех, 11 провал', () => {
    const system = world('over', { dice: [{ count: 1, sides: 20 }] });
    expect(roll(system, hero(12), [12]).log).toContain('порог 12: успех');
    expect(roll(system, hero(12), [11]).log).toContain('порог 12: провал');
  });

  it('грани у составной кости и свой порог при «не больше» — ошибки «Проблем»', () => {
    const composite = world('sides', { dice: [{ count: 1, sides: 12, name: 'а' }, { count: 1, sides: 12, name: 'б' }] });
    expect(errorsOf(lintSystem(composite)).some(p => p.text.includes('грани кости'))).toBe(true);
    const twice = world('under', { dice: [{ count: 1, sides: 100 }] }, { threshold: { expr: '3' } });
    expect(errorsOf(lintSystem(twice)).some(p => p.text.includes('порог броска — само число поля'))).toBe(true);
  });

  it('оставить лучшие: бросить 5, оставить 2 — сумма двух старших', () => {
    const system = world('count', { dice: [{ count: 1, sides: 10 }] }, {}, { keep: { expr: '2' } });
    expect(roll(system, hero(5), [6, 1, 5, 2, 3]).log).toContain('= 11');
    expect(errorsOf(lintSystem(system))).toEqual([]);
  });

  it('ноль костей — настройка броска: при числе 0 кидают две и берут меньшую', () => {
    const system = world('count', { dice: [{ count: 1, sides: 6 }], read: 'best' }, {}, { zero: { count: 2, keep: 'worst' } });
    const out = roll(system, hero(0), [5, 2]);
    expect(out.seen).toEqual([6, 6]);
    expect(out.log).toContain('= 2');
    expect(roll(system, hero(2), [5, 2]).log).toContain('= 5');
  });

  it('ноль костей срабатывает и у кости из одной части с именем', () => {
    const system = world('count', { dice: [{ count: 1, sides: 6, name: 'набор' }], read: 'best' }, {}, { zero: { count: 2, keep: 'worst' } });
    expect(roll(system, hero(0), [5, 2]).log).toContain('= 2');
  });

  it('«Итог» формулой: число минус выпавшее', () => {
    const system = world('bonus', { dice: [{ sides: 100 }] }, {}, { total: { expr: '@number - @roll.natural' } });
    expect(roll(system, hero(40), [13]).log).toContain('= 27');
  });

  it('«Итог» формулой: первая часть минус вторая', () => {
    const system = world('bonus', { dice: [{ sides: 6, name: 'плюс' }, { sides: 6, name: 'минус' }] }, {}, { total: { expr: '@roll.parts.плюс - @roll.parts.минус + @number' } });
    expect(roll(system, hero(3), [5, 2]).log).toContain('= 6');
  });

  it('степени: к100 против 50 — 9 экстремальный, 24 трудный, 40 обычный, 70 провал без степени', () => {
    const degrees = [
      { label: 'экстремальный успех', if: { expr: '@rolled <= floor(@number / 5)' } },
      { label: 'трудный успех', if: { expr: '@rolled <= floor(@number / 2)' } },
      { label: 'обычный успех', if: { expr: '@rolled <= @number' } },
    ];
    const system = world('under', { dice: [{ count: 1, sides: 100 }] }, {}, { degrees });
    expect(roll(system, hero(50), [9]).log).toContain('· экстремальный успех');
    expect(roll(system, hero(50), [24]).log).toContain('· трудный успех');
    expect(roll(system, hero(50), [40]).log).toContain('· обычный успех');
    expect(roll(system, hero(50), [70]).log).not.toContain('успех ·');
    expect(errorsOf(lintSystem(system))).toEqual([]);
  });

  it('«оставить» без «сколько костей» и сломанная формула степени — ошибки «Проблем»', () => {
    const keep = world('bonus', { dice: [{ count: 1, sides: 20 }] }, {}, { keep: { expr: '1' } });
    expect(errorsOf(lintSystem(keep)).some(p => p.text.includes('оставить лучшие можно'))).toBe(true);
    const bad = world('under', { dice: [{ count: 1, sides: 100 }] }, {}, { degrees: [{ label: 'x', if: { expr: '@rolled <=' } }] });
    expect(errorsOf(lintSystem(bad)).some(p => p.text.includes('степень «x»'))).toBe(true);
  });
});
