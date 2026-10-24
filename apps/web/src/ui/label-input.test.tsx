// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LabelInput } from './primitives.tsx';

afterEach(() => { cleanup(); });

describe('поле названия', () => {
  it('при входе выделяет имя целиком: набор заменяет «Новый вход», а не дописывается к нему', () => {
    const onCommit = vi.fn();
    render(<LabelInput value="Новый вход" onCommit={onCommit} />);
    const input = screen.getByDisplayValue('Новый вход') as HTMLInputElement;

    fireEvent.focus(input);

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Новый вход'.length);
  });
});
