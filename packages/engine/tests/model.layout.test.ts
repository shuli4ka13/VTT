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
    s.blocks!.push({ name: 'Новый', parts: [] });
    s.tables!.навыки!.rows = s.tables!.навыки!.rows!.filter(r => r.value !== 'атлетика');
    s.blocks![1]!.parts[0]!.columns = ['хиты', 'кд'];
    s.blocks![0]!.parts.push({ table: 'нет_такой' });
    tidyLayout(s);
    expect(s.blocks!.map(b => [b.name, b.parts])).toEqual([
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
});
