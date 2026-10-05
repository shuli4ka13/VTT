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
import { blockShown } from '@vtt/engine/model/owned';

export function SheetView({ system, sheet, reader, onChange, onRoll, badge, only, fields, onPick, picked, onPickBlock, onPickRow }: {
  onPickBlock?: (name: string) => void;
  onPickRow?: (table: string, row: string) => void;
  system: System;
  fields?: FieldModel[];
  sheet: Sheet;
  reader: Reader;
  onChange?: (tag: string, value: StoredValue) => void;
  onRoll?: (tag: string) => void;
  badge?: string;
  only?: string[];
  onPick?: (tag: string, block?: string) => void;
  picked?: string | null;
}) {
  const all = fields ?? fieldsOf(system);
  const shown = fieldsByBlock(system, only ? all.filter(f => only.includes(f.tag)) : all, blockShown(system, sheet));

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
      <div key={field.tag} className={`sheet-pick${picked === field.tag ? ' sheet-pick--on' : ''}`} onClick={() => onPick(field.tag, field.group)}>
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
          <CardHead title={onPickBlock ? <button type="button" className="sheet-pick__head" title="настройки блока" onClick={() => onPickBlock(group)}>{group}</button> : group} />
          {piecesOf(fields).map(piece => (piece.table ? (
            <TableBlock key={piece.table} system={system} tableId={piece.table!} sections={sectionsOf(piece.fields, system, reader)} cell={cell} {...(onPickRow ? { onPickRow } : {})} />
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
  const part = (system.blocks ?? []).find(block => block.name === field.group)?.parts.find(p => p.table === field.home && p.by);
  const view = part?.by ? part.views?.[part.by] : undefined;
  if (typeof value === 'boolean') return [value ? view?.yes ?? 'да' : view?.no ?? 'нет', value ? 1 : 0];
  return [value === undefined || value === null || value === '' ? '—' : String(value), Number.MAX_SAFE_INTEGER];
}

function TableBlock({ system, tableId, sections, cell, onPickRow }: {
  onPickRow?: (table: string, row: string) => void;
  system: System;
  tableId: string;
  sections: { title: string | null; fields: FieldModel[] }[];
  cell: (field: FieldModel, bare?: boolean) => ReactNode;
}) {
  const table = system.tables?.[tableId];
  const fields = sections.flatMap(part => part.fields);
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
      {sections.map(part => (
        <Fragment key={part.title ?? ''}>
          {part.title ? <h4 className="sheet-section__title sheet-table__section">{part.title}</h4> : null}
          {[...new Set(part.fields.map(f => f.cell!.row))].map(row => (
            <Fragment key={row}>
              {onPickRow
                ? <button type="button" className="sheet-table__row sheet-pick__head" title="эта строка таблицы" onClick={() => onPickRow(tableId, row)}>{rowLabel(row)}</button>
                : <span className="sheet-table__row">{rowLabel(row)}</span>}
              {columns.map(key => {
                const field = at.get(`${row}.${key}`);
                return field ? <Fragment key={key}>{cell(field, true)}</Fragment> : <span key={key} />;
              })}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
