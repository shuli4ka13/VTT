import { useWorld, useBook } from '../../store/world.ts';
import { LiveValue } from './live-value.tsx';
import { BlockPick } from './block-pick.tsx';
import { CONTROLS } from '../../sheet/controls/index.tsx';
import { Card, CardHead, Field, Input, Select, Button, Fold, DangerButton, Chip } from '../../ui/primitives.tsx';
import { isRange } from '@vtt/engine/model/tables';
import { rowKeyOf } from '@vtt/engine/model/sheet-columns';
import type { Field as FieldModel, System, Table, TableColumn } from '@vtt/schema';

type Sheet = NonNullable<TableColumn['sheet']>;

const VALUE_KINDS = ['number', 'text', 'boolean', 'choice'];

const empty = (table: Table, column: TableColumn): boolean =>
  (table.rows ?? []).every(row => {
    const cell = (row.cells ?? {})[column.key];
    return cell === undefined || cell === '';
  });

const placeable = (table: Table, column: TableColumn): boolean =>
  !column.sheet && (column.kind === 'expr' || (VALUE_KINDS.includes(column.kind ?? 'text') && empty(table, column)));

export const sheetTables = (system: System): [string, string][] =>
  Object.entries(system.tables ?? {})
    .filter(([, table]) => !isRange(table) && (table.rows ?? []).length > 0)
    .map(([id, table]) => [id, table.label || id]);

export function placeOnSheet(draft: System, tableId: string): void {
  const table = draft.tables?.[tableId];
  if (!table) return;
  const columns = (table.columns ??= []);
  if (!columns.some(c => c.kind !== 'expr' && placeable(table, c))) {
    const taken = new Set(columns.map(c => c.key));
    let key = 'value';
    for (let n = 2; taken.has(key); n++) key = `value_${n}`;
    columns.unshift({ key, label: 'Значение', kind: 'number' });
  }
  const tagged = columns.some(c => c.sheet?.tag === '{key}');
  let first = !tagged;
  for (const column of columns) {
    if (!placeable(table, column)) continue;
    const name = column.label || column.key;
    column.sheet = first
      ? { tag: '{key}', label: '{label}', group: table.label || tableId }
      : { tag: `{key}_${column.key}`, label: `${name}: {label}`, group: table.label || tableId };
    first = false;
  }
}

export function TableFieldEditor({ field, system }: { field: FieldModel; system: System }) {
  const compendium = useBook();
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const cell = field.cell!;
  const table = system.tables?.[cell.table];
  const column = table?.columns?.find(c => c.key === cell.column);
  if (!table || !column?.sheet) return null;
  const count = (table.rows ?? []).length;
  const row = (table.rows ?? []).find(r => rowKeyOf(r) === cell.row);

  const setColumn = (change: (c: TableColumn) => void) => editSystem(draft => {
    const target = draft.tables?.[cell.table]?.columns?.find(c => c.key === cell.column);
    if (target) change(target);
  });
  const setSheet = (change: (s: Sheet) => void) => setColumn(c => { if (c.sheet) change(c.sheet); });
  const stored = column.kind !== 'expr';
  const own = row && (row.cells ?? {})[column.key] !== undefined;

  return (
    <Card>
      <CardHead
        title={field.label || field.tag}
        sub={<Chip>таблица «{table.label || cell.table}» · строка «{row?.label ?? cell.row}»</Chip>}
        actions={<>
          <Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeTableId: cell.table })}>Открыть таблицу</Button>
          <DangerButton size="sm" onConfirm={() => {
            setColumn(c => { delete c.sheet; });
            pick({ activeFieldTag: null });
          }}>Убрать с листа</DangerButton>
        </>}
      />
      <span className="faint">для всех {count} строк</span>
      <div className="row">
        <Field label="Блок">
          <BlockPick of="fields" system={system} value={column.sheet.group}
            onChange={next => setSheet(s => { if (next) s.group = next; else delete s.group; })} />
        </Field>
        {stored ? (
          <Field label="Как выглядит">
            <Select
              value={column.sheet.control ?? ''}
              options={[['', 'обычное поле'],
                ...(Object.keys(CONTROLS) as (keyof typeof CONTROLS)[]).map(key => [key, CONTROLS[key]] as const)] as never}
              onChange={next => setSheet(s => { if (next) s.control = next as Sheet['control']; else delete s.control; })}
            />
          </Field>
        ) : null}
        {stored ? (
          <Field label="Сначала">
            <Input value={column.start === undefined ? '' : String(column.start)}
              onChange={text => setColumn(c => {
                if (!text.trim()) delete c.start;
                else c.start = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
              })} />
          </Field>
        ) : null}
      </div>
      {stored ? null : (
        <>
          <span className="faint">{own ? 'у этой строки своя формула' : 'формула колонки'} — правится в таблице</span>
          {field.value.kind === 'formula'
            ? <LiveValue system={system} compendium={compendium} tag={field.tag} source={field.value.expr} />
            : null}
        </>
      )}
      <Fold title="ещё">
        <div className="row">
          <Field label="Подпись">
            <Input value={column.sheet.label} onChange={next => setSheet(s => { s.label = next; })} />
          </Field>
          <Field label="Имя в формулах">
            <Input mono value={column.sheet.tag} onChange={next => { if (next.trim()) setSheet(s => { s.tag = next.trim(); }); }} />
          </Field>
          {stored && column.kind === 'number' ? (
            <>
              <Field label="Не ниже">
                <Input mono value={column.min === undefined ? '' : String(column.min)}
                  onChange={text => setColumn(c => {
                    if (!text.trim()) delete c.min; else c.min = /^-?\d+$/.test(text) ? Number(text) : text;
                  })} />
              </Field>
              <Field label="Не выше">
                <Input mono value={column.max === undefined ? '' : String(column.max)}
                  onChange={text => setColumn(c => {
                    if (!text.trim()) delete c.max; else c.max = /^-?\d+$/.test(text) ? Number(text) : text;
                  })} />
              </Field>
            </>
          ) : null}
        </div>
      </Fold>
    </Card>
  );
}
