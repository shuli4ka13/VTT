import { useWorld } from '../../store/world.ts';
import { BlockPick } from './block-pick.tsx';
import { CONTROLS } from '../../sheet/controls/index.tsx';
import { Card, CardHead, Field, Input, Select, Button, DangerButton, Chip } from '../../ui/primitives.tsx';
import { isRange } from '@vtt/engine/model/tables';
import { cellSource, liveColumnsOf, onSheet, viewOf } from '@vtt/engine/model/sheet-columns';
import type { System, TableColumn, TableViewColumn } from '@vtt/schema';

export const sheetTables = (system: System): [string, string][] =>
  Object.entries(system.tables ?? {})
    .filter(([, table]) => !isRange(table) && !onSheet(table) && (table.rows ?? []).length > 0)
    .map(([id, table]) => [id, table.label || id]);

export function placeOnSheet(draft: System, tableId: string): void {
  const table = draft.tables?.[tableId];
  if (!table) return;
  table.sheet = { group: table.label || tableId };
  if ((table.columns ?? []).some(column => (table.rows ?? []).some(row => cellSource(column, row).kind === 'input'))) return;
  const columns = (table.columns ??= []);
  const taken = new Set(columns.map(c => c.key));
  let key = 'value';
  for (let n = 2; taken.has(key); n++) key = `value_${n}`;
  columns.unshift({ key, label: 'Значение', kind: 'number' });
}

const parseStart = (text: string): number | string => (/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text);

export function TableOnSheet({ tableId, system }: { tableId: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const table = system.tables?.[tableId];
  if (!table || !onSheet(table)) return null;
  const columns = liveColumnsOf(table);
  const count = (table.rows ?? []).length;

  return (
    <>
      <Card>
        <CardHead
          title={table.label || tableId}
          sub={<Chip>таблица · {count} строк</Chip>}
          actions={<>
            <Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeTableId: tableId })}>Открыть таблицу</Button>
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { const target = draft.tables?.[tableId]; if (target) delete target.sheet; });
              pick({ activeFieldTag: null });
            }}>Убрать с листа</DangerButton>
          </>}
        />
      </Card>
      {columns.map(column => <ColumnOnSheet key={column.key} tableId={tableId} column={column} system={system} />)}
    </>
  );
}

function ColumnOnSheet({ tableId, column, system }: { tableId: string; column: TableColumn; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const table = system.tables![tableId]!;
  const view = viewOf(table, column.key);
  const stored = (table.rows ?? []).some(row => cellSource(column, row).kind === 'input');
  const first = system.fields.find(f => f.cell?.table === tableId && f.cell.column === column.key);

  const setView = (change: (v: TableViewColumn) => void) => editSystem(draft => {
    const target = draft.tables?.[tableId];
    if (!target?.sheet) return;
    const columns = (target.sheet.columns ??= {});
    const own = (columns[column.key] ??= {});
    change(own);
    if (!Object.keys(own).length) delete columns[column.key];
  });

  return (
    <Card>
      <CardHead title={column.label || column.key} sub={<Chip>{stored ? 'вводит игрок' : 'считается'}</Chip>} />
      <div className="row">
        <Field label="Блок">
          <BlockPick of="fields" system={system} value={view.group ?? table.sheet?.group}
            onChange={next => setView(v => { if (next) v.group = next; else delete v.group; })} />
        </Field>
        {stored ? (
          <Field label="Как выглядит">
            <Select
              value={view.control ?? ''}
              options={[['', 'обычное поле'],
                ...(Object.keys(CONTROLS) as (keyof typeof CONTROLS)[]).map(key => [key, CONTROLS[key]] as const)] as never}
              onChange={next => setView(v => { if (next) v.control = next as TableViewColumn['control']; else delete v.control; })}
            />
          </Field>
        ) : null}
        {stored ? (
          <Field label="В новом листе">
            <Input value={view.start === undefined ? '' : String(view.start)}
              onChange={text => setView(v => { if (!text.trim()) delete v.start; else v.start = parseStart(text); })} />
          </Field>
        ) : null}
        <Field label="Подпись">
          <Input value={view.label ?? ''} placeholder={first?.label ?? ''}
            onChange={next => setView(v => { if (next.trim()) v.label = next; else delete v.label; })} />
        </Field>
      </div>
    </Card>
  );
}
