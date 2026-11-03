// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PickOrder, moveKey } from './pick-order.tsx';

describe('что показывать и в каком порядке', () => {
  afterEach(cleanup);

  it('снять — убирает, отметить — ставит в конец, перенос меняет порядок', () => {
    const got: string[][] = [];
    render(<PickOrder keys={['а', 'б', 'в']} chosen={['в', 'а']} labelOf={key => key.toUpperCase()} onChange={next => got.push(next)} />);
    expect([...document.querySelectorAll('.drag-item')].map(node => node.textContent)).toEqual(['⋮⋮В', '⋮⋮А']);
    fireEvent.click(screen.getByLabelText('А'));
    fireEvent.click(screen.getByLabelText('Б'));
    expect(got).toEqual([['в'], ['в', 'а', 'б']]);
    expect(moveKey(['в', 'а', 'б'], 'б', 'в', false)).toEqual(['б', 'в', 'а']);
  });
});
