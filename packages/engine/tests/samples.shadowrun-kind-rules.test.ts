import { describe, it, expect } from 'vitest';
import { collectModifiers } from '../src/engine/modifiers.ts';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import type { Sheet } from '../src/model/types.ts';

const RULES: Record<string, string[]> = {
  'Матрица: рана и шум': ['person', 'runner'],
  'Астральное восприятие: помеха мирскому': ['person', 'runner'],
  'Корпус транспорта': ['vehicle'],
  'Скоростной интервал: штраф к атакам': ['vehicle'],
};

describe('Shadowrun: правила рода листа выданы типам висящими эффектами', () => {
  for (const world of [...SAMPLE_WORLDS, ...LITE_WORLDS].filter(one => one.title.includes('Shadowrun'))) {
    const system = flattenSystem(world.system);
    const sources = (of: string): string[] => {
      const sheet = { id: 'л', systemId: system.id, name: 'л', of, values: {}, has: [], effects: [] } as unknown as Sheet;
      const found = collectModifiers(system, sheet, { records: [] } as never);
      return [...found.edits.values()].flat().map(mod => mod.source.label);
    };

    it(`${world.title}: каждое правило действует на свои типы (и наследников) и не действует на чужие`, () => {
      for (const kind of Object.keys(system.sheets ?? {})) {
        const got = sources(kind);
        for (const [rule, kinds] of Object.entries(RULES)) expect(got.includes(rule), `${rule} → ${kind}`).toBe(kinds.includes(kind));
      }
    });

    it(`${world.title}: у типов листов правок вызова и броска нет`, () => {
      const edits = Object.values(system.sheets ?? {}).flatMap(kind => kind.modifiers ?? []).filter(mod => mod.kind === 'edit');
      expect(edits).toEqual([]);
    });
  }
});
