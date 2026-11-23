// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FieldCell } from '../sheet/field-cell.tsx';
import { fieldOf } from '@vtt/engine';
import { useLocale } from '../store/locale.ts';
import type { System, Sheet } from '@vtt/schema';
import type { Reader } from '../engine/use-calc.ts';

const system = {
  id: 'кости', name: 'Кости',
  tables: { лист: { shape: 'single', owner: 'sheet', columns: [
    { key: 'урон', label: 'Кость урона', kind: 'dice', default: '1d8' },
    { key: 'хитов', label: 'Кость хитов', kind: 'dice', expr: { expr: '"1d12"' } },
    { key: 'прозвище', label: 'Прозвище', kind: 'text', default: 'd20' },
  ] } },
} as unknown as System;

const sheet = { id: 'а', name: 'Арвен', values: {} } as unknown as Sheet;

const reader = (stored: Record<string, unknown> = {}): Reader => ({
  valueOf: tag => ({ ok: true, value: tag === 'хитов' ? '1d12' : stored[tag] ?? null }),
  rollOf: () => null,
  storedOf: tag => stored[tag],
});

describe('поле-кость на листе: в данных d, на экране буква языка', () => {
  afterEach(() => { cleanup(); useLocale.setState({ lang: 'ru' }); });

  it('посчитанная кость показана через «к», по-английски — через d', () => {
    render(<FieldCell field={fieldOf(system, 'хитов')!} system={system} sheet={sheet} reader={reader()} />);
    expect(screen.getByText('1к12')).toBeTruthy();
    cleanup();
    useLocale.setState({ lang: 'en' });
    render(<FieldCell field={fieldOf(system, 'хитов')!} system={system} sheet={sheet} reader={reader()} />);
    expect(screen.getByText('1d12')).toBeTruthy();
  });

  it('вписанное «2к6» уходит в данные как 2d6, а показано снова через «к»', () => {
    const sent: unknown[] = [];
    render(<FieldCell field={fieldOf(system, 'урон')!} system={system} sheet={sheet} reader={reader({ урон: '1d8' })} onChange={(_, value) => sent.push(value)} />);
    const input = screen.getByDisplayValue('1к8');
    fireEvent.change(input, { target: { value: '2к6' } });
    expect(sent).toEqual(['2d6']);
  });

  it('текстовое поле, похожее на кость, не трогается', () => {
    const sent: unknown[] = [];
    render(<FieldCell field={fieldOf(system, 'прозвище')!} system={system} sheet={sheet} reader={reader({ прозвище: 'd20' })} onChange={(_, value) => sent.push(value)} />);
    const input = screen.getByDisplayValue('d20');
    fireEvent.change(input, { target: { value: 'к20' } });
    expect(sent).toEqual(['к20']);
  });
});
