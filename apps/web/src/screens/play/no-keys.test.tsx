// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { RoomState } from '@vtt/schema';
import { useRoom } from '../../store/room.ts';
import { openAll } from '../../testing/render-open.tsx';
import { forbiddenKeys, shownText, leaks } from '../../testing/no-keys.tsx';
import { QUICK } from '../../testing/round-trip.tsx';
import { availableActions } from '@vtt/engine';
import type { Sheet, System, Compendium } from '@vtt/schema';
import { SheetScreen } from './sheet.tsx';
import { ActionForm } from './action-form.tsx';

const env = (): Record<string, string | undefined> => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

const roomOf = (world: (typeof SAMPLE_WORLDS)[number]): RoomState => ({
  id: 'r', title: 'Стол', members: [{ userId: 'u', name: 'Ведущий', role: 'gm' }],
  system: structuredClone(world.system), compendium: structuredClone(world.compendium),
  sheets: structuredClone((world as unknown as { sheets: unknown[] }).sheets ?? []),
} as unknown as RoomState);

const reveal = (): void => {
  openAll();
  document.querySelectorAll('details').forEach(d => { d.open = true; });
};

describe('экран листа игрока не показывает ключ', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  for (const world of SAMPLE_WORLDS) {
    const name = world.system.name;
    const mode = env().NO_KEYS;
    const wanted = mode === 'full' || mode === name || QUICK.includes(name) || name === 'D&D 5e';
    const sheets = ((world as unknown as { sheets?: { id: string; of?: string }[] }).sheets ?? []);
    const firstOfKind = [...new Map(sheets.map(sheet => [sheet.of ?? '', sheet.id] as const)).values()];
    describe.skipIf(!wanted)(name, () => {
      const keys = forbiddenKeys(world);
      for (const id of firstOfKind) {
        it(`лист ${id}`, () => {
          useRoom.setState(state => ({ ...state, room: roomOf(world), mySheetId: id, log: [], error: null }));
          render(<SheetScreen />);
          reveal();
          const seen = [...shownText()];
          const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
          for (const tab of tabs) {
            act(() => { fireEvent.click(tab); });
            reveal();
            seen.push(...shownText());
          }
          expect(leaks(seen, keys)).toEqual([]);
        }, 120000);

        it(`лист ${id}: вопросы действий`, () => {
          const room = roomOf(world);
          const sheet = room.sheets.find(one => one.id === id)! as Sheet;
          const actions = availableActions(sheet, { system: room.system, compendium: room.compendium });
          const seen: string[] = [];
          for (const action of actions) {
            const { unmount } = render(
              <ActionForm system={room.system as System} compendium={room.compendium as Compendium} actor={sheet}
                targets={room.sheets.map(one => ({ id: one.id, name: one.name ?? one.id }))}
                actionId={action.id} label={action.label} onAct={() => {}} />,
            );
            const more = [...document.querySelectorAll<HTMLElement>('button')].find(button => button.textContent === `${action.label}…`);
            if (more) act(() => { fireEvent.click(more); });
            reveal();
            seen.push(...shownText());
            unmount();
          }
          expect(leaks(seen, keys)).toEqual([]);
        }, 120000);
      }
    });
  }
});
