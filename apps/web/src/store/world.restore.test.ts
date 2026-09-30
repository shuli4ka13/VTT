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

  it('черновик прежней формы (с полями вместо таблиц) не пропадает молча: причина названа, копия отложена', async () => {
    const old = { fields: [{ tag: 'hp', label: 'Хиты', value: { kind: 'stored', type: 'number', default: 1 } }], effects: {} };
    const broken = { state: { system: old, compendium: {}, sheets: [] }, version: 0 };
    localStorage.setItem('vtt.world', JSON.stringify(broken));
    const world = await load();
    expect(world.useWorld.getState().system.name).toBe('Новая система');
    expect(world.takeRestoreProblem()).toContain('полей больше нет');
    expect(world.brokenDraft()).toContain('"tag":"hp"');
    world.forgetBrokenDraft();
    expect(world.brokenDraft()).toBeNull();
  });
});
