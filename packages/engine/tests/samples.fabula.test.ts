import { describe, it, expect } from 'vitest';
import { LITE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { exchange } from './play.ts';
import { perform } from '../src/core/perform.ts';
import type { Sheet } from '../src/model/types.ts';

const world = LITE_WORLDS.find(one => one.system.id === 'fabula-ultima')!;
const system = flattenSystem(world.system);

const dice = (...values: number[]) => {
  const sides: number[] = [];
  const die = (faces: number) => { sides.push(faces); return values.shift() ?? 1; };
  return { die, sides };
};

const hp = (sheets: Sheet[], id: string): number => Number((sheets.find(one => one.id === id)!.values as Record<string, unknown>)['оз']);

const check = (rolled: number[], first: string, second: string, difficulty: number) => {
  const thrown = dice(...rolled);
  const out = exchange({
    system, compendium: world.compendium, die: thrown.die, sheets: world.sheets,
    actionId: 'check:0', fromId: 'герой', inputs: { первая: first, вторая: second, сложность: difficulty },
  } as never);
  return { log: out.log.join('\n'), sides: thrown.sides };
};

const attack = (rolled: number[]) => exchange({
  system, compendium: world.compendium, die: dice(...rolled).die, sheets: world.sheets,
  actionId: 'weapon_example:0', fromId: 'герой', toId: 'противник',
} as never);

describe('Fabula Ultima: проверка двумя костями характеристик', () => {
  it('грани костей — значения двух характеристик листа', () => {
    expect(check([4, 3], 'ловкость', 'сила', 10).sides).toEqual([10, 8]);
    expect(check([4, 3], 'воля', 'воля', 10).sides).toEqual([6, 6]);
  });

  it('сумма не меньше сложности — успех', () => {
    expect(check([4, 3], 'ловкость', 'сила', 10).log).toContain('провал');
    expect(check([6, 4], 'ловкость', 'сила', 10).log).toContain('успех');
  });

  it('дубль от шестёрок — успех при любой сложности, две единицы — провал при любой', () => {
    expect(check([6, 6], 'ловкость', 'ловкость', 13).log).toContain('успех, степень критический успех');
    expect(check([5, 5], 'ловкость', 'ловкость', 13).log).toContain('провал');
    expect(check([1, 1], 'ловкость', 'сила', 2).log).toContain('провал, степень критический провал');
  });
});

describe('Fabula Ultima: атака и лекарство', () => {
  it('меткость — две кости оружия и его прибавка против Защиты; урон — старшая кость плюс число оружия', () => {
    expect(hp(attack([7, 2]).sheets, 'противник')).toBe(23);
    expect(hp(attack([2, 3]).sheets, 'противник')).toBe(40);
  });

  it('лекарство возвращает 50 очков здоровья, не выше максимума', () => {
    const hurt = world.sheets.map(sheet => (sheet.id === 'герой' ? { ...sheet, values: { ...sheet.values, оз: 10 } } : sheet)) as Sheet[];
    const out = exchange({ system, compendium: world.compendium, die: () => 1, sheets: hurt, actionId: 'remedy:0', fromId: 'герой' } as never);
    expect(hp(out.sheets, 'герой')).toBe(50);
  });
});

const click = (rolled: number[], tag: string, more: Record<string, unknown> = {}) => {
  const thrown = dice(...rolled);
  const out = perform({ system, compendium: world.compendium, clock: null, sheets: world.sheets, die: thrown.die } as never, { op: 'roll', sheetId: 'герой', tag, ...more } as never);
  if (out.kind !== 'done') throw new Error('бросок спросил');
  return { log: out.log.join('\n'), sides: thrown.sides };
};

describe('Fabula Ultima: проверка щелчком по характеристике листа', () => {
  it('одна характеристика — её кость бросается дважды; вторая названа — кости двух характеристик', () => {
    expect(click([4, 3], 'ловкость').sides).toEqual([10, 10]);
    const both = click([4, 3], 'ловкость', { second: 'сила' });
    expect(both.sides).toEqual([10, 8]);
    expect(both.log).toContain('Проверка: Ловкость + Сила');
    expect(both.log).toContain('= 7');
  });

  it('без сложности бросок — просто число, без «успех» и «провал»', () => {
    const out = click([4, 3], 'ловкость', { second: 'сила' }).log;
    expect(out).not.toContain('успех');
    expect(out).not.toContain('провал');
  });

  it('сложность, названная перед броском: сумма не меньше её — успех', () => {
    expect(click([4, 3], 'ловкость', { second: 'сила', versus: 10 }).log).toContain('порог 10: провал');
    expect(click([6, 4], 'ловкость', { second: 'сила', versus: 10 }).log).toContain('порог 10: успех');
  });

  it('дубль от шестёрок — успех при любой сложности и виден без неё, две единицы — провал', () => {
    expect(click([6, 6], 'ловкость', { versus: 13 }).log).toContain('успех · критический успех');
    expect(click([6, 6], 'ловкость').log).toContain('критический успех');
    expect(click([1, 1], 'ловкость', { second: 'сила', versus: 2 }).log).toContain('провал · критический провал');
  });

  it('второе поле из другого броска или у обычного броска — отказ', () => {
    expect(() => click([1, 1], 'ловкость', { second: 'защита' })).toThrow();
  });
});
