import { describe, it, expect } from 'vitest';
import { usageIndex, inUse, usersOf } from './usage.ts';
import { SAMPLE_SYSTEMS, SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { System, Compendium } from '@vtt/schema';

const dnd = SAMPLE_SYSTEMS[0] as System;
const book = SAMPLE_WORLDS[0]!.compendium as Compendium;

describe('индекс использования вместо поиска подстроки', () => {
  it('кость инициативы и общий эффект урона — в ходу', () => {
    const index = usageIndex(dnd, book);
    expect(inUse(index, 'constant', 'lead_die')).toBe(true);
    expect(inUse(index, 'event', 'damage')).toBe(true);
    expect(inUse(index, 'constant', 'нет_такой')).toBe(false);
  });

  it('кто смотрит на поле — подписи экрана без повторов', () => {
    const index = usageIndex(dnd, book);
    const users = usersOf(index, 'field', 'abilities.dex.mod', dnd);
    expect(users.length).toBeGreaterThan(0);
    expect(new Set(users).size).toBe(users.length);
    expect(users.some(u => u.startsWith('Лист · поле'))).toBe(true);
  });

  it('совпадение подстроки больше не считается использованием', () => {
    const system = {
      tables: { лист: { shape: 'single', columns: [{ key: 'a', label: 'А', expr: '1' }] } },
      effects: { x: { label: 'кость d20 в названии', activation: 'manual', steps: [] } },
      constants: { d20: { kind: 'die', dice: [{ sides: 20 }] } },
    } as unknown as System;
    expect(inUse(usageIndex(system), 'constant', 'd20')).toBe(false);
  });
});
