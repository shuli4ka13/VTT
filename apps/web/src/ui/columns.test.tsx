// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Columns } from './layout.tsx';

const page = () => (
  <Columns
    left={{ head: 'Разделы', body: <span>список слева</span> }}
    main={{ body: <span>работа</span> }}
    right={{ head: 'Готовое', body: <span>палитра справа</span> }}
  />
);

describe('боковые панели сворачиваются', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  it('свернул — остаётся узкая полоса с названием, работа на месте; развернул — всё вернулось', () => {
    render(page());
    fireEvent.click(screen.getByLabelText('свернуть «Разделы»'));
    expect(screen.queryByText('список слева')).toBeNull();
    expect(document.querySelector('.columns')!.className).toContain('columns--l-folded');
    expect(screen.getByText('Разделы')).toBeTruthy();
    expect(screen.getByText('работа')).toBeTruthy();
    expect(screen.getByText('палитра справа')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('развернуть «Разделы»'));
    expect(screen.getByText('список слева')).toBeTruthy();
  });

  it('свёрнутая панель остаётся свёрнутой при следующем открытии экрана', () => {
    render(page());
    fireEvent.click(screen.getByLabelText('свернуть «Готовое»'));
    cleanup();
    render(page());
    expect(screen.queryByText('палитра справа')).toBeNull();
    expect(document.querySelector('.columns')!.className).toContain('columns--r-folded');
  });
});
