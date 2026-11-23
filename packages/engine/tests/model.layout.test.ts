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
    { key: 'Всё', parts: [{ table: 'лист' }] },
    { key: 'Защита', parts: [{ table: 'лист', columns: ['кд'] }] },
    { key: 'Навыки', parts: [{ table: 'навыки', columns: ['ранг'], rows: ['атлетика'], by: 'база' }] },
  ],
} as unknown as System);

describe('раскладка листа следует за правками таблиц', () => {
  it('поле стоит во всех блоках, куда его поставили, по порядку блоков', () => {
    const s = system();
    expect(fieldOf(s, 'кд')!.placements!.map(p => p.group)).toEqual(['Всё', 'Защита']);
    expect(fieldOf(s, 'хиты')!.placements!.map(p => p.group)).toEqual(['Всё']);
    expect(fieldOf(s, 'навыки.атлетика.ранг')!.placements).toEqual([{ group: 'Навыки', sectionBy: 'навыки.атлетика.база', order: 0 }]);
  });

  it('переименование колонки и строки правит ссылки в блоках', () => {
    const s = system();
    renameLayoutColumn(s, 'навыки', 'ранг', 'уровень');
    renameLayoutColumn(s, 'навыки', 'база', 'основа');
    renameRow(s, 'навыки', 'атлетика', 'атлетизм');
    expect(s.blocks![2]!.parts[0]).toEqual({ table: 'навыки', columns: ['уровень'], rows: ['атлетизм'], by: 'основа' });
  });

  it('уборка: пропавшие колонки, строки и таблицы уходят; «все в порядке таблицы» снимает ключ; пустой блок остаётся', () => {
    const s = system();
    s.blocks!.push({ key: 'Новый', parts: [] });
    s.tables!.навыки!.rows = s.tables!.навыки!.rows!.filter(r => r.value !== 'атлетика');
    s.blocks![1]!.parts[0]!.columns = ['хиты', 'кд'];
    s.blocks![0]!.parts.push({ table: 'нет_такой' });
    tidyLayout(s);
    expect(s.blocks!.map(b => [b.key, b.parts])).toEqual([
      ['Всё', [{ table: 'лист' }]],
      ['Защита', [{ table: 'лист' }]],
      ['Навыки', []],
      ['Новый', []],
    ]);
  });

  it('все колонки, но в своём порядке — раскладка хранит порядок, и блок рисует поля в нём', async () => {
    const { fieldsByBlock } = await import('../src/model/blocks.ts');
    const s = system();
    s.blocks![1]!.parts[0]!.columns = ['кд', 'хиты'];
    tidyLayout(s);
    expect(s.blocks![1]!.parts[0]!.columns).toEqual(['кд', 'хиты']);
    const shown = fieldsByBlock(s).find(([name]) => name === 'Защита')![1].map(f => f.tag);
    expect(shown).toEqual(['кд', 'хиты']);
  });

  it('список из всех колонок, что дают поля, — это «все»: колонка, заполненная в правилах, не мешает', () => {
    const s = system();
    s.tables!.навыки!.columns!.push({ key: 'природа', label: 'Природа', kind: 'text' });
    for (const row of s.tables!.навыки!.rows!) row.cells = { природа: 'общая' };
    s.blocks = [{ key: 'Навыки', parts: [{ table: 'навыки', columns: ['ранг', 'база'] }] }];
    tidyLayout(s);
    expect(s.blocks[0]!.parts[0]!.columns).toBeUndefined();
    s.blocks = [{ key: 'Навыки', parts: [{ table: 'навыки', columns: ['база', 'ранг'] }] }];
    tidyLayout(s);
    expect(s.blocks[0]!.parts[0]!.columns).toEqual(['база', 'ранг']);
  });
});
