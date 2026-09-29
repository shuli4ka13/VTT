import { kindsFor } from '@vtt/engine/words/kinds';
import { Card, CardHead, Field, Input, NumInput, Button, DangerButton, Fold, Select, Verdict, Empty } from '../../../ui/primitives.tsx';
import { BlockPick } from '../block-pick.tsx';
import { formulaAsLabels } from '../../../ui/formula.tsx';
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
  ['word', 'слово — «ближний бой», «огонь»'],
  ['number', 'число — 0, 1, 2'],
  ['range', 'диапазон чисел — уровень 1–4'],
] as const;

const blankRow = (key: TableKey): TableRow =>
  (key === 'range' ? { from: 1, to: 1, cells: {} }
    : key === 'number' ? { value: 0, cells: {} }
      : { value: '', cells: {} });

const COLUMN_KINDS = [...kindsFor('table'), ['sheet', 'своё у каждого листа']] as const;

const SHEET_HINT = 'В шаблоне: {key} — имя строки для формул, {label} — её подпись, {value} — слово строки, {колонка} — ячейка строки, {колонка.key} — имя строки той таблицы, на которую смотрит колонка.';

const newSheet = (table: Table, column: TableColumn): NonNullable<TableColumn['sheet']> => ({
  tag: `{key}_${column.key}`,
  label: `${column.label || column.key}: {label}`,
  group: table.label || 'Таблица',
  value: { kind: 'stored', type: 'number', default: 0 },
});

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
    <Fold
      title={table.label || id} count={rows.length} summary={summary} open={openAtStart || undefined}
      rename={{ value: table.label ?? '', placeholder: 'как зовётся таблица', onCommit: next => edit(draft => { draft.label = next; }) }}
    >
      <FieldRow
        id="table-head"
        fields={[
          {
            key: 'key', label: 'Ключ строки', width: 230,
            hint: 'По чему таблица находит строку: меч говорит «ближний бой», уровень — «7»',
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
            hint: 'Пусто — движок скажет, что значения не знает',
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

      <Columns id={id} table={table} system={system} edit={edit} />

      <Rows id={id} table={table} system={system} edit={edit} editSystem={editSystem} />
    </Fold>
    </div>
  );
}

const COLUMN_GRID: GridColumn[] = [
  { key: 'label', label: 'Колонка', width: 170 },
  { key: 'kind', label: 'Тип', width: 130 },
  { key: 'many', label: 'Сколько значений', width: 150, hint: 'для «из таблицы»: одно значение или несколько' },
  { key: 'from', label: 'Из таблицы', width: 150, hint: 'для «из таблицы»: из какой' },
];

function Columns({ id, table, system, edit }: {
  id: string;
  table: Table;
  system: System;
  edit: (change: (draft: Table) => void) => void;
}) {
  const columns = table.columns ?? [];
  const others = Object.entries(system.tables ?? {}).filter(([key]) => key !== id);
  const set = (i: number, change: (c: TableColumn) => void) => edit(draft => { const c = draft.columns?.[i]; if (c) change(c); });

  return (
    <div className="stack stack--tight">
      <span className="field__label">Колонки</span>
      {columns.length ? (
        <SheetGrid id="table-columns" columns={COLUMN_GRID}>
          {columns.map((column, i) => [
            <Input
              key={`${column.key}:label`}
              value={column.label ?? ''}
              placeholder="как зовётся"
              onChange={next => set(i, c => { c.label = next; })}
            />,
            <Select
              key={`${column.key}:kind`}
              value={column.sheet ? 'sheet' : column.kind ?? 'text'}
              options={COLUMN_KINDS as never}
              onChange={next => set(i, c => {
                if (next === 'sheet') {
                  c.sheet = newSheet(table, c);
                  delete c.kind; delete c.from; delete c.many;
                  return;
                }
                delete c.sheet;
                c.kind = next as NonNullable<TableColumn['kind']>;
                if (next !== 'choice') { delete c.from; delete c.many; }
              })}
            />,
            column.kind === 'choice' ? (
              <Select
                key={`${column.key}:many`}
                value={column.many ? 'many' : 'one'}
                options={[['one', 'одно'], ['many', 'несколько']] as const}
                onChange={next => set(i, c => { if (next === 'many') c.many = true; else delete c.many; })}
              />
            ) : <span key={`${column.key}:many`} className="faint">—</span>,
            column.kind === 'choice' ? (
              <Select
                key={`${column.key}:from`}
                value={column.from ?? ''}
                options={[['', '— какая —'], ...others.map(([key, t]) => [key, t.label || key] as const)] as never}
                onChange={next => set(i, c => { if (next) c.from = next; else delete c.from; })}
              />
            ) : <span key={`${column.key}:from`} className="faint">—</span>,
            <Button key={`${column.key}:drop`} size="sm" variant="ghost" title="убрать колонку" onClick={() => edit(draft => {
              const gone = draft.columns?.[i]?.key;
              draft.columns?.splice(i, 1);
              if (gone) for (const row of draft.rows ?? []) delete row.cells?.[gone];
            })}>×</Button>,
          ])}
        </SheetGrid>
      ) : null}
      {columns.map((column, i) => (column.sheet
        ? <SheetColumn key={column.key} table={table} column={column} system={system} set={change => set(i, change)} />
        : null))}
      <Button size="sm" onClick={() => edit(draft => {
        const taken = (draft.columns ?? []).map(c => c.key);
        (draft.columns ??= []).push({ key: freeId(taken, 'колонка'), label: '', kind: 'number' });
      })}>+ колонка</Button>
    </div>
  );
}

function SheetColumn({ table, column, system, set }: {
  table: Table;
  column: TableColumn;
  system: System;
  set: (change: (c: TableColumn) => void) => void;
}) {
  const sheet = column.sheet!;
  const first = system.fields.find(f => f.cell && f.cell.column === column.key && system.tables?.[f.cell.table] === table);
  const setSheet = (change: (s: NonNullable<TableColumn['sheet']>) => void) => set(c => { if (c.sheet) change(c.sheet); });
  const formula = sheet.value.kind === 'formula';

  return (
    <Fold title={`«${column.label || column.key}» на листе`} summary={first ? `${first.label} …` : undefined}>
      <div className="stack stack--tight">
        <div className="row">
          <Field label="Подпись поля">
            <Input value={sheet.label} onChange={next => setSheet(s => { s.label = next; })} />
          </Field>
          <Field label="Блок">
            <BlockPick of="fields" system={system} value={sheet.group}
              onChange={next => setSheet(s => { if (next) s.group = next; else delete s.group; })} />
          </Field>
          <Field label="Откуда значение">
            <Select
              value={formula ? 'formula' : 'stored'}
              options={[['stored', 'вводит игрок'], ['formula', 'считается формулой']] as const}
              onChange={next => setSheet(s => {
                s.value = next === 'formula' ? { kind: 'formula', expr: '' } : { kind: 'stored', type: 'number', default: 0 };
              })}
            />
          </Field>
        </div>
        {formula ? (
          <Field label="Формула — одна на все строки" hint={SHEET_HINT}>
            <Input mono value={sheet.value.kind === 'formula' ? sheet.value.expr : ''}
              placeholder="например: floor((@{key} - 10) / 2)"
              onChange={expr => setSheet(s => { s.value = { kind: 'formula', expr }; })} />
          </Field>
        ) : (
          <Field label="Сначала">
            <Input value={String(sheet.value.kind === 'stored' ? sheet.value.default : '')}
              onChange={text => setSheet(s => {
                if (s.value.kind !== 'stored') return;
                s.value = { ...s.value, default: /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text };
              })} />
          </Field>
        )}
        {first ? <span className="faint">для строки «{(table.rows ?? []).find(r => (r.key ?? String(r.value)) === first.cell?.row)?.label ?? first.cell?.row}»: {first.value.kind === 'formula' ? formulaAsLabels(system, first.value.expr) : 'вводит игрок'}</span> : null}
        <Fold title="ещё">
          <Field label="Имя поля в формулах" hint={SHEET_HINT}>
            <Input mono value={sheet.tag} onChange={next => setSheet(s => { s.tag = next; })} />
          </Field>
        </Fold>
      </div>
    </Fold>
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
    (row.cells ??= {})[column] = value;
  });

  const perSheet = columns.some(c => c.sheet);
  const lead = byRange ? ['от', 'до'] : [key === 'number' ? 'число' : 'слово', 'как показать', ...(perSheet ? ['имя в формулах'] : [])];
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
              key={i} row={row} at={i} rowKey={key} columns={columns} system={system} perSheet={perSheet}
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

    </div>
  );
}

function RowCells({ row, at, rowKey, columns, system, edit, setCell, users, onRename, taken, where, perSheet }: {
  perSheet: boolean;
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
      {columns.map(column => (column.sheet ? (
        <span key={column.key} className="faint">у каждого листа своё</span>
      ) : column.kind === 'expr' ? (
        <FormulaField
          key={column.key}
          value={String(cells[column.key] ?? '')}
          system={system}
          where={where(column)}
          placeholder="формула"
          onChange={value => setCell(at, column.key, value)}
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

