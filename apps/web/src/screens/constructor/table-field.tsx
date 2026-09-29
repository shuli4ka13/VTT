import { useWorld, useBook } from '../../store/world.ts';
import { LiveValue } from './live-value.tsx';
import { BlockPick } from './block-pick.tsx';
import { CONTROLS } from '../../sheet/controls/index.tsx';
import { Card, CardHead, Field, Input, Select, Button, Fold, DangerButton, Chip } from '../../ui/primitives.tsx';
import { isRange } from '@vtt/engine/model/tables';
import { rowKeyOf, cellSource, onSheet, viewOf } from '@vtt/engine/model/sheet-columns';
import type { Field as FieldModel, System, TableViewColumn } from '@vtt/schema';

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

export function TableFieldEditor({ field, system }: { field: FieldModel; system: System }) {
  const compendium = useBook();
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const cell = field.cell!;
  const table = system.tables?.[cell.table];
  const column = table?.columns?.find(c => c.key === cell.column);
  if (!table || !column || !onSheet(table)) return null;
  const count = (table.rows ?? []).length;
  const row = (table.rows ?? []).find(r => rowKeyOf(r) === cell.row);
  const view = viewOf(table, column.key);

  const setView = (change: (v: TableViewColumn) => void) => editSystem(draft => {
    const target = draft.tables?.[cell.table];
    if (!target?.sheet) return;
    const columns = (target.sheet.columns ??= {});
    const own = (columns[cell.column] ??= {});
    change(own);
    if (!Object.keys(own).length) delete columns[cell.column];
  });
  const stored = field.value.kind === 'stored';

  return (
    <Card>
      <CardHead
        title={field.label || field.tag}
        sub={<Chip>таблица «{table.label || cell.table}» · строка «{row?.label ?? cell.row}»</Chip>}
        actions={<>
          <Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeTableId: cell.table })}>Открыть таблицу</Button>
          <DangerButton size="sm" onConfirm={() => {
            editSystem(draft => { const target = draft.tables?.[cell.table]; if (target) delete target.sheet; });
            pick({ activeFieldTag: null });
          }}>Убрать таблицу с листа</DangerButton>
        </>}
      />
      <span className="faint">«{column.label || column.key}» — для всех {count} строк</span>
      <div className="row">
        <Field label="Блок">
          <BlockPick of="fields" system={system} value={field.group}
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
      </div>
      {stored ? null : (
        <>
          <span className="faint">считается формулой — она правится в таблице</span>
          {field.value.kind === 'formula'
            ? <LiveValue system={system} compendium={compendium} tag={field.tag} source={field.value.expr} />
            : null}
        </>
      )}
      <Fold title="ещё">
        <div className="row">
          <Field label="Подпись">
            <Input value={view.label ?? ''} placeholder={field.label}
              onChange={next => setView(v => { if (next.trim()) v.label = next; else delete v.label; })} />
          </Field>
        </div>
      </Fold>
    </Card>
  );
}
