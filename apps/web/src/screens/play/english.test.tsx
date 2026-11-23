// @vitest-environment jsdom
import { describe, it, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { RoomState, Sheet, System, Compendium } from '@vtt/schema';
import { availableActions } from '@vtt/engine';
import { useRoom } from '../../store/room.ts';
import { useLocale } from '../../store/locale.ts';
import { openAll } from '../../testing/render-open.tsx';
import { shownText } from '../../testing/no-keys.tsx';
import { QUICK } from '../../testing/round-trip.tsx';
import { englishWorld, englishLeft, note, quickOnly, wantedIn } from '../../testing/english.tsx';
import { SheetScreen } from './sheet.tsx';
import { leftIo } from '../../i18n/left/io.tools.ts';
import { ActionForm } from './action-form.tsx';

const LIST = 'play';

const roomOf = (world: (typeof SAMPLE_WORLDS)[number]): RoomState => ({
  id: 'r', title: 'Table', members: [{ userId: 'u', name: 'GM', role: 'gm' }],
  system: structuredClone(world.system), compendium: structuredClone(world.compendium),
  sheets: structuredClone((world as unknown as { sheets: unknown[] }).sheets ?? []),
} as unknown as RoomState);

const reveal = (): void => {
  openAll();
  document.querySelectorAll('details').forEach(d => { d.open = true; });
};

describe('лист игрока при английском интерфейсе: русского текста нет', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* empty */ }
    useLocale.getState().setLang('en');
  });
  afterEach(() => { cleanup(); useLocale.getState().setLang('ru'); useLocale.getState().setShown(null); });

  for (const world of SAMPLE_WORLDS) {
    const name = world.system.name;
    const quick = QUICK.includes(name) || name === 'D&D 5e';
    const wanted = wantedIn(name, quick);
    if (wanted && !quick) quickOnly(LIST, false);
    const latin = englishWorld(world);
    const sheets = ((latin as unknown as { sheets?: { id: string; of?: string }[] }).sheets ?? []);
    const firstOfKind = [...new Map(sheets.map(sheet => [sheet.of ?? '', sheet.id] as const)).values()];
    describe.skipIf(!wanted)(name, () => {
      for (const id of firstOfKind) {
        it(`лист ${id}`, () => {
          useRoom.setState(state => ({ ...state, room: roomOf(latin), mySheetId: id, log: [], error: null }));
          render(<SheetScreen />);
          reveal();
          note(LIST, shownText());
          for (const tab of [...document.querySelectorAll<HTMLElement>('[role="tab"]')]) {
            act(() => { fireEvent.click(tab); });
            reveal();
            note(LIST, shownText());
          }
        }, 120000);

        it(`лист ${id}: вопросы действий`, () => {
          const room = roomOf(latin);
          const sheet = room.sheets.find(one => one.id === id)! as Sheet;
          const actions = availableActions(sheet, { system: room.system, compendium: room.compendium });
          for (const action of actions) {
            const { unmount } = render(
              <ActionForm system={room.system as System} compendium={room.compendium as Compendium} actor={sheet}
                targets={room.sheets.map(one => ({ id: one.id, name: one.name ?? one.id }))}
                actionId={action.id} label={action.label} onAct={() => {}} />,
            );
            const more = [...document.querySelectorAll<HTMLElement>('button')].find(button => button.textContent === `${action.label}…`);
            if (more) act(() => { fireEvent.click(more); });
            reveal();
            note(LIST, shownText());
            unmount();
          }
        }, 120000);
      }
    });
  }
});

englishLeft(LIST, leftIo(LIST));
