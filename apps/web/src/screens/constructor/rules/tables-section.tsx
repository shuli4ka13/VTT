import { MultiChoice } from '../../../ui/multi-choice.tsx';
import { kindsFor } from '@vtt/engine/words/kinds';
import { Card, CardHead, Field, Input, NumInput, Button, DangerButton, Fold, Select, Verdict, Chip, Empty } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { SheetGrid } from '../../../ui/sheet-grid.tsx';
import type { GridColumn } from '../../../ui/sheet-grid.tsx';
import { DiceProp } from '../../../ui/dice-prop.tsx';
import { newTable } from '../factory.ts';
import { inUse, usersOf } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import { freeId } from '../../../store/world.ts';
import { listUsers, listOf } from '@vtt/engine/model/lists';
import { isRange, keyOf } from '@vtt/engine/model/tables';
import { rowUsers, renameRow, renameRowInBook } from '@vtt/engine/model/integrity';
import { useWorld } from '../../../store/world.ts';
import { useState, useRef, useEffect } from 'react';
import type { System, Table, TableColumn, TableRow, TableKey } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

const ROW_KEYS = [
  ['word', 'слово — «ближний бой», «огонь»'],
  ['number', 'число — 0, 1, 2'],
  ['range', 'диапазон чисел — уровень 1–4'],
] as const;

const blankRow = (key: TableKey): TableRow =>
  (key === 'range' ? { from: 1, to: 1, cells: {} }
    : key === 'number' ? { value: 0, cells: {} }
      : { value: '', cells: {} });

const COLUMN_KINDS = kindsFor('table');

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
        sub="Строки и колонки. Строка — значение или диапазон чисел; в колонке — число, слово или формула. Таблица без колонок — просто список для выбора."
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
    <Fold title={table.label || id} count={rows.length} summary={summary} open={openAtStart || undefined}>
      <div className="inline">
        <Input
          value={table.label ?? ''}
          placeholder="как зовётся таблица"
          onChange={next => edit(draft => { draft.label = next; })}
        />
        {held ? (
          <Button size="sm" variant="danger" disabled title="таблица используется">Удалить</Button>
        ) : (
          <DangerButton size="sm" onConfirm={() => editSystem(draft => { delete draft.tables?.[id]; })}>
            Удалить
          </DangerButton>
        )}
      </div>

      <Field label="Ключ строки" hint="По чему таблица находит строку: меч говорит «ближний бой», уровень — «7».">
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
      </Field>

      {broken ? <Verdict tone="warn">диапазоны перекрываются или дырявы</Verdict> : null}

      <Columns id={id} table={table} system={system} edit={edit} />

      <Rows id={id} table={table} system={system} edit={edit} editSystem={editSystem} />

      {columns.length ? (
        <Field label="Если ничего не совпало" hint="Пусто — движок скажет, что значения не знает.">
          <Input
            value={table.otherwise === undefined ? '' : String(table.otherwise)}
            placeholder="оставить пустым"
            mono
            onChange={next => edit(draft => {
              if (next === '') delete draft.otherwise; else draft.otherwise = parseFree(next);
            })}
          />
        </Field>
      ) : null}
    </Fold>
    </div>
  );
}

function Columns({ id, table, system, edit }: {
  id: string;
  table: Table;
  system: System;
  edit: (change: (draft: Table) => void) => void;
}) {
  const columns = table.columns ?? [];
  const others = Object.entries(system.tables ?? {}).filter(([key]) => key !== id);

  return (
    <div className="stack stack--tight">
      <span className="field__label">Колонки</span>
      {columns.length ? columns.map((column, i) => (
        <div key={column.key} className="pair">
          <Input
            value={column.label ?? ''}
            placeholder="как зовётся колонка"
            onChange={next => edit(draft => { const c = draft.columns?.[i]; if (c) c.label = next; })}
          />
          <div className="inline inline--tight">
            <Select
              value={column.kind ?? 'text'}
              options={COLUMN_KINDS}
              onChange={next => edit(draft => {
                const c = draft.columns?.[i];
                if (!c) return;
                c.kind = next;
                if (next !== 'choice') delete c.from;
              })}
            />
            {column.kind === 'choice' ? (
              <Select
                value={column.many ? 'many' : 'one'}
                options={[['one', 'одно'], ['many', 'несколько']] as const}
                onChange={next => edit(draft => {
                  const c = draft.columns?.[i];
                  if (!c) return;
                  if (next === 'many') c.many = true; else delete c.many;
                })}
              />
            ) : null}
            {column.kind === 'choice' ? (
              <Select
                value={column.from ?? ''}
                options={[['', '— из какой таблицы —'], ...others.map(([key, t]) => [key, t.label || key] as const)] as never}
                onChange={next => edit(draft => {
                  const c = draft.columns?.[i];
                  if (!c) return;
                  if (next) c.from = next; else delete c.from;
                })}
              />
            ) : null}
          </div>
          <Button size="sm" variant="danger" onClick={() => edit(draft => {
            const gone = draft.columns?.[i]?.key;
            draft.columns?.splice(i, 1);
            if (gone) for (const row of draft.rows ?? []) delete row.cells?.[gone];
          })}>×</Button>
        </div>
      )) : <span className="faint">Колонок нет — таблица служит списком для выбора.</span>}
      <Button size="sm" onClick={() => edit(draft => {
        const taken = (draft.columns ?? []).map(c => c.key);
        (draft.columns ??= []).push({ key: freeId(taken, 'колонка'), label: '', kind: 'number' });
      })}>+ колонка</Button>
    </div>
  );
}

const defaultWidth = (column?: TableColumn): number =>
  (!column ? 200 : column.kind === 'expr' ? 240 : column.kind === 'choice' && column.many ? 220 : 150);

function Rows({ id, table, system, edit, editSystem }: {
  id: string;
  table: Table;
  system: System;
  edit: (change: (draft: Table) => void) => void;
  editSystem: EditSystem;
}) {
  const compendium = useWorld(s => s.compendium);
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
    (row.cells ??= {})[column] = value;
  });

  const lead = byRange ? ['от', 'до'] : [key === 'number' ? 'число' : 'слово'];
  const gridColumns: GridColumn[] = [
    ...lead.map(name => ({ key: `:${name}`, label: name, width: byRange ? 90 : defaultWidth() })),
    ...columns.map(c => ({ key: c.key, label: c.label || c.key, width: defaultWidth(c) })),
  ];

  return (
    <div className="stack stack--tight">
      <span className="field__label">Строки</span>

      <SheetGrid id={`table.${id}`} columns={gridColumns}>
          {rows.map((row, i) => (
            <RowCells
              key={i} row={row} at={i} rowKey={key} columns={columns} system={system}
              users={key === 'range' ? [] : rowUsers(system, id, row.value, compendium).map(u => u.text)}
              onRename={to => rename(row.value, to)} taken={next => taken(next, i)}
              edit={edit} setCell={setCell}
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

      {!columns.length && rows.length ? (
        <div className="inline inline--tight">
          {rows.slice(0, 8).map((row, i) => <Chip key={i}>{String(row.value ?? '')}</Chip>)}
          {rows.length > 8 ? <span className="faint">и ещё {rows.length - 8}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function RowCells({ row, at, rowKey, columns, system, edit, setCell, users, onRename, taken, where }: {
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
        <KeyInput value={row.value} numeric={rowKey === 'number'} taken={taken} onRename={onRename} />
      )}
      {columns.map(column => (column.kind === 'expr' ? (
        <FormulaField
          key={column.key}
          value={String(cells[column.key] ?? '')}
          system={system}
          where={where(column)}
          placeholder="формула"
          onChange={value => setCell(at, column.key, value)}
        />
      ) : (
        <Cell key={column.key} column={column} value={cells[column.key]} system={system}
          onChange={value => setCell(at, column.key, value)} />
      )))}
      {users.length ? (
        <Button size="sm" variant="danger" disabled title={`строку используют: ${users.slice(0, 4).join('; ')}${users.length > 4 ? ` и ещё ${users.length - 4}` : ''}`}>×</Button>
      ) : (
        <Button size="sm" variant="danger" onClick={() => edit(draft => { draft.rows?.splice(at, 1); })}>×</Button>
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

function Cell({ column, value, system, onChange }: {
  column: TableColumn;
  value: unknown;
  system: System;
  onChange: (value: unknown) => void;
}) {
  const kind = column.kind ?? 'text';
  if (kind === 'number') {
    return <NumInput value={Number(value ?? 0)} onCommit={onChange} />;
  }
  if (kind === 'dice') {
    return <DiceProp value={String(value ?? '')} onChange={onChange} />;
  }
  if (kind === 'effect') {
    return (
      <Select
        value={String(value ?? '')}
        options={[['', '— какой эффект —'],
          ...Object.entries(system.effects ?? {}).map(([key, e]) => [key, e.label || key] as const)] as never}
        onChange={next => onChange(next)}
      />
    );
  }
  if (kind === 'tag') {
    return (
      <Select
        value={String(value ?? '')}
        options={[['', '— какое поле —'], ...system.fields.map(f => [f.tag, f.label] as const)] as never}
        onChange={next => onChange(next)}
      />
    );
  }
  if (kind === 'choice' && column.many) {
    return <MultiChoice value={value} options={listOf(system, column.from) ?? []} onChange={onChange} />;
  }
  if (kind === 'choice') {
    const options = listOf(system, column.from) ?? [];
    return (
      <Select
        value={String(value ?? '')}
        options={[['', options.length ? '— выберите —' : '— таблица не выбрана —'],
          ...options.map(o => [String(o.value), o.label] as const)] as never}
        onChange={next => onChange(next)}
      />
    );
  }
  return <Input value={String(value ?? '')} placeholder="слово" onChange={onChange} />;
}
