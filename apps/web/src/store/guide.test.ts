// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { System } from '@vtt/schema';

const getSystem = vi.fn();
const saveSystem = vi.fn();
const createSystem = vi.fn();
vi.mock('../api/client.ts', async importOriginal => ({ ...await importOriginal<object>(), getSystem, saveSystem, createSystem }));

const mine = (): System => ({ id: 'моя', name: 'Моя система', effects: {}, grants: [], constants: {}, tables: {} } as System);

const load = async () => {
  vi.resetModules();
  const world = await import('./world.ts');
  const guide = await import('./guide.ts');
  const session = await import('./session.ts');
  return { ...world, ...guide, ...session };
};

const fresh = async () => {
  const all = await load();
  all.useWorld.getState().replaceWorld({ system: mine(), compendium: { records: [] }, sheets: [] });
  all.useWorld.setState({ origin: { mode: 'system' }, activeTab: 'effects' });
  return all;
};

describe('учебная копия', () => {
  beforeEach(() => { localStorage.clear(); getSystem.mockReset(); saveSystem.mockReset(); createSystem.mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('снимок записан раньше, чем мир заменён учебной копией', async () => {
    const { useWorld, useGuide, savedKey } = await fresh();
    const seen: (string | null)[] = [];
    const stop = useWorld.subscribe(state => { if (state.system.name !== 'Моя система') seen.push(localStorage.getItem(savedKey())); });
    expect(await useGuide.getState().start('tables')).toBe(true);
    stop();
    expect(seen.length).toBeGreaterThan(0);
    expect(JSON.parse(seen[0]!).real.system.name).toBe('Моя система');
    expect(useWorld.getState().origin.lesson).toBe('tables');
    expect(useWorld.getState().origin.systemId).toBeUndefined();
  });

  it('снимок записать не удалось — урок не начат, мир тот же', async () => {
    const { useWorld, useGuide } = await fresh();
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith('vtt.guide.world.')) throw new Error('квота');
      write.call(this, key, value);
    });
    expect(await useGuide.getState().start('tables')).toBe(false);
    expect(useGuide.getState().lesson).toBeNull();
    expect(useGuide.getState().note).toContain('сохранить не удалось');
    expect(useWorld.getState().system.name).toBe('Моя система');
  });

  it('последние правки не сохранились — урок не начат', async () => {
    const { useWorld, useGuide } = await fresh();
    saveSystem.mockRejectedValue(new Error('сервер недоступен'));
    useWorld.setState({ origin: { mode: 'system', systemId: 'с1' } });
    useWorld.getState().editSystem(draft => { draft.name = 'Правка'; });
    expect(await useGuide.getState().start('tables')).toBe(false);
    expect(useGuide.getState().note).toContain('не сохранились');
    expect(useWorld.getState().system.name).toBe('Правка');
    expect(useWorld.getState().origin.lesson).toBeUndefined();
  });

  it('выход с системой на сервере перечитывает её оттуда, книга и листы — из снимка', async () => {
    const { useWorld, useGuide } = await fresh();
    useWorld.setState({ origin: { mode: 'system', systemId: 'с1', systemTitle: 'Моя система' } });
    (await import('./autosave.ts')).markClean();
    getSystem.mockResolvedValue({ id: 'с1', title: 'Моя система', updatedAt: 'т2', system: { ...mine(), name: 'С сервера' } });
    expect(await useGuide.getState().start('items')).toBe(true);
    expect(useWorld.getState().origin.systemId).toBeUndefined();
    expect(await useGuide.getState().exit()).toBe(true);
    expect(getSystem).toHaveBeenCalledWith('с1');
    expect(useWorld.getState().system.name).toBe('С сервера');
    expect(useWorld.getState().origin).toEqual({ mode: 'system', systemId: 'с1', systemTitle: 'Моя система', publication: 'draft' });
    expect(useWorld.getState().activeTab).toBe('effects');
  });

  it('открыли другую систему во время урока — урок закрыт молча, выход мир не трогает', async () => {
    const { useWorld, useGuide, readSnapshot } = await fresh();
    await useGuide.getState().start('links');
    useWorld.getState().replaceWorld({ system: { ...mine(), name: 'Другая' }, compendium: { records: [] }, sheets: [] });
    useWorld.getState().setOrigin({ systemId: 'с2', lesson: undefined });
    expect(useGuide.getState().lesson).toBeNull();
    expect(readSnapshot()).toBeNull();
    await useGuide.getState().exit();
    expect(useWorld.getState().system.name).toBe('Другая');
  });

  it('после загрузки: пометка урока без снимка — урок закрыт и сказано почему', async () => {
    const first = await fresh();
    await first.useGuide.getState().start('tables');
    await new Promise(resolve => setTimeout(resolve, 700));
    localStorage.removeItem(first.savedKey());
    const second = await load();
    expect(second.useGuide.getState().lesson).toBeNull();
    expect(second.useGuide.getState().note).toContain('учебная копия осталась без вашей системы');
    expect(second.useWorld.getState().origin.lesson).toBeUndefined();
  });

  it('после загрузки: урок идёт — остаётся; снимок без пометки — забыт', async () => {
    const first = await fresh();
    await first.useGuide.getState().start('tables');
    first.useGuide.getState().go(3);
    await new Promise(resolve => setTimeout(resolve, 700));
    const second = await load();
    expect(second.useGuide.getState().lesson).toBe('tables');
    expect(second.useGuide.getState().step).toBe(3);
    expect(second.readSnapshot()?.system.name).toBe('Моя система');

    second.useWorld.setState({ origin: { mode: 'system' } });
    await new Promise(resolve => setTimeout(resolve, 700));
    localStorage.setItem(second.savedKey(), JSON.stringify({ real: { system: mine(), compendium: { records: [] }, sheets: [], origin: { mode: 'system' }, tab: 'sheet' }, lessons: {} }));
    const third = await load();
    expect(third.useGuide.getState().lesson).toBeNull();
    expect(third.readSnapshot()).toBeNull();
  });

  it('«Оставить как новую систему»: учебная копия создаётся на сервере и открывается, настоящий мир не возвращается', async () => {
    const { useWorld, useGuide, readSnapshot } = await fresh();
    createSystem.mockResolvedValue({ id: 'н1', updatedAt: 'т1' });
    await useGuide.getState().start('links');
    useWorld.getState().editSystem(draft => { draft.name = 'Мой урок'; });
    expect(await useGuide.getState().keep()).toBe(true);
    expect(createSystem).toHaveBeenCalledWith('Мой урок', expect.objectContaining({ name: 'Мой урок' }));
    expect(useWorld.getState().system.name).toBe('Мой урок');
    expect(useWorld.getState().origin).toEqual({ mode: 'system', systemId: 'н1', systemTitle: 'Мой урок', systemMine: true });
    expect(useGuide.getState().lesson).toBeNull();
    expect(readSnapshot()).toBeNull();
    expect(useGuide.getState().started.links).toBeUndefined();
  });

  it('переход к другому уроку хранит копию первого: «Продолжить» возвращает её и шаг, настоящий мир — один снимок', async () => {
    const { useWorld, useGuide, readSnapshot } = await fresh();
    await useGuide.getState().start('tables');
    useGuide.getState().go(2);
    useWorld.getState().editSystem(draft => { draft.name = 'Таблицы — мои'; });
    await useGuide.getState().start('items');
    expect(useWorld.getState().system.name).toBe('Учебная система');
    expect(readSnapshot()?.system.name).toBe('Моя система');
    await useGuide.getState().start('tables');
    expect(useGuide.getState().step).toBe(2);
    expect(useWorld.getState().system.name).toBe('Таблицы — мои');
    await useGuide.getState().start('tables', true);
    expect(useGuide.getState().step).toBe(0);
    expect(useWorld.getState().system.name).toBe('Учебная система');
    await useGuide.getState().exit();
    expect(useWorld.getState().system.name).toBe('Моя система');
    expect(useGuide.getState().started).toEqual({ tables: 0, items: 0 });
  });
});
