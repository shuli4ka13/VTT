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

  it('изначально свёрнуты: узкая полоса с названием, работа на месте; развернул — всё видно; свернул — снова полоса', () => {
    render(page());
    expect(screen.queryByText('список слева')).toBeNull();
    expect(screen.queryByText('палитра справа')).toBeNull();
    expect(document.querySelector('.columns')!.className).toContain('columns--l-folded');
    fireEvent.click(screen.getByLabelText('развернуть «Разделы»'));
    expect(screen.getByText('список слева')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('свернуть «Разделы»'));
    expect(screen.queryByText('список слева')).toBeNull();
    expect(document.querySelector('.columns')!.className).toContain('columns--l-folded');
    expect(screen.getByText('Разделы')).toBeTruthy();
    expect(screen.getByText('работа')).toBeTruthy();
  });

  it('развёрнутая панель остаётся развёрнутой при следующем открытии экрана', () => {
    render(page());
    fireEvent.click(screen.getByLabelText('развернуть «Готовое»'));
    cleanup();
    render(page());
    expect(screen.getByText('палитра справа')).toBeTruthy();
    expect(document.querySelector('.columns')!.className).not.toContain('columns--r-folded');
  });
});
