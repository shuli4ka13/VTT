// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const saveSystem = vi.fn().mockResolvedValue({ id: 'sys-9', updatedAt: 'v1' });
vi.mock('../api/client.ts', async () => {
  const real = await vi.importActual<typeof import('../api/client.ts')>('../api/client.ts');
  return { ...real, saveSystem: (...args: unknown[]) => saveSystem(...args), saveCompendium: vi.fn() };
});

describe('автосохранение после перезагрузки страницы', () => {
  it('черновик, не успевший уйти на сервер, уходит до публикации', async () => {
    const system = { id: 'new-system', name: 'Черновик', fields: [], effects: {}, grants: [] };
    localStorage.setItem('vtt.world', JSON.stringify({
      state: { system, compendium: { records: [] }, sheets: [], origin: { mode: 'system', systemId: 'sys-9' } },
      version: 0,
    }));

    const { settle } = await import('./autosave.ts');
    expect(await settle()).toBe(true);
    expect(saveSystem).toHaveBeenCalledTimes(1);
    expect(saveSystem.mock.calls[0]!.slice(0, 2)).toEqual(['sys-9', 'Черновик']);
  });
});
