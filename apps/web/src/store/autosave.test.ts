// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const saveSystem = vi.fn();
vi.mock('../api/client.ts', async () => {
  const real = await vi.importActual<typeof import('../api/client.ts')>('../api/client.ts');
  return { ...real, saveSystem: (...args: unknown[]) => saveSystem(...args), saveCompendium: vi.fn() };
});

const { ApiError } = await import('../api/client.ts');
const { useWorld } = await import('./world.ts');
const { useAutosave, settle, saveLabel, rememberVersion } = await import('./autosave.ts');

const edit = (name: string) => useWorld.getState().editSystem(draft => { draft.name = name; });

describe('автосохранение: автор всегда знает, сохранилось ли и почему нет', () => {
  beforeEach(() => {
    saveSystem.mockReset();
    rememberVersion({ system: undefined });
    useWorld.getState().setOrigin({ mode: 'system', systemId: 'sys-1' });
    useAutosave.getState().set({ kind: 'idle' });
  });

  it('после правки статус сразу «есть несохранённые правки», после ответа сервера — «сохранено»', async () => {
    saveSystem.mockResolvedValue({ id: 'sys-1', updatedAt: 'v2' });
    edit('Первая');
    expect(useAutosave.getState().state.kind).toBe('dirty');
    expect(await settle()).toBe(true);
    expect(useAutosave.getState().state.kind).toBe('saved');
  });

  it('отказ сервера доносит подробности, а не только общую фразу', async () => {
    saveSystem.mockRejectedValue(new ApiError('запрос не проходит схему', 400, ['effects.e1.trigger.on: пусто']));
    edit('Вторая');
    expect(await settle()).toBe(false);
    const state = useAutosave.getState().state;
    expect(state.kind).toBe('failed');
    expect(saveLabel(state, '')).toContain('effects.e1.trigger.on');
  });

  it('после отказа следующая правка сохраняется снова', async () => {
    saveSystem.mockRejectedValueOnce(new ApiError('запрос не проходит схему', 400, ['x: y']));
    edit('Третья');
    expect(await settle()).toBe(false);
    saveSystem.mockResolvedValue({ id: 'sys-1', updatedAt: 'v3' });
    edit('Четвёртая');
    expect(await settle()).toBe(true);
    expect(saveSystem).toHaveBeenCalledTimes(2);
  });

  it('settle без несохранённого ничего не шлёт и отвечает «можно публиковать»', async () => {
    saveSystem.mockResolvedValue({ id: 'sys-1', updatedAt: 'v4' });
    edit('Пятая');
    expect(await settle()).toBe(true);
    saveSystem.mockClear();
    expect(await settle()).toBe(true);
    expect(saveSystem).not.toHaveBeenCalled();
  });
});
