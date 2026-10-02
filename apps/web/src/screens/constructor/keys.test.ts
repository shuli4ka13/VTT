import { describe, it, expect } from 'vitest';
import { followKey, referenced } from './keys.ts';

describe('имя идёт за названием, пока на него никто не ссылается', () => {
  const world = (formula: string) => ({ effects: { удар: { params: [{ key: 'вход', label: 'Новый вход' }], steps: [{ value: { expr: formula } }] } } });

  it('автоимя без ссылок следует за названием', () => {
    expect(followKey({ world: world('1'), key: 'вход', base: 'вход', before: 'Новый вход', after: 'Кость урона', taken: ['вход'] })).toBe('кость_урона');
  });

  it('на имя ссылается формула — имя остаётся', () => {
    expect(referenced(world('@вход + 1'), 'вход')).toBe(true);
    expect(followKey({ world: world('@вход + 1'), key: 'вход', base: 'вход', before: 'Новый вход', after: 'Кость урона', taken: ['вход'] })).toBe('вход');
  });

  it('имя, заданное руками, не перетирается названием', () => {
    expect(followKey({ world: world('1'), key: 'damage_dice', base: 'вход', before: 'Кость урона', after: 'Кости урона', taken: ['damage_dice'] })).toBe('damage_dice');
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
