// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useWorld } from '../../../store/world.ts';
import { RulesTab } from './rules-tab.tsx';
import type { System } from '@vtt/schema';

describe('«открыть таблицу →» из поля листа', () => {
  afterEach(() => { cleanup(); });

  it('правила открываются на таблицах, нужная раскрыта', () => {
    Element.prototype.scrollIntoView = () => {};
    const system = {
      fields: [], constants: {}, effects: {},
      tables: {
        расы: { label: 'Расы', key: 'word', rows: [{ value: 'эльф', label: 'эльф' }] },
        классы: { label: 'Классы', key: 'word', rows: [{ value: 'воин', label: 'воин' }] },
      },
    } as unknown as System;
    useWorld.setState(state => ({ ...state, system, activeTableId: 'расы' }));
    render(<RulesTab />);
    const opened = [...document.querySelectorAll('details[open] > summary')].map(s => s.textContent ?? '');
    expect(opened.some(t => t.startsWith('Расы'))).toBe(true);
    expect(opened.some(t => t.startsWith('Классы'))).toBe(false);
    expect(useWorld.getState().activeTableId).toBeNull();
  });
});
