// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/react';
import { renderOpen } from '../../../testing/render-open.tsx';
import { EffectsTab } from './effects-tab.tsx';
import { useWorld } from '../../../store/world.ts';

const area = (label: string) => document.querySelector<HTMLTextAreaElement>(`[data-field="${label}"] textarea`)!;

describe('эффект: описание и заметка автора — многострочные', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: { ...state.system, effects: { strike: { label: 'Атака', activation: 'manual', params: [], steps: [] } } },
      activeEffectId: 'strike',
    }));
  });
  afterEach(cleanup);

  it('заметка пишет ключ и снимает его при пустом значении', () => {
    renderOpen(<EffectsTab />);
    fireEvent.change(area('Заметка автора'), { target: { value: 'проверить с ведущим' } });
    expect(useWorld.getState().system.effects.strike!.note).toBe('проверить с ведущим');
    fireEvent.change(area('Заметка автора'), { target: { value: '' } });
    expect('note' in useWorld.getState().system.effects.strike!).toBe(false);
  });

  it('описание — тоже многострочное поле и снимает ключ', () => {
    renderOpen(<EffectsTab />);
    fireEvent.change(area('Описание'), { target: { value: 'первая\nвторая строка' } });
    expect(useWorld.getState().system.effects.strike!.description).toBe('первая\nвторая строка');
    fireEvent.change(area('Описание'), { target: { value: '' } });
    expect('description' in useWorld.getState().system.effects.strike!).toBe(false);
  });
});
