import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Card, CardHead, Chip } from '../ui/primitives.tsx';
import { FieldCell } from './field-cell.tsx';
import type { Reader } from '../engine/use-calc.ts';
import type { Sheet, System, StoredValue } from '@vtt/schema';
import type { Field as FieldModel } from '@vtt/engine/model/types';
import { fieldsOf, rowKeyOf, fieldOf } from '@vtt/engine/model/sheet-columns';
import { optionsOf } from '@vtt/engine/model/lists';
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
    <div className="sheet">
      <div className="sheet__top">
        <h2 className="sheet__name">{sheet.name ?? sheet.id}</h2>
        {badge ? <Chip>{badge}</Chip> : null}
      </div>

      {shown.map(([group, fields]) => (
        <Card key={group}>
          <CardHead title={group} />
          {piecesOf(fields).map(piece => (piece.table ? (
            <Fragment key={piece.table}>
              {sectionsOf(piece.fields, system, reader).map(part => (
                <div key={part.title ?? ''} className={part.title ? 'sheet-section' : undefined}>
                  {part.title ? <h4 className="sheet-section__title">{part.title}</h4> : null}
                  <TableBlock system={system} tableId={piece.table!} fields={part.fields} cell={cell} />
                </div>
              ))}
            </Fragment>
          ) : (
            <div key={piece.fields[0]!.tag} className="row">
              {piece.fields.map(field => cell(field))}
            </div>
          )))}
        </Card>
      ))}
    </div>
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

function sectionsOf(fields: FieldModel[], system: System, reader: Reader): { title: string | null; fields: FieldModel[] }[] {
  const out: { title: string | null; at: number; fields: FieldModel[] }[] = [];
  for (const field of fields) {
    const [title, at] = sectionTitle(field, system, reader);
    const part = out.find(item => item.title === title);
    if (part) part.fields.push(field);
    else out.push({ title, at, fields: [field] });
  }
  return out.map((part, order) => ({ ...part, order })).sort((a, b) => a.at - b.at || a.order - b.order);
}

function sectionTitle(field: FieldModel, system: System, reader: Reader): [string | null, number] {
  if (field.section !== undefined) return [field.section, field.sectionAt ?? Number.MAX_SAFE_INTEGER];
  if (!field.sectionBy) return [null, Number.MAX_SAFE_INTEGER];
  const stored = reader.storedOf?.(field.sectionBy);
  const computed = stored === undefined ? reader.valueOf(field.sectionBy) : null;
  const value = stored !== undefined ? stored : computed?.ok ? computed.value : undefined;
  const by = fieldOf(system, field.sectionBy);
  const options = by ? optionsOf(system, by) : [];
  const at = options.findIndex(option => String(option.value) === String(value));
  if (at >= 0) return [options[at]!.label, at];
  return [value === undefined || value === null || value === '' ? '—' : String(value), Number.MAX_SAFE_INTEGER];
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
