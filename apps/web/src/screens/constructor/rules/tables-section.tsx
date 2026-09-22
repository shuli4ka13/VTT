import { Card, CardHead, Field, Input, NumInput, Button, DangerButton, Fold, Segmented, Select, Verdict, Chip, Empty } from '../../../ui/primitives.tsx';
import { FormulaChips } from '../../../ui/formula-chips.tsx';
import { DiceProp } from '../../../ui/dice-prop.tsx';
import { newTable } from '../factory.ts';
import { inUse } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import { freeId } from '../../../store/world.ts';
import { listUsers, listOf } from '@vtt/engine/model/lists';
import { isRange } from '@vtt/engine/model/tables';
import type { System, Table, TableColumn, TableRow } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

const COLUMN_KINDS = [
  ['number', 'число'],
  ['text', 'слово'],
  ['expr', 'формула'],
  ['dice', 'кость'],
  ['choice', 'выбор из таблицы'],
] as const;

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
  const users = listUsers(system, id);
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
    <Fold title={table.label || id} count={rows.length} summary={summary}>
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

      <Field label="Чем помечены строки">
        <Segmented
          value={byRange ? 'range' : 'word'}
          options={[
            { key: 'word', label: 'значением — слово или число' },
            { key: 'range', label: 'диапазоном чисел — от и до' },
          ] as const}
          onChange={next => edit(draft => {
            draft.key = next;
            draft.rows = next === 'range'
              ? [{ from: 1, to: 1, cells: {} }]
              : [{ value: '', label: '', cells: {} }];
          })}
        />
      </Field>

      {broken ? <Verdict tone="warn">диапазоны перекрываются или дырявы</Verdict> : null}

      <Columns id={id} table={table} system={system} edit={edit} />

      <Rows table={table} system={system} edit={edit} />

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

function Rows({ table, system, edit }: {
  table: Table;
  system: System;
  edit: (change: (draft: Table) => void) => void;
}) {
  const byRange = isRange(table);
  const rows = table.rows ?? [];
  const columns = table.columns ?? [];
  const numeric = table.of === 'number';

  const setCell = (i: number, column: string, value: unknown) => edit(draft => {
    const row = draft.rows?.[i];
    if (!row) return;
    (row.cells ??= {})[column] = value;
  });

  return (
    <div className="stack stack--tight">
      <div className="inline">
        <span className="field__label">Строки</span>
        {!byRange ? (
          <Select
            value={numeric ? 'number' : 'text'}
            options={[['text', 'значения — слова'], ['number', 'значения — числа']] as const}
            onChange={next => edit(draft => { draft.of = next; })}
          />
        ) : null}
      </div>

      <div className="table-grid" style={{ gridTemplateColumns: `${byRange ? '72px 72px' : 'minmax(90px, 1fr) minmax(120px, 1.4fr)'} ${columns.map(() => 'minmax(120px, 2fr)').join(' ')} auto` }}>
        {byRange ? <><span className="faint">от</span><span className="faint">до</span></> : <><span className="faint">значение</span><span className="faint">подпись</span></>}
        {columns.map(c => <span key={c.key} className="faint">{c.label || c.key}</span>)}
        <span />

        {rows.map((row, i) => (
          <RowCells
            key={i} row={row} at={i} byRange={byRange} numeric={numeric} columns={columns} system={system}
            edit={edit} setCell={setCell}
          />
        ))}
      </div>

      <Button size="sm" onClick={() => edit(draft => {
        const list = (draft.rows ??= []);
        if (byRange) {
          const from = list.length ? (list[list.length - 1]!.to ?? 0) + 1 : 1;
          list.push({ from, to: from, cells: {} });
        } else {
          list.push({ value: '', label: '', cells: {} });
        }
      })}>{byRange ? '+ ступень' : '+ строка'}</Button>

      {!columns.length && rows.length ? (
        <div className="inline inline--tight">
          {rows.slice(0, 8).map((row, i) => <Chip key={i}>{row.label || String(row.value ?? '')}</Chip>)}
          {rows.length > 8 ? <span className="faint">и ещё {rows.length - 8}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function RowCells({ row, at, byRange, numeric, columns, system, edit, setCell }: {
  row: TableRow;
  at: number;
  byRange: boolean;
  numeric: boolean;
  columns: TableColumn[];
  system: System;
  edit: (change: (draft: Table) => void) => void;
  setCell: (i: number, column: string, value: unknown) => void;
}) {
  const cells = row.cells ?? {};
  return (
    <>
      {byRange ? (
        <>
          <NumInput value={row.from ?? 0} onCommit={n => edit(draft => { const r = draft.rows?.[at]; if (r) r.from = n; })} />
          <NumInput value={row.to ?? 0} onCommit={n => edit(draft => { const r = draft.rows?.[at]; if (r) r.to = n; })} />
        </>
      ) : (
        <>
          <Input
            value={row.value === undefined ? '' : String(row.value)}
            placeholder={numeric ? '0' : 'ключ'}
            mono
            onChange={next => edit(draft => {
              const r = draft.rows?.[at];
              if (r) r.value = numeric ? (Number(next) || 0) : next;
            })}
          />
          <Input
            value={row.label ?? ''}
            placeholder="что видит человек"
            onChange={next => edit(draft => { const r = draft.rows?.[at]; if (r) r.label = next; })}
          />
        </>
      )}
      {columns.map(column => (
        <Cell key={column.key} column={column} value={cells[column.key]} system={system}
          onChange={value => setCell(at, column.key, value)} />
      ))}
      <Button size="sm" variant="danger" onClick={() => edit(draft => { draft.rows?.splice(at, 1); })}>×</Button>
    </>
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
  if (kind === 'expr') {
    return <FormulaChips value={String(value ?? '')} system={system} placeholder="формула" calculator onChange={onChange} />;
  }
  if (kind === 'dice') {
    return <DiceProp value={String(value ?? '')} onChange={onChange} />;
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
