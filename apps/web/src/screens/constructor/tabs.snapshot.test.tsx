// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import type { System } from '@vtt/schema';
import { useWorld } from '../../store/world.ts';
import { TABS } from '../../words.ts';
import { SheetTab } from './sheet-tab.tsx';
import { DictionariesTab } from './dictionaries.tsx';
import { EffectsTab } from './effects/effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';

const sample = (): System => structuredClone(SAMPLE_SYSTEMS[0]) as System;

const SCREENS: [string, () => ReactElement][] = [
  [TABS.sheet, () => <SheetTab />],
  [TABS.rules, () => <DictionariesTab />],
  [TABS.effects, () => <EffectsTab />],
  [TABS.records, () => <RecordsTab />],
];

const textOf = (root: HTMLElement): string => (root.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('четыре вкладки конструктора над образцом D&D 5e', () => {
  afterEach(() => { cleanup(); });

  it.each(SCREENS)('вкладка «%s» читается так', (_name, make) => {
    const system = sample();
    useWorld.setState(state => ({
      ...state, system,
      activeFieldTag: system.fields[0]?.tag ?? null,
      activeGroupName: null,
      activeEffectId: Object.keys(system.effects)[0] ?? null,
      activeRecordKind: Object.keys(system.records ?? {})[0] ?? null,
    }));
    const { container } = render(make());
    expect(textOf(container)).toMatchSnapshot();
  });
});
