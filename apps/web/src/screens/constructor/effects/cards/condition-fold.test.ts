import { describe, it, expect } from 'vitest';
import type { System } from '@vtt/schema';
import { whenWords } from './condition-fold.tsx';

const system = {
  fields: [], constants: {}, effects: {},
  tables: { damage_types: { label: 'Типы урона', key: 'word', columns: [{ key: 'armor', label: 'Броня', kind: 'choice', from: 'armor_pass' }], rows: [] } },
} as unknown as System;

describe('пересказ условия по меткам вызова', () => {
  it('метка и строка метки — словами, без ключей', () => {
    const when = { ref: 'event.tags', has: 'по телу', where: { table: 'damage_types', column: 'armor', is: 'через броню' } };
    expect(whenWords(when, [], system)).toBe('метки вызова: есть «по телу» и у метки «Броня» = «через броню»');
  });

  it('только строка метки', () => {
    const when = { ref: 'event.tags', where: { table: 'damage_types', column: 'armor', is: 'мимо брони' } };
    expect(whenWords(when, [], system)).toBe('метки вызова: у метки «Броня» = «мимо брони»');
  });
});
