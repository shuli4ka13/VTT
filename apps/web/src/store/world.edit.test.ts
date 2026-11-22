// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorld, emptySystem } from './world.ts';
import { useLookup } from './lookup.ts';
import type { System } from '@vtt/schema';
import { fieldOf, fieldsOf } from '@vtt/engine';

const seed = (): System => {
  const system = emptySystem();
  system.tables = { лист: { shape: 'single', columns: [
    { key: 'hp', label: 'Хиты', kind: 'number', default: 10 },
    { key: 'ac', label: 'Броня', kind: 'number', default: 12 },
  ] } };
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
    expect(after.tables).toBe(before.tables);
    expect(after).not.toBe(before);
  });

  it('editColumn меняет одну колонку, эффекты — те же объекты, поля листа пересчитаны', () => {
    const before = useWorld.getState().system;
    useWorld.getState().editColumn('лист', 'hp', draft => { draft.label = 'Здоровье'; });
    const after = useWorld.getState().system;
    expect(fieldOf(after, 'hp')!.label).toBe('Здоровье');
    expect(fieldOf(before, 'hp')!.label).toBe('Хиты');
    expect(after.tables!.лист!.columns![1]).toBe(before.tables!.лист!.columns![1]);
    expect(after.effects).toBe(before.effects);
  });

  it('editSystem правит таблицы на месте — поля листа всё равно свежие', () => {
    expect(fieldOf(useWorld.getState().system, 'hp')!.label).toBe('Хиты');
    useWorld.getState().editSystem(draft => {
      fieldsOf(draft);
      draft.tables!.лист!.columns![0]!.label = 'Жизнь';
    });
    expect(fieldOf(useWorld.getState().system, 'hp')!.label).toBe('Жизнь');
  });

  it('editRules меняет словари, не трогая эффекты', () => {
    const before = useWorld.getState().system;
    useWorld.getState().editRules(draft => { draft.constants!.d20!.label = 'к20'; });
    const after = useWorld.getState().system;
    expect(after.constants!.d20!.label).toBe('к20');
    expect(before.constants!.d20!.label).toBeUndefined();
    expect(after.effects).toBe(before.effects);
  });

  it('editRules не даёт подменить эффекты', () => {
    expect(() => useWorld.getState().editRules(draft => { draft.effects = {}; })).toThrow('editRules');
  });

  it('неизвестный эффект или поле — без изменений', () => {
    const before = useWorld.getState().system;
    useWorld.getState().editEffect('нет', draft => { draft.label = 'x'; });
    useWorld.getState().editColumn('лист', 'нет', draft => { draft.label = 'x'; });
    expect(useWorld.getState().system).toBe(before);
  });
});

describe('справка «Откуда это» и смена системы', () => {
  it('подмена мира целиком закрывает справку: имя из прошлой системы в новой не значит ничего', () => {
    useLookup.getState().show({ name: 'строка.score', label: 'Значение', where: 'Характеристики · Модификатор', table: 'abilities' });
    useWorld.getState().replaceWorld({ system: emptySystem(), compendium: { records: [] }, sheets: [] });
    expect(useLookup.getState().at).toBeNull();
  });
});
