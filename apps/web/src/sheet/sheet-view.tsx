import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Card, CardHead, Chip } from '../ui/primitives.tsx';
import { FieldCell } from './field-cell.tsx';
import type { Reader } from '../engine/use-calc.ts';
import type { Sheet, System, StoredValue } from '@vtt/schema';
import type { Field as FieldModel } from '@vtt/engine/model/types';
import { fieldsOf, rowKeyOf } from '@vtt/engine/model/sheet-columns';
import { fieldsByBlock } from '@vtt/engine/model/blocks';

export function SheetView({ system, sheet, reader, onChange, onRoll, badge, only, fields, onPick, picked }: {
  system: System;
  fields?: FieldModel[];
  sheet: Sheet;
  reader: Reader;
  onChange?: (tag: string, value: StoredValue) => void;
  onRoll?: (tag: string) => void;
  badge?: string;
  only?: string[];
  onPick?: (tag: string) => void;
  picked?: string | null;
}) {
  const all = fields ?? fieldsOf(system);
  const shown = fieldsByBlock(system, only ? all.filter(f => only.includes(f.tag)) : all);

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
    const row = (table?.rows ?? []).find(r => rowKeyOf(r) === key);
    return row?.label ?? String(row?.value ?? key);
  };
  const columnLabel = (key: string) => {
    const column = (table?.columns ?? []).find(c => c.key === key);
    return column?.label || key;
  };
  const at = new Map(fields.map(f => [`${f.cell!.row}.${f.cell!.column}`, f]));
  return (
    <div className="sheet-table" style={{ gridTemplateColumns: `minmax(110px, max-content) repeat(${columns.length}, minmax(80px, max-content))` }}>
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
