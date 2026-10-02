import { describe, it, expect } from 'vitest';
import { followKey, referenced, effectUsed, paramUsed } from './keys.ts';
import type { System } from '@vtt/schema';

describe('имя идёт за названием, пока на него никто не ссылается', () => {
  const world = (formula: string) => ({ effects: { удар: { params: [{ key: 'вход', label: 'Новый вход' }], steps: [{ value: { expr: formula } }] } } });

  it('автоимя без ссылок следует за названием', () => {
    expect(followKey({ used: referenced(world('1'), 'вход'), key: 'вход', base: 'вход', before: 'Новый вход', after: 'Кость урона', taken: ['вход'] })).toBe('кость_урона');
  });

  it('на имя ссылается формула — имя остаётся', () => {
    expect(referenced(world('@вход + 1'), 'вход')).toBe(true);
    expect(followKey({ used: referenced(world('@вход + 1'), 'вход'), key: 'вход', base: 'вход', before: 'Новый вход', after: 'Кость урона', taken: ['вход'] })).toBe('вход');
  });

  it('имя, заданное руками, не перетирается названием', () => {
    expect(followKey({ used: false, key: 'damage_dice', base: 'вход', before: 'Кость урона', after: 'Кости урона', taken: ['damage_dice'] })).toBe('damage_dice');
  });
});

describe('имя шага локально для эффекта', () => {
  it('такое же имя шага в другом эффекте не блокирует', () => {
    const own = { steps: [{ id: 'проверка' }] };
    const world = { effects: { а: own, б: { steps: [{ id: 'проверка' }] } } };
    expect(referenced(world, 'проверка', own)).toBe(false);
  });

  it('подписка другого эффекта читает итог — блокирует', () => {
    const own = { steps: [{ id: 'hit' }] };
    const world = { effects: { а: own, б: { on: [{ if: { expr: '@hit.success' } }] } } };
    expect(referenced(world, 'hit', own)).toBe(true);
  });
});

describe('эффект занят, только если на него ссылаются по смыслу', () => {
  const system = {
    tables: {},
    effects: {
      effect: { label: 'Новый эффект', activation: 'manual', params: [], steps: [] },
      удар: { label: 'Удар', activation: 'manual', params: [], steps: [{ type: 'emit', effect: 'урон' }] },
      урон: { label: 'Урон', params: [], steps: [] },
    },
  } as unknown as System;

  it('имя свойства «effect» в шагах — не ссылка на эффект effect', () => {
    expect(effectUsed(system, undefined, 'effect')).toBe(false);
  });

  it('вызов из шага — ссылка', () => {
    expect(effectUsed(system, undefined, 'урон')).toBe(true);
  });

  it('вход занят своей формулой или аргументом вызова, а не таким же входом чужого эффекта', () => {
    const world = {
      tables: {},
      effects: {
        удар: { params: [{ key: 'цель', kind: 'sheet' }], steps: [{ type: 'emit', effect: 'урон', args: { лист: { expr: '@цель' } } }] },
        урон: { params: [{ key: 'лист', kind: 'sheet' }, { key: 'цель', kind: 'sheet' }], steps: [] },
      },
    } as unknown as System;
    expect(paramUsed(world, undefined, 'урон', 'лист')).toBe(true);
    expect(paramUsed(world, undefined, 'урон', 'цель')).toBe(false);
    expect(paramUsed(world, undefined, 'удар', 'цель')).toBe(true);
  });

  it('вход основы занят, если его читает потомок', () => {
    const world = {
      tables: {},
      effects: {
        заклинание: { params: [{ key: 'круг', kind: 'number' }], steps: [] },
        огненный_шар: { extends: 'заклинание', steps: [{ type: 'roll', fixed: { expr: '@круг * 2' } }] },
      },
    } as unknown as System;
    expect(paramUsed(world, undefined, 'заклинание', 'круг')).toBe(true);
  });
});
