import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';

describe('образцы чисты для проверок конструктора', () => {
  for (const world of SAMPLE_WORLDS) {
    it(world.system.id, () => {
      expect(errorsOf(lintSystem(flattenSystem(world.system), world.compendium)).map(p => p.text)).toEqual([]);
    });
  }
});
