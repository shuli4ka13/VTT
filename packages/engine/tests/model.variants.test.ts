import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import type { System } from '../src/model/types.ts';

const worldOf = (id: string) => SAMPLE_WORLDS.find(world => world.system.id === id)!;
const copy = (id: string): System => structuredClone(worldOf(id).system) as System;
const words = (system: System, id: string): string[] =>
  errorsOf(lintSystem(flattenSystem(system), worldOf(id).compendium)).map(p => p.text).filter(text => text.includes('такого варианта нет'));

const swap = (system: System, from: string, to: string): System => JSON.parse(JSON.stringify(system).replace(from, to)) as System;

describe('слово не из вариантов — ошибка «Проблем»', () => {
  it('условие по итогу «исход»', () => {
    const system = copy('dnd5e');
    system.effects.strike!.steps!.splice(2, 0, { type: 'branch', if: { expr: '@бросок.исход == "критт"' } } as never, { type: 'end' } as never);
    expect(words(system, 'dnd5e')).toEqual([expect.stringContaining('«критт» — в таблице «Исход атаки» такого варианта нет')]);
  });

  it('слово в формуле самого итога', () => {
    const system = swap(copy('dnd5e'), '"крит\\", \\"попадание\\"', '"критт\\", \\"попадание\\"');
    expect(words(system, 'dnd5e')).toEqual([expect.stringContaining('итог «исход»: «критт»')]);
  });

  it('ступень проверки', () => {
    const system = swap(copy('blades'), '@бросок.degree == \\"провал\\"', '@бросок.degree == \\"провл\\"');
    expect(words(system, 'blades')).toEqual([expect.stringContaining('«провл»')]);
  });

  it('колонка вещи — класс оружия', () => {
    const system = swap(copy('shadowrun6'), 'не @режим.always и не', '@вещь.class != \\"луук\\" и не @режим.always и не');
    expect(words(system, 'shadowrun6')).toEqual([expect.stringContaining('«луук» — в таблице «Классы оружия»')]);
  });
});
