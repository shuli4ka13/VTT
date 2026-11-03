import { describe, it, expect } from 'vitest';
import { perform } from '../src/core/perform.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const world = (number: string, die: Record<string, unknown>, extra: Record<string, unknown> = {}) => flattenSystem({
  id: 'с', name: 'с', tags: {}, effects: {},
  constants: { кость: { label: 'Кость', kind: 'die', ...die } },
  rolls: { проверка: { label: 'Проверка', die: 'кость', number, fields: [{ table: 'лист', column: 'навык', ...extra }] } },
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
});
