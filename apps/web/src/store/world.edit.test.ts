// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorld, emptySystem } from './world.ts';
import type { System } from '@vtt/schema';

const seed = (): System => {
  const system = emptySystem();
  system.fields.push({ tag: 'hp', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 10 } });
  system.fields.push({ tag: 'ac', label: 'Броня', value: { kind: 'stored', type: 'number', default: 12 } });
  system.effects.hit = { label: 'Удар', activation: 'manual', steps: [] } as never;
  system.effects.heal = { label: 'Лечение', activation: 'manual', steps: [] } as never;
  system.constants = { d20: { kind: 'die', dice: [{ count: 1, sides: 20 }] } } as never;
  return system;
};

describe('точечные редакторы не клонируют всю систему', () => {
  beforeEach(() => { useWorld.setState(state => ({ ...state, system: seed() })); });

  it('editEffect меняет один эффект, остальные и поля — те же объекты', () => {
    const before = useWorld.getState().system;
    useWorld.getState().editEffect('hit', draft => { draft.label = 'Удар мечом'; });
    const after = useWorld.getState().system;
    expect(after.effects.hit!.label).toBe('Удар мечом');
    expect(before.effects.hit!.label).toBe('Удар');
    expect(after.effects.heal).toBe(before.effects.heal);
    expect(after.fields).toBe(before.fields);
    expect(after).not.toBe(before);
  });

  it('editField меняет одно поле, эффекты — те же объекты', () => {
    const before = useWorld.getState().system;
    useWorld.getState().editField('hp', draft => { draft.label = 'Здоровье'; });
    const after = useWorld.getState().system;
    expect(after.fields.find(f => f.tag === 'hp')!.label).toBe('Здоровье');
    expect(before.fields.find(f => f.tag === 'hp')!.label).toBe('Хиты');
    expect(after.fields.find(f => f.tag === 'ac')).toBe(before.fields.find(f => f.tag === 'ac'));
    expect(after.effects).toBe(before.effects);
  });

  it('editRules меняет словари, не трогая эффекты и поля', () => {
    const before = useWorld.getState().system;
    useWorld.getState().editRules(draft => { draft.constants!.d20!.label = 'к20'; });
    const after = useWorld.getState().system;
    expect(after.constants!.d20!.label).toBe('к20');
    expect(before.constants!.d20!.label).toBeUndefined();
    expect(after.effects).toBe(before.effects);
    expect(after.fields).toBe(before.fields);
  });

  it('editRules не даёт подменить эффекты или поля', () => {
    expect(() => useWorld.getState().editRules(draft => { draft.effects = {}; })).toThrow('editRules');
  });

  it('неизвестный эффект или поле — без изменений', () => {
    const before = useWorld.getState().system;
    useWorld.getState().editEffect('нет', draft => { draft.label = 'x'; });
    useWorld.getState().editField('нет', draft => { draft.label = 'x'; });
    expect(useWorld.getState().system).toBe(before);
  });
});
