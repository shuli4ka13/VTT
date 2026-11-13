import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '../src/model/systems.ts';
import { flattenSystem } from '../src/model/inherit.ts';
import { lintSystem, errorsOf } from '../src/model/lint.ts';
import { STEP_WORDS } from '../src/words/steps.ts';
import * as glossary from '../src/words/glossary.ts';

describe('образцы чисты для проверок конструктора', () => {
  for (const world of SAMPLE_WORLDS) {
    it(world.system.id, () => {
      expect(errorsOf(lintSystem(flattenSystem(world.system), world.compendium)).map(p => p.text)).toEqual([]);
    });
  }
});

describe('тексты для человека без «@»', () => {
  const texts = (value: unknown): string[] =>
    typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(texts) : [];

  for (const world of SAMPLE_WORLDS) {
    it(`«Проблемы» образца ${world.system.id}`, () => {
      const found = lintSystem(flattenSystem(world.system), world.compendium).map(p => p.text).filter(text => text.includes('@'));
      expect(found).toEqual([]);
    });
  }

  it('слова шагов и общие слова', () => {
    expect(texts(STEP_WORDS).filter(text => text.includes('@'))).toEqual([]);
    expect(texts(glossary).filter(text => text.includes('@'))).toEqual([]);
  });
});
