// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const load = async () => {
  vi.resetModules();
  return import('./world.ts');
};

describe('восстановление черновика из браузера', () => {
  beforeEach(() => { localStorage.clear(); });

  it('пустой браузер — не сломанный черновик: ни причины, ни копии', async () => {
    const world = await load();
    expect(world.useWorld.getState().system.name).toBe('Новая система');
    expect(world.takeRestoreProblem()).toBeNull();
    expect(world.brokenDraft()).toBeNull();
  });

  it('верный черновик поднимается как был', async () => {
    const first = await load();
    first.useWorld.getState().editSystem(draft => { draft.name = 'Моя система'; });
    await new Promise(resolve => setTimeout(resolve, 700));
    const second = await load();
    expect(second.useWorld.getState().system.name).toBe('Моя система');
    expect(second.takeRestoreProblem()).toBeNull();
  });

  it('нечитаемый черновик не пропадает молча: причина названа, копия отложена', async () => {
    const broken = { state: { system: { fields: 'не список' }, compendium: {}, sheets: [] }, version: 0 };
    localStorage.setItem('vtt.world', JSON.stringify(broken));
    const world = await load();
    expect(world.useWorld.getState().system.name).toBe('Новая система');
    expect(world.takeRestoreProblem()).toBeTruthy();
    expect(world.brokenDraft()).toContain('не список');
    world.forgetBrokenDraft();
    expect(world.brokenDraft()).toBeNull();
  });
});
