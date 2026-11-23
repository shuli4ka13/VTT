// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { System, RoomState } from '@vtt/schema';

const listSystems = vi.fn();
vi.mock('../api/client.ts', async () => {
  const real = await vi.importActual<typeof import('../api/client.ts')>('../api/client.ts');
  return { ...real, listSystems: (...args: unknown[]) => listSystems(...args) };
});

const { useLocale } = await import('../store/locale.ts');
const { useSession } = await import('../store/session.ts');
const { useWorld, emptySystem } = await import('../store/world.ts');
const { useRoom } = await import('../store/room.ts');
const { GateScreen } = await import('../screens/gate/gate.tsx');
const { SystemStart } = await import('../screens/author/start.tsx');
const { SystemBar } = await import('../screens/constructor/world-bar.tsx');
const { LangsSection } = await import('../screens/constructor/rules/langs-section.tsx');
const { LangSwitch } = await import('../screens/play/shown.tsx');

const RUSSIAN = /[А-Яа-яЁё]/u;

const visible = (): string[] => {
  const out: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text && !['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName ?? '')) out.push(text);
  }
  for (const element of document.body.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label]')) {
    for (const name of ['placeholder', 'title', 'aria-label']) {
      const value = element.getAttribute(name);
      if (value) out.push(value);
    }
  }
  return out;
};

const UI_OF_OTHERS = ['не выбрано'];

const russian = (except: readonly string[] = []): string[] =>
  visible().filter(text => RUSSIAN.test(text) && ![...UI_OF_OTHERS, ...except].some(part => text.includes(part)));

const latin = (): System => ({
  ...emptySystem(),
  langs: ['en', 'ru'],
  tables: {
    sheet: { shape: 'single', owner: 'sheet', label: 'Sheet', columns: [{ key: 'wounds', label: 'Wounds', kind: 'number' }] },
  },
  blocks: [{ key: 'Base', parts: [{ table: 'sheet' }] }],
} as unknown as System);

const SHELL_OF_OTHERS = ['Лист', 'Правила', 'Эффекты', 'Записи', 'Вещи и умения', 'Обучение', 'уроки по конструктору', 'предупреждения', 'Проблемы:'];

describe('пилотные экраны на английском: русских букв в видимом тексте нет', () => {
  beforeEach(() => {
    useLocale.getState().setLang('en');
    useWorld.setState(state => ({ ...state, system: latin(), compendium: { records: [] } }));
    listSystems.mockResolvedValue([
      { id: 's1', title: 'Alpha', authorName: 'Ann', updatedAt: '2026-11-01T10:00:00.000Z', status: 'published', behind: true, mine: true },
      { id: 's2', title: 'Beta', authorName: 'Bob', updatedAt: '2026-11-02T10:00:00.000Z', status: 'draft', mine: true },
    ]);
  });
  afterEach(() => {
    cleanup();
    useLocale.getState().setLang('ru');
    useLocale.getState().setShown(null);
  });

  it('вход: до входа и после', () => {
    useSession.setState({ signed: false, name: 'Ann' });
    render(<MemoryRouter><GateScreen /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(russian()).toEqual([]);
    cleanup();
    useSession.setState({ signed: true, name: 'Ann' });
    render(<MemoryRouter><GateScreen /></MemoryRouter>);
    expect(screen.getByText('System author')).toBeTruthy();
    expect(russian()).toEqual([]);
  });

  it('старт автора: три пути, список и копия', async () => {
    render(<MemoryRouter><SystemStart /></MemoryRouter>);
    expect(russian()).toEqual([]);
    fireEvent.click(screen.getByText('Start from scratch'));
    expect(russian()).toEqual([]);
    fireEvent.click(screen.getByText('Continue working'));
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
    expect(screen.getByText('published · has changes')).toBeTruthy();
    expect(russian()).toEqual([]);
    fireEvent.click(screen.getByText('Make a copy'));
    await waitFor(() => expect(screen.getByText('Your drafts')).toBeTruthy());
    expect(russian()).toEqual([]);
  });

  it('шапка конструктора: только свои слова; чужие части шапки перечислены с причиной', () => {
    render(<MemoryRouter><SystemBar /></MemoryRouter>);
    expect(screen.getByText('language: English')).toBeTruthy();
    expect(screen.getByText('Publish')).toBeTruthy();
    expect(russian(SHELL_OF_OTHERS)).toEqual([]);
  });

  it('шапка: кнопка языка переключает интерфейс и обратно', () => {
    render(<MemoryRouter><SystemBar /></MemoryRouter>);
    fireEvent.click(screen.getByText('language: English'));
    expect(useLocale.getState().lang).toBe('ru');
    expect(screen.getByText('язык: русский')).toBeTruthy();
    fireEvent.click(screen.getByText('язык: русский'));
    expect(useLocale.getState().lang).toBe('en');
    expect(screen.getByText('language: English')).toBeTruthy();
  });

  it('раздел «Языки»: основной, добавленный язык, таблица перевода', () => {
    const Live = () => {
      const system = useWorld(state => state.system);
      const editSystem = useWorld(state => state.editSystem);
      return <LangsSection system={system} editSystem={editSystem} />;
    };
    render(<Live />);
    expect(screen.getByText('Languages')).toBeTruthy();
    expect(russian()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(screen.getByText('Translation · Russian')).toBeTruthy();
    expect(russian()).toEqual([]);
  });

  it('язык показа на столе', () => {
    useRoom.setState({ room: { system: latin(), compendium: { records: [] }, sheets: [] } as unknown as RoomState });
    render(<LangSwitch />);
    expect(screen.getByLabelText('display language')).toBeTruthy();
    expect(russian()).toEqual([]);
    useRoom.setState({ room: null });
  });
});
