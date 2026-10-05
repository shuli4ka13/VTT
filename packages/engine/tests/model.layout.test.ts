import { describe, it, expect } from 'vitest';
import { renameLayoutColumn, renameLayoutRow, tidyLayout } from '../src/model/layout.ts';
import { renameRow } from '../src/model/integrity.ts';
import { fieldOf } from '../src/model/sheet-columns.ts';
import type { System } from '../src/model/types.ts';

const system = (): System => ({
  id: 'x', name: 'x', effects: {},
  tables: {
    лист: { shape: 'single', columns: [{ key: 'хиты', label: 'Хиты', kind: 'number' }, { key: 'кд', label: 'КД', kind: 'number' }] },
    навыки: { owner: 'sheet', key: 'word', columns: [{ key: 'ранг', label: 'Ранг', kind: 'number' }, { key: 'база', label: 'База', kind: 'number' }],
      rows: [{ value: 'атлетика', label: 'Атлетика' }, { value: 'магия', label: 'Магия' }] },
  },
  blocks: [
    { name: 'Всё', parts: [{ table: 'лист' }] },
    { name: 'Защита', parts: [{ table: 'лист', columns: ['кд'] }] },
    { name: 'Навыки', parts: [{ table: 'навыки', columns: ['ранг'], rows: ['атлетика'], by: 'база' }] },
  ],
} as unknown as System);

describe('раскладка листа следует за правками таблиц', () => {
  it('явно названная колонка важнее части «все колонки», даже если та раньше', () => {
    const s = system();
    expect(fieldOf(s, 'кд')!.group).toBe('Защита');
    expect(fieldOf(s, 'хиты')!.group).toBe('Всё');
  });

  it('переименование колонки и строки правит ссылки в блоках', () => {
    const s = system();
    renameLayoutColumn(s, 'навыки', 'ранг', 'уровень');
    renameLayoutColumn(s, 'навыки', 'база', 'основа');
    renameRow(s, 'навыки', 'атлетика', 'атлетизм');
    expect(s.blocks![2]!.parts[0]).toEqual({ table: 'навыки', columns: ['уровень'], rows: ['атлетизм'], by: 'основа' });
  });

  it('уборка: пропавшие колонки, строки и таблицы уходят; «все» снимает ключ; пустой блок остаётся', () => {
    const s = system();
    s.blocks!.push({ name: 'Новый', parts: [] });
    s.tables!.навыки!.rows = s.tables!.навыки!.rows!.filter(r => r.value !== 'атлетика');
    s.blocks![1]!.parts[0]!.columns = ['кд', 'хиты'];
    s.blocks![0]!.parts.push({ table: 'нет_такой' });
    tidyLayout(s);
    expect(s.blocks!.map(b => [b.name, b.parts])).toEqual([
      ['Всё', [{ table: 'лист' }]],
      ['Защита', [{ table: 'лист' }]],
      ['Навыки', []],
      ['Новый', []],
    ]);
  });
});
