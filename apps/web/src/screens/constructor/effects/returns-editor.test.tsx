// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { ReturnsEditor } from './returns-editor.tsx';
import { useWorld, emptySystem } from '../../../store/world.ts';
import type { Effect, System } from '@vtt/schema';
import { within } from '../../../testing/cards.ts';
import { openAll } from '../../../testing/render-open.tsx';

const effect = {
  label: 'Бросок атаки', activation: 'manual',
  params: [{ key: 'кто', label: 'Кто бросает', kind: 'sheet' }],
  steps: [{ id: 'бросок', type: 'roll', fixed: { expr: '0' } }],
  returns: [{ key: 'крит', label: 'крит', kind: 'boolean', expr: { expr: '@бросок.natural >= @кто.crit_from' } }],
} as unknown as Effect;

describe('итоги эффекта: «Откуда» формулой', () => {
  beforeEach(() => { cleanup(); useWorld.setState(state => ({ ...state, system: { ...emptySystem(), effects: { атака: effect } } as unknown as System })); });
  afterEach(() => { cleanup(); });

  it('произвольная формула — в поле формулы с названиями, а не сырым текстом', () => {
    const system = useWorld.getState().system;
    render(<ReturnsEditor id="атака" effect={effect} system={system} onEdit={() => {}} />);
    openAll();
    const card = document.querySelector<HTMLElement>('.card')!;
    expect(card.querySelector('.param-line__sum')?.textContent).not.toContain('@бросок.natural');
    act(() => { fireEvent.click(card.querySelector('.param-line__sum')!); });
    openAll();
    const from = within(card).cell('Откуда');
    expect(from.querySelector('.chips__chip')).not.toBeNull();
    expect(from.querySelector('[role="combobox"]')).toBeNull();
    expect(from.textContent).toContain('что выпало на костях');
    expect(from.querySelector('.chips')!.getAttribute('data-value')).not.toContain('что выпало');
  });
});
