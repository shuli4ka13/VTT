// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { GrantsEditor } from './grants-editor.tsx';
import { emptySystem } from '../../store/world.ts';

describe('GrantsEditor', () => {
  afterEach(() => { cleanup(); });
  const system = emptySystem();

  it('без onCreate кнопки нет, подсказка полная', () => {
    render(<GrantsEditor system={system} value={undefined} onChange={() => {}} />);
    expect(screen.queryByText('+ новое правило')).toBeNull();
    expect(screen.getByText(/заведите эффект на вкладке «Эффекты»/)).toBeTruthy();
  });

  it('с onCreate — кнопка вызывает колбэк, подсказка короткая', () => {
    const onCreate = vi.fn();
    render(<GrantsEditor system={system} value={undefined} onChange={() => {}} onCreate={onCreate} />);
    expect(screen.getByText('Выдавать пока нечего.')).toBeTruthy();
    fireEvent.click(screen.getByText('+ новое правило'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
