// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { pickCombo } from '../../../testing/cards.ts';
import { useWorld } from '../../../store/world.ts';
import { RulesTab } from './rules-tab.tsx';
import type { System } from '@vtt/schema';

describe('пустая клетка-выбор: «вводит игрок» у таблицы с владельцем, «— нет —» у справочника, но не «выберите»', () => {
  afterEach(() => { cleanup(); });

  it('выбор и «да/нет» подписывают пустую клетку так же, как число; выбор «вводит игрок» снимает значение', () => {
    Element.prototype.scrollIntoView = () => {};
    const system = { constants: {}, effects: {},
      tables: {
        ступени: { label: 'Ступени', key: 'number', rows: [{ value: 0, label: 'нет' }, { value: 1, label: 'есть' }] },
        навыки: { label: 'Навыки', key: 'word', owner: 'sheet',
          columns: [
            { key: 'владение', label: 'Владение', kind: 'choice', from: 'ступени' },
            { key: 'метка', label: 'Метка', kind: 'boolean' },
          ],
          rows: [{ value: 'атлетика', label: 'Атлетика', cells: { владение: 1 } }, { value: 'магия', label: 'Магия' }] },
      },
    } as unknown as System;
    useWorld.setState(state => ({ ...state, system, activeTableId: 'навыки' }));
    render(<RulesTab />);
    const selects = [...document.querySelectorAll<HTMLInputElement>('details[open] [role="combobox"]')];
    const shown = selects.map(s => s.value);
    expect(shown).not.toContain('— выберите —');
    expect(shown.filter(t => t === 'вводит игрок').length).toBe(3);
    const fixed = selects.find(s => s.dataset.value === '1')!;
    pickCombo(fixed, '');
    expect(useWorld.getState().system.tables!.навыки!.rows![0]!.cells?.владение).toBeUndefined();
  });

  it('в справочнике пустая клетка — «— нет —»', () => {
    Element.prototype.scrollIntoView = () => {};
    const system = { constants: {}, effects: {},
      tables: {
        черты: { label: 'Черты', key: 'word', rows: [{ value: 'сила', label: 'Сила' }] },
        классы: { label: 'Классы', key: 'word', columns: [{ key: 'черта', label: 'Черта', kind: 'choice', from: 'черты' }], rows: [{ value: 'воин' }] },
      },
    } as unknown as System;
    useWorld.setState(state => ({ ...state, system, activeTableId: 'классы' }));
    render(<RulesTab />);
    const shown = [...document.querySelectorAll<HTMLInputElement>('details[open] [role="combobox"]')].map(s => s.value);
    expect(shown).toContain('— нет —');
    expect(shown).not.toContain('— выберите —');
  });
});
