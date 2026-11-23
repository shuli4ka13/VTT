// @vitest-environment jsdom
import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { RoomState } from '@vtt/schema';

const sample = SAMPLE_WORLDS.find(one => one.system.name === '13th Age')!;

vi.mock('../api/client.ts', async () => {
  const real = await vi.importActual<typeof import('../api/client.ts')>('../api/client.ts');
  const summary = { id: 's1', title: 'Alpha', authorName: 'Ann', updatedAt: '2026-11-01T10:00:00.000Z', status: 'published', behind: true, mine: true };
  return {
    ...real,
    onTokenChange: () => () => {},
    currentToken: () => 't',
    listSystems: async () => [summary, { ...summary, id: 's2', title: 'Beta', status: 'draft', behind: false }],
    listCompendiums: async () => [{ id: 'b1', title: 'Book', systemId: 's1', authorName: 'Ann', updatedAt: '2026-11-01T10:00:00.000Z', status: 'published', mine: true, records: 3 }],
    listWorlds: async () => [{ id: 'w1', title: 'World', systemName: 'Alpha', authorName: 'Ann', updatedAt: '2026-11-01T10:00:00.000Z', mine: true }],
    listRooms: async () => [
      { id: 'r1', title: 'My table', worldId: 'w1', memberCount: 2, createdAt: '2026-11-01T10:05:00.000Z', gmName: 'Ann', gm: true },
      { id: 'r2', title: 'Their table', worldId: 'w1', memberCount: 1, createdAt: '2026-10-01T10:05:00.000Z', gmName: 'Bob', gm: false },
    ],
  };
});

const { useLocale } = await import('../store/locale.ts');
const { useWorld } = await import('../store/world.ts');
const { useRoom } = await import('../store/room.ts');
const { useSession } = await import('../store/session.ts');
const { openAll } = await import('../testing/render-open.tsx');
const { shownText } = await import('../testing/no-keys.tsx');
const { englishWorld, englishLeft, note } = await import('../testing/english.tsx');
const { leftIo } = await import('../i18n/left/io.tools.ts');
const { load } = await import('../testing/round-trip.tsx');
const { SystemBar } = await import('./constructor/world-bar.tsx');
const { ConstructorScreen } = await import('./constructor/constructor.tsx');
const { GuideLayer } = await import('../guide/guide-card.tsx');
const { BookStart } = await import('./compendium/book-start.tsx');
const { BookBar } = await import('./compendium/book-bar.tsx');
const { Lobby } = await import('./play/lobby.tsx');
const { BuildWorld } = await import('./play/build-world.tsx');
const { TableScreen } = await import('./play/table.tsx');
const { App } = await import('../app.tsx');
const { t } = await import('../i18n/author.ts');

const LIST = 'shell';
const latin = englishWorld(sample);

const settle = async (): Promise<void> => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
  openAll();
  document.querySelectorAll('details').forEach(d => { d.open = true; });
};

const pressAll = (pick: (button: HTMLElement) => boolean): void => {
  for (const button of [...document.querySelectorAll<HTMLElement>('button, [role="tab"]')].filter(pick)) act(() => { fireEvent.click(button); });
};

describe('оболочка при английском интерфейсе: русского текста нет', () => {
  beforeEach(() => {
    localStorage.clear();
    useLocale.getState().setLang('en');
    useSession.setState(state => ({ ...state, signed: true, name: 'Ann', userId: 'u' }));
  });
  afterEach(() => { cleanup(); useLocale.getState().setLang('ru'); useRoom.setState({ room: null }); });

  for (const tab of ['sheet', 'dictionaries', 'effects', 'records'] as const) {
    it(`конструктор целиком, вкладка ${tab}: шапка, вкладки, «Проблемы», список уроков`, async () => {
      load(structuredClone(latin), { activeTab: tab });
      useWorld.setState({ origin: { mode: 'system' } });
      render(<MemoryRouter><SystemBar /><ConstructorScreen /><GuideLayer /></MemoryRouter>);
      await settle();
      note(LIST, shownText());
      const problems = document.querySelector<HTMLElement>('[data-guide="problems"] button');
      if (problems) act(() => { fireEvent.click(problems); });
      pressAll(button => (button.textContent ?? '').trim() === t('guide:button.label'));
      await settle();
      note(LIST, shownText());
    }, 120000);
  }

  it('старт книги и её шапка', async () => {
    render(<MemoryRouter><BookBar /><BookStart /></MemoryRouter>);
    await settle();
    note(LIST, shownText());
    pressAll(button => button.closest('.roles, .card, .list') !== null && !/delete/i.test(button.textContent ?? ''));
    await settle();
    note(LIST, shownText());
  }, 120000);

  it('лобби стола: столы, миры, сборка мира', async () => {
    render(<MemoryRouter><Lobby /></MemoryRouter>);
    await waitFor(() => { if (!document.body.textContent?.includes('My table')) throw new Error('wait'); });
    await settle();
    note(LIST, shownText());
    for (const tab of [...document.querySelectorAll<HTMLElement>('[role="tab"]')]) {
      act(() => { fireEvent.click(tab); });
      await settle();
      note(LIST, shownText());
    }
    cleanup();
    render(<MemoryRouter><BuildWorld onBuilt={() => {}} /></MemoryRouter>);
    await settle();
    note(LIST, shownText());
  }, 120000);

  it('стол: бой, журнал, ожидание ответа', async () => {
    const sheets = structuredClone((latin as unknown as { sheets: { id: string }[] }).sheets ?? []);
    const first = sheets[0]?.id ?? 'a';
    useRoom.setState(state => ({
      ...state,
      room: {
        id: 'r', title: 'Table', members: [{ userId: 'u', name: 'Ann', role: 'gm' }, { userId: 'p', name: 'Bob', role: 'player', sheetId: first }],
        system: structuredClone(latin.system), compendium: structuredClone(latin.compendium), sheets,
        clock: { round: 2, order: sheets.slice(0, 2).map(sheet => sheet.id), active: first },
        pending: { id: 'q', sheetId: first, stage: 'target', question: 'Hero: respond?', options: [{ id: 'shield', label: 'Shield' }], preview: [] },
      } as unknown as RoomState,
      mySheetId: first,
      log: [{ id: '1', at: '2026-09-20T07:05:00.000Z', text: 'Hero strikes' }],
      error: null,
    }));
    render(<MemoryRouter><TableScreen /></MemoryRouter>);
    await settle();
    note(LIST, shownText());
    for (const tab of [...document.querySelectorAll<HTMLElement>('[role="tab"]')]) {
      act(() => { fireEvent.click(tab); });
      await settle();
      note(LIST, shownText());
    }
  }, 120000);

  it('верхняя полоса приложения', async () => {
    for (const path of ['/play/table', '/book/start', '/author/start']) {
      render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
      await settle();
      note(LIST, shownText());
      cleanup();
    }
  }, 120000);
});

englishLeft(LIST, leftIo(LIST));
