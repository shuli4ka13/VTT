import { describe, it, expect } from 'vitest';
import { foreignKeys, foreignKeysText } from '../src/model/latin-keys.ts';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';
import type { System } from '../src/model/types.ts';

describe('ключи латиницей', () => {
  it('в образцах нет ключей кириллицей', () => {
    for (const world of [...SAMPLE_WORLDS, ...LITE_WORLDS]) {
      expect({ system: (world.system as System).name, keys: foreignKeys(world.system as System) }).toEqual({ system: (world.system as System).name, keys: [] });
    }
  });

  it('система с русскими ключами получает одно замечание со счётом и примерами', () => {
    const system = {
      tables: { лист: { shape: 'single', owner: 'sheet', columns: [{ key: 'сила', kind: 'number' }, { key: 'hp', kind: 'number' }] } },
      effects: { удар: { params: [{ key: 'цель', kind: 'sheet' }], steps: [{ type: 'roll', id: 'бросок' }] } },
    } as unknown as System;
    expect(foreignKeys(system).sort()).toEqual(['бросок', 'лист', 'сила', 'удар', 'цель']);
    expect(foreignKeysText(system)).toContain('ключей не латиницей: 5');
    expect(foreignKeysText({ effects: {} } as unknown as System)).toBeNull();
  });
});
