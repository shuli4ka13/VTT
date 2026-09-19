// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { world as W } from '@vtt/schema';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { useWorld, emptySystem } from '../../store/world.ts';
import { SheetTab } from './sheet-tab.tsx';
import { DictionariesTab } from './dictionaries.tsx';
import { EffectsTab } from './effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';
import type { System } from '@vtt/schema';

const BASES: [string, () => System][] = [
  ['пустая система', emptySystem],
  ...SAMPLE_SYSTEMS.map((s): [string, () => System] => [String(s.name ?? s.id), () => structuredClone(s) as System]),
];

const TABS: [string, () => ReactElement][] = [
  ['Лист', () => <SheetTab />],
  ['Правила', () => <DictionariesTab />],
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
  if (tab === 'Лист') return system.fields.map(f => ({ activeFieldTag: f.tag }));
  return [{}];
};

describe('конструктор не порождает систему, которая не проходит схему', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { cleanup(); });

  for (const [baseName, base] of BASES) {
    for (const [tabName, tab] of TABS) {
      it(`${tabName} · ${baseName}: каждая кнопка «+» оставляет систему верной`, () => {
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
      });

      it(`${tabName} · ${baseName}: пустой вариант любого списка оставляет систему верной`, () => {
        const found: string[] = [];
        const picks = picksOf(tabName, base());
        for (const pick of picks.length ? picks : [{}]) {
          load(base());
          useWorld.setState(state => ({ ...state, ...pick }));
          const view = render(tab());
          const count = view.container.querySelectorAll('select').length;
          for (let index = 0; index < count; index++) {
            const select = view.container.querySelectorAll('select')[index];
            if (!select || select.disabled) continue;
            const blank = [...select.options].find(o => o.value === '');
            if (!blank) continue;
            const before = structuredClone(useWorld.getState().system);
            fireEvent.change(select, { target: { value: '' } });
            for (const line of issues()) found.push(`${JSON.stringify(pick)} · список «${blank.textContent}»: ${line}`);
            useWorld.setState(state => ({ ...state, system: before }));
          }
          view.unmount();
        }
        expect(unexpected(found)).toEqual([]);
      });
    }
  }

  it('список известных дефектов не устарел: исправленное убирается из него', () => {
    const stale = KNOWN_DEFECTS.filter(known => !seen.some(line => line.includes(known)));
    expect(stale).toEqual([]);
  });
});
