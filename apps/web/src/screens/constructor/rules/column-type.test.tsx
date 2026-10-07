// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { System, TableColumn } from '@vtt/schema';
import { TableColumnCard } from './tables-section.tsx';

describe('тип колонки с формулой', () => {
  it('«по формуле» снимает тип: значение даёт сама формула', () => {
    const column: TableColumn = { key: 'без_сил', label: 'Без сил', kind: 'number', expr: { expr: '@хиты <= 0' } } as TableColumn;
    const system = { tables: { лист: { shape: 'single', columns: [column] } }, constants: {}, effects: {} } as unknown as System;
    render(<TableColumnCard id="лист" table={system.tables!.лист!} column={column} system={system}
      edit={change => change(system.tables!.лист!)} onClose={() => {}} />);
    const type = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.text === 'по формуле'))!;
    fireEvent.change(type, { target: { value: '' } });
    expect(column.kind).toBeUndefined();
    expect(screen.getAllByText('по формуле').length).toBeGreaterThan(0);
  });
});
