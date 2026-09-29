import { kindsFor, kindWord } from '@vtt/engine/words/kinds';
import { ROW } from '@vtt/engine/model/sheet-columns';
import { Card, CardHead, Field, Input, NumInput, Button, DangerButton, Fold, Select, Verdict, Empty, LabelInput } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { SheetGrid } from '../../../ui/sheet-grid.tsx';
import { FieldRow } from '../../../ui/field-row.tsx';
import type { GridColumn } from '../../../ui/sheet-grid.tsx';
import { ValueEditor } from '../../../ui/value-editor.tsx';
import { newTable } from '../factory.ts';
import { inUse, usersOf } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import { freeId, useBook } from '../../../store/world.ts';
import { listUsers } from '@vtt/engine/model/lists';
import { isRange, keyOf } from '@vtt/engine/model/tables';
import { rowUsers, renameRow, renameRowInBook } from '@vtt/engine/model/integrity';
import { useWorld } from '../../../store/world.ts';
import { useState, useRef, useEffect } from 'react';
import type { System, Table, TableColumn, TableRow, TableKey } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

const ROW_KEYS = [
  ['word', 'слово'],
  ['number', 'число'],
  ['range', 'диапазон'],
] as const;

const blankRow = (key: TableKey): TableRow =>
  (key === 'range' ? { from: 1, to: 1, cells: {} }
    : key === 'number' ? { value: 0, cells: {} }
      : { value: '', cells: {} });

const COLUMN_KINDS = kindsFor('table');

const ON_SHEET = ['number', 'text', 'boolean', 'choice', 'expr'];

const parseFree = (text: string): number | string | boolean =>
  /^-?\d+(\.\d+)?$/.test(text) ? Number(text)
    : text === 'true' ? true
      : text === 'false' ? false
        : text;

const rangesBroken = (rows: TableRow[]): boolean => {
  if (rows.length < 2) return false;
  const sorted = [...rows].sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
  return sorted.some((r, i) => i > 0 && (sorted[i - 1]!.to ?? 0) + 1 !== (r.from ?? 0));
};

const addTable = (editSystem: EditSystem) => editSystem(draft => {
  const made = newTable(draft);
  (draft.tables ??= {})[made.key] = made.value;
});

export function TablesSection({ system, editSystem, usage }: Props) {
  const entries = Object.entries(system.tables ?? {});

  return (
    <Card>
      <CardHead
        title="Таблицы"
        actions={entries.length ? <Button size="sm" onClick={() => addTable(editSystem)}>+ таблица</Button> : null}
      />
      <div className="stack stack--tight">
        {entries.length === 0 ? (
          <Empty
            title="Таблиц ещё нет"
            hint="Типы урона, бонус мастерства по уровню, способ атаки — всё это таблицы."
            action={<Button size="sm" onClick={() => addTable(editSystem)}>+ таблица</Button>}
          />
        ) : entries.map(([key, table]) => (
          <TableCard key={key} id={key} table={table} system={system} editSystem={editSystem} usage={usage} />
        ))}
      </div>
    </Card>
  );
}

function TableCard({ id, table, system, editSystem, usage }: Props & { id: string; table: Table }) {
  const byRange = isRange(table);
  const rows = table.rows ?? [];
  const columns = table.columns ?? [];
  const users = [...new Set([...listUsers(system, id), ...usersOf(usage, 'table', id, system)])];
  const wanted = useWorld(s => s.activeTableId) === id;
  const [openAtStart] = useState(wanted);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wanted) return;
    ref.current?.scrollIntoView({ block: 'start' });
    useWorld.getState().pick({ activeTableId: null });
  }, [wanted]);
  const held = users.length > 0 || inUse(usage, 'table', id);
  const [picked, setPicked] = useState<string | null>(null);
  const broken = byRange && rangesBroken(rows);

  const edit = (change: (draft: Table) => void) => editSystem(draft => {
    const target = draft.tables?.[id];
    if (target) change(target);
  });

  const summary = users.length
    ? (users.length > 3
      ? `берут отсюда: ${users.slice(0, 3).join(', ')} и ещё ${users.length - 3}`
      : `берут отсюда: ${users.join(', ')}`)
    : 'пока никто не берёт';

  return (
    <div ref={ref}>
    <Fold
      title={table.label || id} count={rows.length} summary={summary} open={openAtStart || undefined}
      rename={{ value: table.label ?? '', placeholder: 'как зовётся таблица', onCommit: next => edit(draft => { draft.label = next; }) }}
    >
      <FieldRow
        id="table-head"
        fields={[
          {
            key: 'key', label: 'Ключ строки', width: 150,
            node: (
              <Select
                value={keyOf(table)}
                options={ROW_KEYS}
                onChange={next => edit(draft => {
                  const was = keyOf(draft);
                  draft.key = next;
                  if ((was === 'range') !== (next === 'range')) draft.rows = [blankRow(next)];
                  if (next === 'number') {
                    for (const row of draft.rows ?? []) row.value = Number(row.value) || 0;
                  }
                })}
              />
            ),
          },
          ...(columns.length ? [{
            key: 'otherwise', label: 'Если ничего не совпало', width: 180,
            node: (
              <Input
                value={table.otherwise === undefined ? '' : String(table.otherwise)}
                placeholder="оставить пустым"
                mono
                onChange={next => edit(draft => {
                  if (next === '') delete draft.otherwise; else draft.otherwise = parseFree(next);
                })}
              />
            ),
          }] : []),
        ]}
        tail={held ? (
          <Button size="sm" variant="danger" disabled title="таблица используется">Удалить</Button>
        ) : (
          <DangerButton size="sm" onConfirm={() => editSystem(draft => { delete draft.tables?.[id]; })}>
            Удалить
          </DangerButton>
        )}
      />

      {broken ? <Verdict tone="warn">диапазоны перекрываются или дырявы</Verdict> : null}

      {picked && columns.some(c => c.key === picked) ? (
        <ColumnCard id={id} table={table} column={columns.find(c => c.key === picked)!} system={system} edit={edit} onClose={() => setPicked(null)} />
      ) : null}

      <Rows id={id} table={table} system={system} edit={edit} editSystem={editSystem} picked={picked} onPick={setPicked} />
    </Fold>
    </div>
  );
}

export function rowNames(system: System, tableId: string): Map<string, string> {
  const table = system.tables?.[tableId];
  const out = new Map<string, string>([[ROW, 'эта строка']]);
  for (const column of table?.columns ?? []) {
    const name = column.label || column.key;
    out.set(`${ROW}.${column.key}`, name);
    if (column.kind !== 'choice' || !column.from) continue;
    for (const other of system.tables?.[column.from]?.columns ?? []) {
      out.set(`${ROW}.${column.key}.${other.key}`, `${name} · ${other.label || other.key}`);
    }
  }
  return out;
}

const kindLabel = (column: TableColumn): string =>
  (column.kind === 'expr' ? (column.expr !== undefined ? 'одна формула' : 'формула у строки')
    : column.sheet ? `${kindWord(column.kind)} · у персонажа` : kindWord(column.kind));

function ColumnCard({ id, table, column, system, edit, onClose }: {
  id: string;
  table: Table;
  column: TableColumn;
  system: System;
  edit: (change: (draft: Table) => void) => void;
  onClose: () => void;
}) {
  const others = Object.entries(system.tables ?? {}).filter(([key]) => key !== id);
  const set = (change: (c: TableColumn) => void) => edit(draft => {
    const c = draft.columns?.find(x => x.key === column.key);
    if (c) change(c);
  });
  const shared = column.expr !== undefined;
  const name = column.label || column.key;

  return (
    <Card>
      <CardHead
        title={<LabelInput value={column.label ?? ''} placeholder="как зовётся колонка" onCommit={next => set(c => { c.label = next; })} />}
        actions={<>
          <DangerButton size="sm" onConfirm={() => {
            edit(draft => {
              draft.columns = (draft.columns ?? []).filter(c => c.key !== column.key);
              for (const row of draft.rows ?? []) delete row.cells?.[column.key];
            });
            onClose();
          }}>Удалить</DangerButton>
          <Button size="sm" variant="ghost" title="свернуть" onClick={onClose}>×</Button>
        </>}
      />
      <div className="row">
        <Field label="Тип">
          <Select
            value={column.kind ?? 'text'}
            options={COLUMN_KINDS as never}
            onChange={next => set(c => {
              c.kind = next as NonNullable<TableColumn['kind']>;
              if (next !== 'choice') { delete c.from; delete c.many; }
              if (next !== 'expr') delete c.expr;
              if (!ON_SHEET.includes(next)) delete c.sheet;
            })}
          />
        </Field>
        {column.kind === 'choice' ? (
          <>
            <Field label="Из таблицы">
              <Select
                value={column.from ?? ''}
                options={[['', '— какая —'], ...others.map(([key, t]) => [key, t.label || key] as const)] as never}
                onChange={next => set(c => { if (next) c.from = next; else delete c.from; })}
              />
            </Field>
            <Field label="Сколько значений">
              <Select
                value={column.many ? 'many' : 'one'}
                options={[['one', 'одно'], ['many', 'несколько']] as const}
                onChange={next => set(c => { if (next === 'many') c.many = true; else delete c.many; })}
              />
            </Field>
          </>
        ) : null}
        {column.kind === 'expr' ? (
          <Field label="Формула">
            <Select
              value={shared ? 'one' : 'each'}
              options={[['one', 'одна на все строки'], ['each', 'своя у каждой строки']] as const}
              onChange={next => set(c => { if (next === 'one') c.expr = c.expr ?? ''; else delete c.expr; })}
            />
          </Field>
        ) : null}
        {column.sheet && column.kind !== 'expr' ? (
          <Field label="Сначала">
            <Input value={column.start === undefined ? '' : String(column.start)}
              onChange={text => set(c => {
                if (!text.trim()) delete c.start;
                else c.start = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
              })} />
          </Field>
        ) : null}
      </div>
      {column.kind === 'expr' && shared ? (
        <FormulaField
          value={column.expr ?? ''}
          system={system}
          where={`${table.label || id} · ${name}`}
          extraNames={rowNames(system, id)}
          placeholder="формула для всех строк"
          onChange={next => set(c => { c.expr = next; })}
        />
      ) : null}
    </Card>
  );
}

const defaultWidth = (column?: TableColumn): number =>
  (!column ? 200 : column.kind === 'expr' ? 240 : column.kind === 'choice' && column.many ? 220 : 150);

function Rows({ id, table, system, edit, editSystem, picked, onPick }: {
  picked: string | null;
  onPick: (key: string | null) => void;
  id: string;
  table: Table;
  system: System;
  edit: (change: (draft: Table) => void) => void;
  editSystem: EditSystem;
}) {
  const compendium = useBook();
  const editCompendium = useWorld(s => s.editCompendium);
  const rename = (from: unknown, to: unknown) => {
    editSystem(draft => renameRow(draft, id, from, to));
    editCompendium(draft => renameRowInBook(system, draft, id, from, to));
  };
  const taken = (next: unknown, self: number) =>
    (table.rows ?? []).some((row, at) => at !== self && String(row.value) === String(next));
  const key = keyOf(table);
  const byRange = key === 'range';
  const rows = table.rows ?? [];
  const columns = table.columns ?? [];

  const setCell = (i: number, column: string, value: unknown) => edit(draft => {
    const row = draft.rows?.[i];
    if (!row) return;
    if (value === undefined) delete row.cells?.[column];
    else (row.cells ??= {})[column] = value;
  });

  const perSheet = columns.some(c => c.sheet);
  const lead = byRange ? ['от', 'до'] : [key === 'number' ? 'число' : 'слово', 'как показать', ...(perSheet ? ['имя в формулах'] : [])];
  const gridColumns: GridColumn[] = [
    ...lead.map(name => ({ key: `:${name}`, label: name, width: byRange ? 90 : defaultWidth() })),
    ...columns.map(c => ({
      key: c.key, label: c.label || c.key, sub: kindLabel(c), width: defaultWidth(c),
      active: picked === c.key, onClick: () => onPick(picked === c.key ? null : c.key),
    })),
  ];
  const addColumn = () => {
    const key = freeId(columns.map(c => c.key), 'колонка');
    edit(draft => { (draft.columns ??= []).push({ key, label: '', kind: 'number' }); });
    onPick(key);
  };
  const names = rowNames(system, id);

  return (
    <div className="stack stack--tight">
      <span className="field__label">Строки</span>

      <SheetGrid id={`table.${id}`} columns={gridColumns} tailHead={<Button size="sm" variant="ghost" title="добавить колонку" onClick={addColumn}>+</Button>}>
          {rows.map((row, i) => (
            <RowCells
              key={i} row={row} at={i} rowKey={key} columns={columns} system={system} perSheet={perSheet}
              users={key === 'range' ? [] : rowUsers(system, id, row.value, compendium).map(u => u.text)}
              onRename={to => rename(row.value, to)} taken={next => taken(next, i)}
              edit={edit} setCell={setCell} names={names}
              where={column => `${table.label || id} · «${String(row.value ?? `${row.from}–${row.to}`)}» · ${column.label || column.key}`}
            />
          ))}
      </SheetGrid>

      <Button size="sm" onClick={() => edit(draft => {
        const list = (draft.rows ??= []);
        if (byRange) {
          const from = list.length ? (list[list.length - 1]!.to ?? 0) + 1 : 1;
          list.push({ from, to: from, cells: {} });
        } else {
          list.push(blankRow(key));
        }
      })}>{byRange ? '+ ступень' : '+ строка'}</Button>

    </div>
  );
}

function RowCells({ row, at, rowKey, columns, system, edit, setCell, users, onRename, taken, where, perSheet, names }: {
  perSheet: boolean;
  names: Map<string, string>;
  row: TableRow;
  at: number;
  rowKey: TableKey;
  users: string[];
  onRename: (to: unknown) => void;
  taken: (next: unknown) => boolean;
  columns: TableColumn[];
  system: System;
  edit: (change: (draft: Table) => void) => void;
  setCell: (i: number, column: string, value: unknown) => void;
  where: (column: TableColumn) => string;
}) {
  const cells = row.cells ?? {};
  const set = (change: (r: TableRow) => void) => edit(draft => { const r = draft.rows?.[at]; if (r) change(r); });
  return (
    <>
      {rowKey === 'range' ? (
        <>
          <NumInput value={row.from ?? 0} onCommit={n => set(r => { r.from = n; })} />
          <NumInput value={row.to ?? 0} onCommit={n => set(r => { r.to = n; })} />
        </>
      ) : (
        <>
          <KeyInput value={row.value} numeric={rowKey === 'number'} taken={taken} onRename={onRename} />
          <Input
            value={row.label ?? ''}
            placeholder="как в списке"
            onChange={next => set(r => { if (next.trim()) r.label = next; else delete r.label; })}
          />
          {perSheet ? (
            <Input mono value={row.key ?? ''} placeholder={String(row.value ?? '')}
              onChange={next => set(r => { if (next.trim()) r.key = next.trim(); else delete r.key; })} />
          ) : null}
        </>
      )}
      {columns.map(column => (column.sheet && column.kind !== 'expr' ? (
        <span key={column.key} />
      ) : column.kind === 'expr' && column.expr !== undefined ? (
        <span key={column.key} />
      ) : column.kind === 'expr' ? (
        <FormulaField
          key={column.key}
          value={String(cells[column.key] ?? '')}
          system={system}
          where={where(column)}
          extraNames={names}
          placeholder="формула"
          onChange={value => setCell(at, column.key, value.trim() ? value : undefined)}
        />
      ) : (
        <ValueEditor key={column.key} type={column} value={cells[column.key]} system={system}
          onChange={value => setCell(at, column.key, value)} />
      )))}
      {users.length ? (
        <Button size="sm" variant="ghost" disabled title={`строку используют: ${users.slice(0, 4).join('; ')}${users.length > 4 ? ` и ещё ${users.length - 4}` : ''}`}>×</Button>
      ) : (
        <Button size="sm" variant="ghost" title="убрать строку" onClick={() => edit(draft => { draft.rows?.splice(at, 1); })}>×</Button>
      )}
    </>
  );
}

function KeyInput({ value, numeric, taken, onRename }: {
  value: unknown;
  numeric: boolean;
  taken: (next: unknown) => boolean;
  onRename: (next: unknown) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(value));

  const commit = () => {
    if (draft === null) return;
    const next = numeric ? Number(draft) : draft.trim();
    setDraft(null);
    if (numeric && (draft.trim() === '' || !Number.isFinite(next as number))) { setTrouble('нужно число'); return; }
    if (String(next) === String(value ?? '')) { setTrouble(null); return; }
    if (taken(next)) { setTrouble(`«${String(next)}» уже есть`); return; }
    setTrouble(null);
    onRename(next);
  };

  return (
    <div className="stack stack--tight">
      <Input
        value={shown}
        mono
        invalid={Boolean(trouble)}
        placeholder={numeric ? '0' : 'слово'}
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      {trouble ? <span className="field__error">{trouble}</span> : null}
    </div>
  );
}

