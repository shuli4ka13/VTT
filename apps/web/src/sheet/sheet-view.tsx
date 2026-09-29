import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Card, CardHead, Chip } from '../ui/primitives.tsx';
import { FieldCell } from './field-cell.tsx';
import type { Reader } from '../engine/use-calc.ts';
import type { Sheet, System, Field as FieldModel, StoredValue } from '@vtt/schema';

export const groupsOf = (system: System): [string, FieldModel[]][] => {
  const groups = new Map<string, FieldModel[]>();
  for (const field of system.fields) {
    const key = field.group ?? 'Без блока';
    const list = groups.get(key);
    if (list) list.push(field as FieldModel);
    else groups.set(key, [field as FieldModel]);
  }
  return [...groups];
};

export function SheetView({ system, sheet, reader, onChange, onRoll, badge, only, onPick, picked }: {
  system: System;
  sheet: Sheet;
  reader: Reader;
  onChange?: (tag: string, value: StoredValue) => void;
  onRoll?: (tag: string) => void;
  badge?: string;
  only?: string[];
  onPick?: (tag: string) => void;
  picked?: string | null;
}) {
  const shown = only
    ? groupsOf(system).map(([group, fields]) =>
      [group, fields.filter(f => only.includes(f.tag))] as [string, FieldModel[]]).filter(([, fields]) => fields.length)
    : groupsOf(system);

  const cell = (field: FieldModel, bare = false) => {
    const view = (
      <FieldCell
        key={field.tag}
        field={field}
        system={system}
        sheet={sheet}
        reader={reader}
        onChange={onChange}
        onRoll={onRoll}
        bare={bare}
      />
    );
    return onPick ? (
      <div key={field.tag} className={`sheet-pick${picked === field.tag ? ' sheet-pick--on' : ''}`} onClick={() => onPick(field.tag)}>
        {view}
      </div>
    ) : view;
  };

  return (
    <>
      <Card>
        <CardHead title={sheet.name ?? sheet.id} badge={badge ? <Chip>{badge}</Chip> : undefined} />
      </Card>

      {shown.map(([group, fields]) => (
        <Card key={group}>
          <CardHead title={group} />
          {piecesOf(fields).map(piece => (piece.table ? (
            <TableBlock key={piece.table} system={system} tableId={piece.table} fields={piece.fields} cell={cell} />
          ) : (
            <div key={piece.fields[0]!.tag} className="row">
              {piece.fields.map(field => cell(field))}
            </div>
          )))}
        </Card>
      ))}
    </>
  );
}

interface Piece { table: string | null; fields: FieldModel[] }

function piecesOf(fields: FieldModel[]): Piece[] {
  const out: Piece[] = [];
  for (const field of fields) {
    const table = field.cell?.table ?? null;
    const last = out[out.length - 1];
    const same = table ? out.find(piece => piece.table === table) : last && !last.table ? last : undefined;
    if (same) same.fields.push(field);
    else out.push({ table, fields: [field] });
  }
  return out;
}

function TableBlock({ system, tableId, fields, cell }: {
  system: System;
  tableId: string;
  fields: FieldModel[];
  cell: (field: FieldModel, bare?: boolean) => ReactNode;
}) {
  const table = system.tables?.[tableId];
  const rows = [...new Set(fields.map(f => f.cell!.row))];
  const columns = [...new Set(fields.map(f => f.cell!.column))];
  const rowLabel = (key: string) => {
    const row = (table?.rows ?? []).find(r => String(r.key ?? r.value) === key);
    return row?.label ?? String(row?.value ?? key);
  };
  const columnLabel = (key: string) => {
    const column = (table?.columns ?? []).find(c => c.key === key);
    return column?.label || key;
  };
  const at = new Map(fields.map(f => [`${f.cell!.row}.${f.cell!.column}`, f]));
  return (
    <div className="sheet-table" style={{ gridTemplateColumns: `minmax(110px, max-content) repeat(${columns.length}, minmax(80px, 160px))` }}>
      <span />
      {columns.map(key => <span key={key} className="field__label">{columnLabel(key)}</span>)}
      {rows.map(row => (
        <Fragment key={row}>
          <span className="sheet-table__row">{rowLabel(row)}</span>
          {columns.map(key => {
            const field = at.get(`${row}.${key}`);
            return field ? <Fragment key={key}>{cell(field, true)}</Fragment> : <span key={key} />;
          })}
        </Fragment>
      ))}
    </div>
  );
}
