// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, fireEvent, cleanup, act } from '@testing-library/react';
import { renderOpen } from '../../testing/render-open.tsx';
import { useWorld, emptySystem } from '../../store/world.ts';
import { SheetTab } from './sheet-tab.tsx';
import type { System } from '@vtt/schema';

const system = (): System => ({
  ...emptySystem(),
  tables: {
    черты: { label: 'Черты', key: 'word', rows: [{ value: 'сила', label: 'Сила' }, { value: 'ловкость', label: 'Ловкость' }] },
    навыки: { label: 'Навыки', owner: 'sheet', key: 'word',
      columns: [{ key: 'черта', label: 'Характеристика', kind: 'choice', from: 'черты' }, { key: 'ранг', label: 'Ранг', kind: 'number' }],
      rows: [{ value: 'атлетика', label: 'Атлетика', cells: { черта: 'сила' } }] },
  },
  blocks: [{ name: 'Навыки', parts: [{ table: 'навыки', columns: ['ранг'] }] }],
} as unknown as System);

describe('образец листа: заголовок блока и название строки открывают свои редакторы', () => {
  afterEach(() => { cleanup(); });

  it('заголовок блока — настройки блока, название строки — строка с подписью и клетками', () => {
    act(() => { useWorld.setState(state => ({ ...state, system: system(), activeFieldTag: null, activeBlock: null, activeRow: null, activeColumn: null })); });
    renderOpen(<SheetTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Навыки' }));
    expect(screen.getByText('Блок «Навыки»')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Атлетика' }));
    expect(screen.getByText('Строка «Атлетика»')).toBeTruthy();
    expect(document.querySelector('.column--side')!.textContent).toContain('Характеристика');
  });
});
