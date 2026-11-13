// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { world as W } from '@vtt/schema';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { useWorld, emptySystem } from '../../store/world.ts';
import { SheetTab } from './sheet-tab.tsx';
import { RulesTab } from './rules/rules-tab.tsx';
import { EffectsTab } from './effects/effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';
import type { System } from '@vtt/schema';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';

const BASES: [string, () => System][] = [
  ['пустая система', emptySystem],
  ...SAMPLE_SYSTEMS.map((s): [string, () => System] => [String(s.name ?? s.id), () => structuredClone(s) as System]),
];

const TABS: [string, () => ReactElement][] = [
  ['Лист', () => <SheetTab />],
  ['Правила', () => <RulesTab />],
  ['Эффекты', () => <EffectsTab />],
  ['Типы записей', () => <RecordsTab />],
];

const issues = (): string[] => {
  const parsed = W.system.safeParse(useWorld.getState().system);
  return parsed.success ? [] : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
};

const load = (system: System): void => {
  useWorld.setState(state => ({
    ...state, system,
    activeFieldTag: null, activeGroupName: null, activeEffectId: null, activeRecordKind: null,
  }));
};

const addButtons = (root: HTMLElement): HTMLButtonElement[] =>
  [...root.querySelectorAll('button')]
    .filter(b => !b.disabled && (b.textContent ?? '').trimStart().startsWith('+'));

const KNOWN_DEFECTS: string[] = [];

const seen: string[] = [];

const unexpected = (found: string[]): string[] => {
  seen.push(...found);
  return [...new Set(found)].filter(line => !KNOWN_DEFECTS.some(known => line.includes(known)));
};

const picksOf = (tab: string, system: System): Record<string, string | null>[] => {
  if (tab === 'Эффекты') return Object.keys(system.effects).map(id => ({ activeEffectId: id }));
  if (tab === 'Типы записей') return Object.keys(system.records ?? {}).map(id => ({ activeRecordKind: id }));
  if (tab === 'Лист') return fieldsOf(system).map(f => ({ activeFieldTag: f.tag }));
  return [{}];
};

describe('конструктор не порождает систему, которая не проходит схему', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { cleanup(); });

  for (const [baseName, base] of BASES) {
    const heavy = baseName.startsWith('Shadowrun') && !['full', baseName].includes(process.env.ROUND_TRIP ?? '');
    for (const [tabName, tab] of TABS) {
      it.skipIf(heavy)(`${tabName} · ${baseName}: каждая кнопка «+» оставляет систему верной`, () => {
        load(base());
        expect(issues()).toEqual([]);
        const found: string[] = [];

        const first = render(tab());
        const labels = addButtons(first.container).map(b => (b.textContent ?? '').trim());
        first.unmount();

        for (const label of labels) {
          load(base());
          const view = render(tab());
          const button = addButtons(view.container).find(b => (b.textContent ?? '').trim() === label);
          if (button) {
            fireEvent.click(button);
            for (const line of issues()) found.push(`кнопка «${label}»: ${line}`);

            for (const nested of addButtons(view.container)) {
              const nestedLabel = (nested.textContent ?? '').trim();
              if (labels.includes(nestedLabel)) continue;
              fireEvent.click(nested);
              for (const line of issues()) found.push(`кнопка «${label}» → «${nestedLabel}»: ${line}`);
            }
          }
          view.unmount();
        }

        expect(unexpected(found)).toEqual([]);
      }, 300000);

      it.skipIf(heavy)(`${tabName} · ${baseName}: пустой вариант любого списка оставляет систему верной`, () => {
        const found: string[] = [];
        const picks = picksOf(tabName, base());
        for (const pick of picks.length ? picks : [{}]) {
          load(base());
          useWorld.setState(state => ({ ...state, ...pick }));
          const view = render(tab());
          const LISTS = '.combo--select:not(.combo--multi) > [role="combobox"][data-blank]';
          const count = view.container.querySelectorAll(LISTS).length;
          for (let index = 0; index < count; index++) {
            const combo = view.container.querySelectorAll<HTMLInputElement>(LISTS)[index];
            if (!combo || combo.disabled || combo.dataset.value === '') continue;
            act(() => { fireEvent.focus(combo); });
            const blank = [...combo.closest('.combo')!.querySelectorAll<HTMLElement>('.slot__option')].find(o => o.dataset.value === '');
            if (!blank) { act(() => { fireEvent.blur(combo); }); continue; }
            const label = blank.textContent;
            const before = structuredClone(useWorld.getState().system);
            act(() => { fireEvent.mouseDown(blank); fireEvent.blur(combo); });
            for (const line of issues()) found.push(`${JSON.stringify(pick)} · список «${label}»: ${line}`);
            useWorld.setState(state => ({ ...state, system: before }));
          }
          view.unmount();
        }
        expect(unexpected(found)).toEqual([]);
      }, 300000);
    }
  }

  it('список известных дефектов не устарел: исправленное убирается из него', () => {
    const stale = KNOWN_DEFECTS.filter(known => !seen.some(line => line.includes(known)));
    expect(stale).toEqual([]);
  });
});
