import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { recordKinds, sheetKinds } from '@vtt/engine';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { SampleWorld } from '@vtt/engine/samples';
import type { System, Compendium } from '@vtt/schema';
import { useWorld } from '../store/world.ts';
import { openAll } from './render-open.tsx';
import { SheetTab } from '../screens/constructor/sheet-tab.tsx';
import { RulesTab } from '../screens/constructor/rules/rules-tab.tsx';
import { EffectsTab } from '../screens/constructor/effects/effects-tab.tsx';
import { RecordsTab } from '../screens/constructor/records-tab.tsx';
import { CompendiumScreen } from '../screens/compendium/compendium.tsx';

export type View = { name: string; ui: () => ReactElement; pick: Record<string, unknown> };

const firstOfEachTable = (compendium: Compendium): string[] =>
  [...new Map((compendium.records ?? []).map(record => [record.table, record.id] as const)).values()];

export const viewsOf = (system: System, compendium: Compendium): View[] => [
  { name: 'Лист', ui: () => <SheetTab />, pick: {} },
  ...sheetKinds(system).map(([id]) => ({ name: `тип листа ${id}`, ui: () => <SheetTab />, pick: { activeSheetKind: id } })),
  ...firstOfEachTable(compendium).map(id => ({ name: `запись ${id}`, ui: () => <CompendiumScreen />, pick: { activeRecordId: id } })),
  { name: 'Правила', ui: () => <RulesTab />, pick: {} },
  ...Object.keys(system.effects ?? {}).map(id => ({ name: `эффект ${id}`, ui: () => <EffectsTab />, pick: { activeEffectId: id } })),
  ...recordKinds(system).map(([id]) => ({ name: `книга ${id}`, ui: () => <RecordsTab />, pick: { activeRecordKind: id } })),
];

export const load = (world: SampleWorld, pick: Record<string, unknown>): void => {
  useWorld.setState(state => ({
    ...state, system: structuredClone(world.system), compendium: structuredClone(world.compendium),
    activeFieldTag: null, activeGroupName: null, activeEffectId: null, activeRecordKind: null,
    activeSheetKind: null, activeStepIndex: null, activeTableId: null, activeRecordId: null,
    ...pick,
  }));
};

const openReturns = (): void => {
  const cards = [...document.querySelectorAll<HTMLElement>('.card')].filter(card => /^Что получит тот, кто вызвал/.test(card.textContent ?? ''));
  for (const card of cards) {
    card.querySelectorAll<HTMLElement>('.param-line__sum[aria-expanded="false"]').forEach(sum => fireEvent.click(sum));
    card.querySelectorAll<HTMLElement>('.param-form button').forEach(button => { if (button.textContent === 'ещё') fireEvent.click(button); });
  }
};

const openSpoken = (): void => {
  document.querySelectorAll<HTMLElement>('.formula-words').forEach(face => fireEvent.click(face));
};

export const reveal = (): void => {
  openAll();
  act(() => { openReturns(); openSpoken(); });
  document.querySelectorAll('details').forEach(d => { d.open = true; });
};

const labelOf = (el: Element): string => {
  const field = el.closest('label, .field, .sheet-grid__cell, .row');
  const head = field?.querySelector('.field__label, .sheet-grid__title, label')?.textContent ?? '';
  return `${el.tagName.toLowerCase()}${head ? ` «${head.trim().slice(0, 40)}»` : ''} = ${JSON.stringify((el as HTMLInputElement).value)}`;
};

const IDLE = 'select, input, textarea, [role="radiogroup"]';

const idle = (el: Element): void => {
  if (el.getAttribute('role') === 'radiogroup') {
    const on = el.querySelector('[role="radio"][aria-checked="true"]');
    if (on) fireEvent.click(on);
    return;
  }
  if (el.getAttribute('role') === 'combobox') {
    fireEvent.focus(el);
    const value = (el as HTMLElement).dataset.value;
    const again = value === undefined ? undefined : [...(el.closest('.combo') ?? el.parentElement!).querySelectorAll<HTMLElement>('.slot__option')].find(o => o.dataset.value === value);
    if (again && !el.closest('.combo--multi')) fireEvent.mouseDown(again);
    fireEvent.blur(el);
    return;
  }
  if (el instanceof HTMLSelectElement) {
    const value = el.value;
    const other = [...el.options].find(o => o.value !== value)?.value;
    if (other === undefined) return;
    fireEvent.change(el, { target: { value } });
    return;
  }
  const input = el as HTMLInputElement;
  const value = input.value;
  if (input.type === 'checkbox' || input.type === 'file' || input.readOnly) return;
  (input as unknown as { _valueTracker?: { setValue: (v: string) => void } })._valueTracker?.setValue(`${value}\u0000`);
  fireEvent.change(input, { target: { value } });
  const chips = input.closest('.chips');
  if (chips) fireEvent.keyDown(chips, { key: 'Enter' });
  fireEvent.blur(input);
};

const diff = (a: unknown, b: unknown, path = ''): string | null => {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const found = diff((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
      if (found) return found;
    }
    return `${path}: порядок ключей`;
  }
  return `${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`;
};

const same = (a: unknown, b: unknown): boolean => {
  if (a === b || JSON.stringify(a) === JSON.stringify(b)) return true;
  try { expect(b).toEqual(a); return true; } catch { return false; }
};

export const QUICK = ['13th Age', 'Blades in the Dark'];

export function roundTrip(name: string, part = 0, parts = 1): void {
  const world = SAMPLE_WORLDS.find(one => one.system.name === name);
  const mode = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.ROUND_TRIP;
  const wanted = mode === 'full' || mode === name || QUICK.includes(name);
  const limit = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.ROUND_TRIP_MS) || 600000;

  describe('пресет не портится редактором: холостой коммит в каждом поле', () => {
    beforeEach(() => { try { localStorage.clear(); } catch { return; } });
    afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 150)); });

    describe.skipIf(!wanted || !world)(name, () => {
      const views = world ? viewsOf(world.system, world.compendium).filter((_, index) => index % parts === part) : [];
      for (const view of views) {
        it(view.name, () => {
          const base = structuredClone(world!);
          const found: string[] = [];
          load(base, view.pick);
          render(view.ui());
          reveal();
          const count = document.querySelectorAll(IDLE).length;
          for (let index = 0; index < count; index++) {
            const el = document.querySelectorAll(IDLE)[index];
            if (!el || (el as HTMLInputElement).disabled) continue;
            const label = labelOf(el);
            act(() => { idle(el); });
            act(() => { openSpoken(); });
            const { system, compendium } = useWorld.getState();
            const now = { system, compendium };
            const was = { system: base.system, compendium: base.compendium };
            if (!same(was, now)) {
              found.push(`${label}: ${diff(was, now)}`);
              cleanup();
              load(base, view.pick);
              render(view.ui());
              reveal();
            }
          }
          expect(found).toEqual([]);
        }, limit);
      }
    });
  });
}
