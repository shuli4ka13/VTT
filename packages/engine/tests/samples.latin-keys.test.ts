import { describe, it, expect } from 'vitest';
import { foreignKeys, foreignKeysText } from '../src/model/latin-keys.ts';
import { keyFrom } from '../src/words/key.ts';
import { SAMPLE_WORLDS, LITE_WORLDS } from '../src/model/systems.ts';
import type { System } from '../src/model/types.ts';

describe('ключи латиницей', () => {
  it('в образцах нет ключей кириллицей', () => {
    for (const world of [...SAMPLE_WORLDS, ...LITE_WORLDS]) {
      expect({ system: (world.system as System).name, keys: foreignKeys(world.system as System) }).toEqual({ system: (world.system as System).name, keys: [] });
    }
  });

  it('ключ делается из названия: строчная латиница, прочее — «_», с буквы', () => {
    expect(keyFrom('Кто действует')).toBe('kto_deystvuet');
    expect(keyFrom('Ближний бой — Сила')).toBe('blizhniy_boy_sila');
    expect(keyFrom('Щит ёлки')).toBe('schit_elki');
    expect(keyFrom('1–2 импланта')).toBe('k_1_2_implanta');
    expect(keyFrom('hp max')).toBe('hp_max');
    expect(keyFrom('  ')).toBe('');
  });

  it('имя договора метки в образце — тот ключ, который конструктор сделает из этого слова', () => {
    const off: string[] = [];
    for (const world of [...SAMPLE_WORLDS, ...LITE_WORLDS]) {
      const system = world.system as System;
      for (const [tag, contract] of Object.entries(system.tags ?? {})) {
        for (const [key, word] of Object.entries((contract as { said?: Record<string, string> }).said ?? {})) {
          if (keyFrom(word) !== key) off.push(`${system.name}: метка ${tag}, «${word}» → ${key}`);
        }
      }
    }
    expect(off).toEqual([]);
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
