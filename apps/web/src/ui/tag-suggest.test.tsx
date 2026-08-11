// apps/web/src/ui/tag-suggest.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { matchTagQuery, applyTag, TagInput } from './tag-suggest.tsx';
import type { System } from '@vtt/schema';

const system = {
  fields: [
    { tag: 'бонус_атаки', label: 'Бонус атаки', value: { kind: 'formula', expr: '1' } },
    { tag: 'сила', label: 'Сила', value: { kind: 'stored', type: 'number', default: 10 } },
  ],
  constants: {}, effects: {},
} as unknown as System;

describe('matchTagQuery', () => {
  it('ловит запрос за решёткой и за собакой, с пробелами в названии', () => {
    expect(matchTagQuery('1d20 + @бонус ат', 16)).toEqual({ at: 7, needle: 'бонус ат' });
    expect(matchTagQuery('#сил', 4)).toEqual({ at: 0, needle: 'сил' });
  });

  it('без сигила запроса нет', () => {
    expect(matchTagQuery('1d20 + 5', 8)).toBeNull();
  });
});

describe('applyTag', () => {
  it('заменяет запрос тегом и ставит каретку за ним', () => {
    expect(applyTag('1d20 + @бонус ат', 7, 16, 'бонус_атаки'))
      .toEqual({ next: '1d20 + #бонус_атаки', caretTo: 19 });
  });
});

describe('TagInput', () => {
  it('набрал @бон — подсказка предлагает поле по названию, клик вставляет тег', () => {
    let value = '1d20 + @бон';
    const { rerender } = render(
      <TagInput value={value} system={system} onChange={next => { value = next; }} />,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(value.length, value.length);
    fireEvent.keyUp(input);
    const option = screen.getByText('Бонус атаки');
    fireEvent.mouseDown(option);
    expect(value).toBe('1d20 + #бонус_атаки');
    rerender(<TagInput value={value} system={system} onChange={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('1d20 + #бонус_атаки');
  });
});
