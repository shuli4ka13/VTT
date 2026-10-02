// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { SampleWorld } from '@vtt/engine/model/systems';
import { recordKinds, sheetKinds } from '@vtt/engine/model/owned';
import type { System, Compendium } from '@vtt/schema';
import { useWorld } from '../../store/world.ts';
import { openAll } from '../../testing/render-open.tsx';
import { SheetTab } from './sheet-tab.tsx';
import { RulesTab } from './rules/rules-tab.tsx';
import { EffectsTab } from './effects/effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';
import { CompendiumScreen } from '../compendium/compendium.tsx';

type View = { name: string; ui: () => ReactElement; pick: Record<string, unknown> };

const firstOfEachTable = (compendium: Compendium): string[] =>
  [...new Map((compendium.records ?? []).map(record => [record.table, record.id] as const)).values()];

const viewsOf = (system: System, compendium: Compendium): View[] => [
  { name: 'Лист', ui: () => <SheetTab />, pick: {} },
  ...sheetKinds(system).map(([id]) => ({ name: `тип листа ${id}`, ui: () => <SheetTab />, pick: { activeSheetKind: id } })),
  ...firstOfEachTable(compendium).map(id => ({ name: `запись ${id}`, ui: () => <CompendiumScreen />, pick: { activeRecordId: id } })),
  { name: 'Правила', ui: () => <RulesTab />, pick: {} },
  ...Object.keys(system.effects ?? {}).map(id => ({ name: `эффект ${id}`, ui: () => <EffectsTab />, pick: { activeEffectId: id } })),
  ...recordKinds(system).map(([id]) => ({ name: `книга ${id}`, ui: () => <RecordsTab />, pick: { activeRecordKind: id } })),
];

const load = (world: SampleWorld, pick: Record<string, unknown>): void => {
  useWorld.setState(state => ({
    ...state, system: structuredClone(world.system), compendium: structuredClone(world.compendium),
    activeFieldTag: null, activeGroupName: null, activeEffectId: null, activeRecordKind: null,
    activeSheetKind: null, activeStepIndex: null, activeTableId: null, activeRecordId: null,
    ...pick,
  }));
};

const reveal = (): void => {
  openAll();
  document.querySelectorAll('details').forEach(d => { d.open = true; });
};

const labelOf = (el: Element): string => {
  const field = el.closest('label, .field, .sheet-grid__cell, .row');
  const head = field?.querySelector('.field__label, .sheet-grid__title, label')?.textContent ?? '';
  return `${el.tagName.toLowerCase()}${head ? ` «${head.trim().slice(0, 40)}»` : ''} = ${JSON.stringify((el as HTMLInputElement).value)}`;
};

const idle = (el: Element): void => {
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

describe('пресет не портится редактором: холостой коммит в каждом поле', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  const quick = ['13th Age', 'Blades in the Dark'];
  const chosen = process.env.ROUND_TRIP === 'full' ? SAMPLE_WORLDS : SAMPLE_WORLDS.filter(world => quick.includes(String(world.system.name)));

  for (const world of chosen) {
    it(`${world.system.name ?? world.system.id}`, () => {
      const base = structuredClone(world);
      const found: string[] = [];
      for (const view of viewsOf(base.system, base.compendium)) {
        load(base, view.pick);
        render(view.ui());
        reveal();
        const count = document.querySelectorAll('select, input, textarea').length;
        for (let index = 0; index < count; index++) {
          const el = document.querySelectorAll('select, input, textarea')[index];
          if (!el || (el as HTMLInputElement).disabled) continue;
          const label = labelOf(el);
          act(() => { idle(el); });
          const { system, compendium } = useWorld.getState();
          const now = { system, compendium };
          const was = { system: base.system, compendium: base.compendium };
          if (!same(was, now)) {
            found.push(`${view.name} · ${label}: ${diff(was, now)}`);
            cleanup();
            load(base, view.pick);
            render(view.ui());
            reveal();
          }
        }
        cleanup();
      }
      expect(found).toEqual([]);
    }, 600000);
  }
});
