import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Card, CardHead, Chip } from '../ui/primitives.tsx';
import { FieldCell } from './field-cell.tsx';
import type { Reader } from '../engine/use-calc.ts';
import { Tabs } from '../ui/layout.tsx';
import type { Sheet, System, StoredValue, SheetList } from '@vtt/schema';
import type { Field as FieldModel } from '@vtt/engine/model/types';
import { fieldsOf, rowKeyOf, fieldOf } from '@vtt/engine/model/sheet-columns';
import { optionsOf } from '@vtt/engine/model/lists';
import { fieldsByBlock } from '@vtt/engine/model/blocks';
import { blockShown } from '@vtt/engine/model/owned';
import { pagesOf, topPage, tabPages, pageOfBlock, rootBlock, bandsOf } from '@vtt/engine/model/pages';

export function SheetView({ system, sheet, reader, onChange, onRoll, badge, only, fields, onPick, picked, onPickBlock, onPickRow, pages, lists }: {
  pages?: { at: string | null; onAt: (name: string) => void; all?: boolean };
  lists?: Partial<Record<SheetList, ReactNode>>;
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
  const visibleBlock = blockShown(system, sheet);
  const byFields = fieldsByBlock(system, only ? all.filter(f => only.includes(f.tag)) : all, visibleBlock);
  const order = (system.blocks ?? []).map(block => block.name);
  const listed = (system.blocks ?? [])
    .filter(block => block.list && lists?.[block.list] != null && visibleBlock(block.name) && !byFields.some(([group]) => group === block.name))
    .map(block => [block.name, []] as [string, FieldModel[]]);
  const rank = (name: string) => (order.indexOf(name) < 0 ? order.length : order.indexOf(name));
  const shown = listed.length ? [...byFields, ...listed].sort(([a], [b]) => rank(a) - rank(b)) : byFields;

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

  const card = (group: string, fields: FieldModel[]) => {
    const own = (system.blocks ?? []).find(block => block.name === group);
    return (
    <Card key={group}>
      <CardHead title={onPickBlock ? <button type="button" className="sheet-pick__head" title="настройки блока" onClick={() => onPickBlock(group)}>{group}</button> : group} />
      {piecesOf(fields).map(piece => (piece.table ? (
        <TableBlock key={piece.table} system={system} tableId={piece.table!} split={own?.split} sections={sectionsOf(piece.fields, system, reader)} cell={cell} {...(onPickRow ? { onPickRow } : {})} />
      ) : (
        <div key={piece.fields[0]!.tag} className={own?.per ? 'row row--per' : 'row'} {...(own?.per ? { style: { gridTemplateColumns: `repeat(${own.per}, minmax(0, 1fr))` } } : {})}>
          {piece.fields.map(field => cell(field))}
        </div>
      )))}
      {own?.list && lists?.[own.list] != null ? lists[own.list] : null}
    </Card>
    );
  };

  const head = (
    <div className="sheet__top">
      <h2 className="sheet__name">{sheet.name ?? sheet.id}</h2>
      {badge ? <Chip>{badge}</Chip> : null}
    </div>
  );

  if (!pages || !pagesOf(system).length) {
    return (
      <div className="sheet">
        {head}
        {shown.map(([group, fields]) => card(group, fields))}
      </div>
    );
  }

  const top = topPage(system);
  const blocksOn = (name: string) => shown.filter(([group]) => pageOfBlock(system, group) === name);
  const filled = (name: string) => blocksOn(name).length > 0;
  const visible = tabPages(system).filter(page => pages.all || filled(page.name));
  const current = visible.find(page => page.name === pages.at) ?? visible[0];

  const stackOf = (page: NonNullable<typeof top>, group: string) => Math.min(rootBlock(system, group)?.stack ?? 1, page.stacks ?? 1);
  const usedStacks = (page: NonNullable<typeof top>) => {
    const used = new Set(blocksOn(page.name).filter(([group]) => !(rootBlock(system, group)?.wide && (page.stacks ?? 1) > 1)).map(([group]) => stackOf(page, group)));
    return used.size ? [...used].sort((a, b) => a - b) : [1];
  };

  const body = (page: NonNullable<typeof top>) => (
    <>
      {bandsOf(blocksOn(page.name), usedStacks(page).length, ([group]) => {
        const root = rootBlock(system, group);
        return { stack: usedStacks(page).indexOf(stackOf(page, group)) + 1, wide: root?.wide };
      }).map((band, at) => ('wide' in band ? (
        <div key={at} className="sheet-band">{card(band.wide[0], band.wide[1])}</div>
      ) : (
        <div key={at} className={`sheet-stacks sheet-stacks--${band.stacks.length}`}>
          {band.stacks.map((stack, column) => (
            <div key={column} className="sheet-stacks__col">{stack.map(([group, fields]) => card(group, fields))}</div>
          ))}
        </div>
      )))}
    </>
  );

  return (
    <div className="sheet sheet--paged">
      {head}
      {top ? body(top) : null}
      {visible.length ? (
        <Tabs value={current?.name ?? ''} options={visible.map(page => ({ key: page.name, label: page.name }))} onChange={pages.onAt} />
      ) : null}
      {current ? <div className="sheet-page">{filled(current.name) ? body(current) : <span className="faint">На этой странице пока пусто — выберите блок и укажите ему эту страницу.</span>}</div> : null}
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

type Section = { title: string | null; fields: FieldModel[] };

function splitRows(sections: Section[], count: number): { title: string | null; rows: string[] }[][] {
  const rowsOf = sections.map(part => ({ title: part.title, rows: [...new Set(part.fields.map(f => f.cell!.row))] }));
  const total = rowsOf.reduce((sum, part) => sum + part.rows.length, 0);
  const per = Math.max(1, Math.ceil(total / count));
  const out: { title: string | null; rows: string[] }[][] = [[]];
  let size = 0;
  for (const part of rowsOf) {
    let open: { title: string | null; rows: string[] } | null = null;
    for (const row of part.rows) {
      if (size >= per && out.length < count) { out.push([]); size = 0; open = null; }
      if (!open) { open = { title: part.title, rows: [] }; out[out.length - 1]!.push(open); }
      open.rows.push(row);
      size += 1;
    }
  }
  return out;
}

function TableBlock({ system, tableId, sections, cell, onPickRow, split }: {
  onPickRow?: (table: string, row: string) => void;
  system: System;
  tableId: string;
  split?: number | undefined;
  sections: Section[];
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
  const grid = (parts: { title: string | null; rows: string[] }[], key?: number) => (
    <div key={key} className="sheet-table" style={{ gridTemplateColumns: `minmax(110px, max-content) repeat(${columns.length}, minmax(80px, max-content))` }}>
      <span />
      {columns.map(column => <span key={column} className="field__label">{columnLabel(column)}</span>)}
      {parts.map(part => (
        <Fragment key={part.title ?? ''}>
          {part.title ? <h4 className="sheet-section__title sheet-table__section">{part.title}</h4> : null}
          {part.rows.map(row => (
            <Fragment key={row}>
              {onPickRow
                ? <button type="button" className="sheet-table__row sheet-pick__head" title="эта строка таблицы" onClick={() => onPickRow(tableId, row)}>{rowLabel(row)}</button>
                : <span className="sheet-table__row">{rowLabel(row)}</span>}
              {columns.map(column => {
                const field = at.get(`${row}.${column}`);
                return field ? <Fragment key={column}>{cell(field, true)}</Fragment> : <span key={column} />;
              })}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </div>
  );
  if (!split || split < 2) {
    return grid(sections.map(part => ({ title: part.title, rows: [...new Set(part.fields.map(f => f.cell!.row))] })));
  }
  return (
    <div className="sheet-split">
      {splitRows(sections, split).map((parts, index) => <div key={index} className="sheet-split__col">{grid(parts)}</div>)}
    </div>
  );
}
