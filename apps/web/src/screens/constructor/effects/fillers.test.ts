import { describe, it, expect } from 'vitest';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import type { System } from '@vtt/schema';
import { fillersOf } from './fillers.ts';

const dnd = () => structuredClone(SAMPLE_SYSTEMS[0]) as System;

describe('кто заполняет входы эффекта', () => {
  it('«Урон» заполняют вызовы, и всем хватает', () => {
    const fillers = fillersOf(dnd(), 'damage');
    expect(fillers.length).toBeGreaterThan(5);
    expect(fillers.every(f => f.label.startsWith('вызов из'))).toBe(true);
    expect(fillers.filter(f => f.missing.length)).toEqual([]);
  });

  it('«Атаку оружием» заполняет запись «Оружие» кнопкой «Удар»', () => {
    const fillers = fillersOf(dnd(), 'strike');
    expect(fillers.map(f => f.label)).toContain('запись «Оружие» · кнопка «Удар»');
  });

  it('новый обязательный вход сразу виден как нехватка у всех, кто заполняет', () => {
    const system = dnd();
    system.effects.damage!.params!.push({ key: 'новый', label: 'Новый вход', kind: 'number' });
    const short = fillersOf(system, 'damage').filter(f => f.missing.includes('Новый вход'));
    expect(short.length).toBe(fillersOf(system, 'damage').length);
  });
});
