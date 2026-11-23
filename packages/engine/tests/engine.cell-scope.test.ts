import { describe, it, expect } from 'vitest';
import { PLAYABLE_WORLDS } from '../src/model/systems.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { exchange } from './play.ts';
import type { System, Sheet, Compendium } from '../src/model/types.ts';

const dnd = PLAYABLE_WORLDS.find(world => world.system.id === 'dnd5e')!;

const withProbe = (cells: Record<string, string>, chosen = 'цель'): System => {
  const system = structuredClone(dnd.system) as System;
  system.tables.probe = {
    label: 'Проба', key: 'word', columns: [{ key: 'v', label: 'значение', kind: 'number' }],
    rows: Object.entries(cells).map(([value, expr]) => ({ value, cells: { v: { expr } } })),
  } as never;
  system.effects.strike!.params = [...(system.effects.strike!.params ?? []), { key: 'выбор', label: 'Выбор', kind: 'choice', from: 'probe', default: chosen } as never];
  system.effects.strike!.steps!.splice(1, 0, { id: 'проба', type: 'roll', fixed: { expr: '@выбор.v' } } as never);
  return system;
};

const totals = (system: System): number[] => {
  const out = exchange({ system, compendium: dnd.compendium as Compendium, die: () => 10, sheets: dnd.sheets as Sheet[], actionId: 'longsword:0', fromId: 'arven', toIds: ['goblin', 'orc'] });
  return out.reports.flatMap(entry => entry.report.trace.filter(one => (one as { step?: string }).step === 'проба').map(one => (one as { total: number }).total));
};

describe('клетка справочной таблицы, прочитанная из эффекта, видит его имена', () => {
  const cells = { цель: '@aim.abilities.strength.mod', действующий: '@deystvuyuschiy.abilities.strength.mod + 100' };

  it('у каждой цели — своё значение клетки: гоблин −1, орк +3', () => {
    const system = withProbe(cells);
    expect(errorsOf(lintSystem(system)).map(p => p.text)).toEqual([]);
    expect(totals(system)).toEqual([-1, 3]);
  });

  it('другая строка той же колонки читает действующего', () => {
    expect(totals(withProbe(cells, 'действующий'))).toEqual([104, 104]);
  });

  it('поле листа в клетке читается как прежде — без имени эффекта', () => {
    expect(totals(withProbe({ цель: '@aim.abilities.strength.mod', поле: '@level' }, 'поле'))).toEqual([5, 5]);
  });

  it('в клетке работают функции языка: «строки(…)» — как в формуле шага', () => {
    const system = withProbe({ цель: 'sum(rows("abilities", "score"))' });
    system.effects.strike!.steps!.splice(2, 0, { id: 'прямо', type: 'roll', fixed: { expr: 'sum(rows("abilities", "score"))' } } as never);
    const out = exchange({ system, compendium: dnd.compendium as Compendium, die: () => 10, sheets: dnd.sheets as Sheet[], actionId: 'longsword:0', fromId: 'arven', toIds: ['goblin'] });
    const of = (step: string) => out.reports.flatMap(entry => entry.report.trace).find(one => (one as { step?: string }).step === step) as { total: number };
    expect(of('проба').total).toBe(of('прямо').total);
    expect(of('проба').total).toBeGreaterThan(0);
  });

  it('клетка, которая читает сама себя, — понятная ошибка, а не зависание', () => {
    expect(() => totals(withProbe({ цель: '@выбор.v + 1' }))).toThrow(/читает сама себя по кругу/);
  });

  it('«кинуть» в клетке нельзя — кости бросает шаг «Бросок»', () => {
    expect(() => totals(withProbe({ цель: 'roll(d6)' }))).toThrow(/кости бросает шаг «Бросок»/);
  });

  it('«Проблемы»: имя в клетке, которого нет в этом месте эффекта, — ошибка у шага, который читает колонку', () => {
    const problems = errorsOf(lintSystem(withProbe({ ...cells, лишнее: '@нечто + 1' }))).map(p => p.text);
    expect(problems).toEqual([expect.stringContaining('клетка «Проба» → «лишнее» → «значение» читает «нечто»')]);
  });
});
