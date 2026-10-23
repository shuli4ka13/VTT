// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const publishSystem = vi.fn();
const saveSystem = vi.fn();
vi.mock('../../api/client.ts', async () => {
  const real = await vi.importActual<typeof import('../../api/client.ts')>('../../api/client.ts');
  return {
    ...real,
    publishSystem: (...args: unknown[]) => publishSystem(...args),
    saveSystem: (...args: unknown[]) => saveSystem(...args),
  };
});

const { ApiError } = await import('../../api/client.ts');
const { useWorld, publicationOf } = await import('../../store/world.ts');
const { useAutosave, rememberVersion, markClean } = await import('../../store/autosave.ts');
const { useProblemsPanel } = await import('./problems-panel.tsx');
const { SystemBar } = await import('./world-bar.tsx');

const bar = () => render(<MemoryRouter><SystemBar /></MemoryRouter>);

describe('шапка системы: опубликована ли последняя версия', () => {
  beforeEach(() => {
    publishSystem.mockReset();
    saveSystem.mockReset();
    rememberVersion({ system: undefined });
    useWorld.setState(state => ({
      ...state, origin: { mode: 'system', systemId: 'sys-1', publication: 'draft' },
    }));
    markClean();
    useAutosave.getState().set({ kind: 'idle' });
    useProblemsPanel.getState().set(false);
  });
  afterEach(() => { cleanup(); });

  it('ответ сервера переводится в состояние: нет опубликованной — черновик, нет отставания — опубликована, есть — правки', () => {
    expect(publicationOf(undefined)).toBe('draft');
    expect(publicationOf(false)).toBe('live');
    expect(publicationOf(true)).toBe('behind');
  });

  it('у черновика отметка «черновик», у опубликованной — «опубликована», у отстающей — «правки не опубликованы» с подсказкой', () => {
    const view = bar();
    expect(screen.getByText('черновик')).toBeTruthy();
    useWorld.getState().setOrigin({ publication: 'live' });
    view.rerender(<MemoryRouter><SystemBar /></MemoryRouter>);
    expect(screen.getByText('опубликована')).toBeTruthy();
    useWorld.getState().setOrigin({ publication: 'behind' });
    view.rerender(<MemoryRouter><SystemBar /></MemoryRouter>);
    const mark = screen.getByText('правки не опубликованы');
    expect(mark.getAttribute('title')).toContain('Опубликовать');
  });

  it('в уроке отметки нет', () => {
    useWorld.setState(state => ({ ...state, origin: { mode: 'system', lesson: 'first' } }));
    bar();
    expect(screen.queryByText('черновик')).toBeNull();
    expect(screen.queryByText('опубликована')).toBeNull();
  });

  it('публикация даёт «опубликована», правка после неё — «правки не опубликованы»', async () => {
    saveSystem.mockResolvedValue({ id: 'sys-1', updatedAt: 'v2' });
    publishSystem.mockResolvedValue({ id: 'sys-1', updatedAt: 'v3' });
    useWorld.getState().setOrigin({ publication: 'behind' });
    bar();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(useWorld.getState().origin.publication).toBe('live'));
    expect(screen.getByText('опубликована')).toBeTruthy();
    expect(screen.queryByText('опубликовано')).toBeNull();

    saveSystem.mockClear();
    await new Promise(resolve => setTimeout(resolve, 1800));
    expect(saveSystem, 'публикация сама по себе не пересохраняет систему').not.toHaveBeenCalled();
    expect(useWorld.getState().origin.publication).toBe('live');

    useWorld.getState().editSystem(draft => { draft.name = 'Правка после публикации'; });
    await waitFor(() => expect(useWorld.getState().origin.publication).toBe('behind'), { timeout: 4000 });
    expect(screen.getByText('правки не опубликованы')).toBeTruthy();
  });

  it('отказ по линту даёт короткую запись и открывает «Проблемы»', async () => {
    publishSystem.mockRejectedValue(new ApiError('система не готова к публикации: 6 ошибок — смотрите «Проблемы»', 400, []));
    bar();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(screen.getByText('не опубликовано — ошибки в «Проблемах»')).toBeTruthy());
    expect(useProblemsPanel.getState().open).toBe(true);
  });

  it('прочий отказ остаётся как есть и панель не открывает', async () => {
    publishSystem.mockRejectedValue(new ApiError('сервер недоступен', 500, []));
    bar();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(screen.getByText('сервер недоступен')).toBeTruthy());
    expect(useProblemsPanel.getState().open).toBe(false);
  });
});
