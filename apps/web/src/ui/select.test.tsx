// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Select } from './primitives.tsx';

afterEach(() => { cleanup(); });

const KINDS = [['dice', 'кости'], ['number', 'число']] as const;

describe('Select не врёт о том, что лежит в данных', () => {
  it('значение вне списка видно как есть, а не подменяется первым', () => {
    render(<Select value={'text' as never} options={KINDS as never} onChange={() => {}} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;

    expect(select.value, 'показано своё значение, а не «кости»').toBe('text');
    expect(select.options[0]!.textContent).toBe('text — такого в списке нет');
  });

  it('незнакомое значение само не переписывается в данные', () => {
    const onChange = vi.fn();
    render(<Select value={'text' as never} options={KINDS as never} onChange={onChange} />);
    expect(onChange, 'просто показали — ничего не сохранили').not.toHaveBeenCalled();
  });

  it('пустое значение без пустого варианта читается словами', () => {
    render(<Select value={'' as never} options={KINDS as never} onChange={() => {}} />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).options[0]!.textContent).toBe('— не выбрано —');
  });

  it('знакомое значение ничего лишнего не добавляет', () => {
    render(<Select value={'number' as never} options={KINDS as never} onChange={() => {}} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect([...select.options].map(o => o.value)).toEqual(['dice', 'number']);
  });

  it('выбор из списка доходит до вызвавшего', () => {
    const onChange = vi.fn();
    render(<Select value={'text' as never} options={KINDS as never} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'number' } });
    expect(onChange).toHaveBeenCalledWith('number');
  });
});
