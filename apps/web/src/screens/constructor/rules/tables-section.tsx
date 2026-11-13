import { ColumnSheetFields } from '../table-field.tsx';
import type { CellValue } from '@vtt/schema';
import { rowNames } from '../row-names.ts';
import { renameLayoutColumn, renameLayoutTable } from '@vtt/engine/model/layout';
export { rowNames } from '../row-names.ts';
import { kindsFor, kindWord } from '@vtt/engine/words/kinds';
import { isFormulaCell, onSheet, isSingle, holderOf, fieldsOf, withColumn, forgetFields, rowPieces } from '@vtt/engine/model/sheet-columns';
import type { RowPiece } from '@vtt/engine/model/sheet-columns';
import { Card, CardHead, Input, NumInput, Button, DangerButton, Fold, Select, Verdict, Empty, Field, Chip, TextArea } from '../../../ui/primitives.tsx';
import { LiveValue } from '../live-value.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { ColumnCard } from './column-card.tsx';
import { UsageRow } from '../effects/call-map.tsx';
import type { ColumnPatch } from './column-card.tsx';
import { SheetGrid } from '../../../ui/sheet-grid.tsx';
import { FieldRow } from '../../../ui/field-row.tsx';
import type { GridColumn } from '../../../ui/sheet-grid.tsx';
import { ValueEditor } from '../../../ui/value-editor.tsx';
import { newTable } from '../factory.ts';
import { usersOf, useUsage, insideTable } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import { freeId, slugOf, useBook } from '../../../store/world.ts';
import { listUsers } from '@vtt/engine/model/lists';
import { isRange, keyOf, choiceTables, rowTables, numberTables } from '@vtt/engine/model/tables';
import { rowUsers, renameRow, renameRowInBook } from '@vtt/engine/model/integrity';
import { useWorld } from '../../../store/world.ts';
import { useState, useRef, useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import type { System, Table, TableRow, TableKey } from '@vtt/schema';
import { StagesEditor } from '../stages-editor.tsx';
import type { TableColumn, Holder } from '@vtt/engine/model/types';
import type { WorldState } from '../../../store/world.ts';
import { setRowView } from '../row-view.ts';
import type { RowViewKey } from '../row-view.ts';
import { focusNew } from '../../../ui/focus-new.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

const ROW_KEYS = [
  ['word', 'слово'],
  ['number', 'число'],
  ['range', 'диапазон'],
] as const;

const freeNumber = (rows: TableRow[]): number => {
  const used = rows.map(row => row.value).filter((value): value is number => typeof value === 'number');
  return used.length ? Math.max(...used) + 1 : 0;
};

const blankRow = (key: TableKey, rows: TableRow[]): TableRow =>
  (key === 'range' ? { from: 1, to: 1, cells: {} }
    : key === 'number' ? { value: freeNumber(rows), cells: {} }
      : { value: '', cells: {} });

const COLUMN_KINDS = kindsFor('table');
const FIELD_KINDS = kindsFor('field');
const PROP_KINDS = kindsFor('prop');

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

const addTable = (editSystem: EditSystem) => {
  focusNew('как зовётся таблица');
  let key = '';
  editSystem(draft => {
    const made = newTable(draft);
    key = made.key;
    (draft.tables ??= {})[made.key] = made.value;
  });
  if (key) useWorld.getState().pick({ activeTableId: key });
};

export function renameTable(system: System, id: string, label: string, world: { compendium?: unknown; sheets?: unknown }): string {
  const table = system.tables?.[id];
  if (!table) return id;
  const auto = /^таблица(_\d+)?$/u.test(id) || id === slugOf(table.label ?? '');
  const { [id]: _self, ...others } = system.tables ?? {};
  const rest = JSON.stringify({ s: { ...system, blocks: undefined, tables: others }, c: world.compendium, sh: world.sheets });
  const named = new RegExp(`(?<![\\p{L}\\p{N}_])${id}(?![\\p{L}\\p{N}_])`, 'u').test(rest);
  return auto && !named && slugOf(label)
    ? freeId([...Object.keys(others), ...fieldsOf(system).map(f => f.tag)], label)
    : id;
}

export function moveTable(draft: System, from: string, to: string): void {
  if (from === to || !draft.tables?.[from]) return;
  draft.tables = Object.fromEntries(Object.entries(draft.tables).map(([key, table]) => [key === from ? to : key, table]));
  renameLayoutTable(draft, from, to);
  forgetFields(draft);
}

const OWNER_GROUPS: [string | undefined, string][] = [
  ['sheet', 'Своё у каждого листа'],
  ['group', 'Общее у группы'],
  ['desk', 'Общее на столе'],
  [undefined, 'Справочники'],
];

export function groupsOfTables(entries: [string, Table][]): [string, [string, Table][]][] {
  const name = ([key, table]: [string, Table]) => table.label || key;
  return OWNER_GROUPS
    .map(([owner, title]) => [title, entries
      .filter(([, table]) => (table.owner ?? undefined) === owner)
      .sort((a, b) => name(a).localeCompare(name(b), 'ru'))] as [string, [string, Table][]])
    .filter(([, list]) => list.length);
}

export const NO_FOLDER = '';

export const foldersOf = (system: System): string[] =>
  [...new Set(Object.values(system.tables ?? {}).map(table => table.group).filter((g): g is string => Boolean(g)))]
    .sort((a, b) => a.localeCompare(b, 'ru'));

export function foldersInGroup(list: [string, Table][]): [string, [string, Table][]][] {
  const folders = [...new Set(list.map(([, table]) => table.group ?? NO_FOLDER).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const part = (folder: string) => list.filter(([, table]) => (table.group ?? NO_FOLDER) === folder);
  return [...folders, NO_FOLDER]
    .map(folder => [folder, part(folder)] as [string, [string, Table][]])
    .filter(([, items]) => items.length);
}

function FolderInput({ value, folders, onChange }: { value: string; folders: string[]; onChange: (next: string) => void }) {
  const list = useId();
  return (
    <>
      <input className="input" list={list} value={value} placeholder="без папки" onChange={e => onChange(e.target.value)} />
      <datalist id={list}>{folders.map(folder => <option key={folder} value={folder} />)}</datalist>
    </>
  );
}

export function TablesSection({ system, editSystem, usage }: Props) {
  const entries = rowTables(system);

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
            hint="Справочники, прогрессия по уровню, списки выбора — всё это таблицы."
            action={<Button size="sm" onClick={() => addTable(editSystem)}>+ таблица</Button>}
          />
        ) : groupsOfTables(entries).flatMap(([title, list]) => {
          const folders = foldersInGroup(list);
          const foldered = folders.some(([folder]) => folder !== NO_FOLDER);
          return [
            <span key={`группа|${title}`} className="table-group__title">{title}</span>,
            ...folders.flatMap(([folder, items]) => [
              ...(foldered ? [<span key={`папка|${title}|${folder}`} className="table-folder__title">{folder || 'без папки'}</span>] : []),
              ...items.map(([key, table]) => (
                <TableCard key={key} id={key} table={table} system={system} editSystem={editSystem} usage={usage} />
              )),
            ]),
          ];
        })}
      </div>
    </Card>
  );
}

export function TableCard({ id, table, system, editSystem, usage, opened, onRekey, onClose }: Props & { id: string; table: Table; opened?: boolean; onRekey?: (key: string) => void; onClose?: () => void }) {
  const byRange = isRange(table);
  const rows = table.rows ?? [];
  const columns = table.columns ?? [];
  const blocks = (system.blocks ?? []).filter(block => block.parts.some(part => part.table === id)).map(block => `блок «${block.name}»`);
  const users = [...new Set([...listUsers(system, id), ...usersOf(usage, 'table', id, system, insideTable(id)), ...blocks])];
  const wanted = useWorld(s => s.activeTableId) === id;
  const [openAtStart] = useState(wanted || Boolean(opened));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wanted) return;
    ref.current?.scrollIntoView?.({ block: 'start' });
    useWorld.getState().pick({ activeTableId: null });
  }, [wanted]);
  const held = users.length > 0;
  const [picked, setPicked] = useState<string | null>(null);
  const [general, setGeneral] = useState(false);
  const pick = (key: string | null, toGeneral = false) => { setPicked(key); setGeneral(toGeneral); };
  const [rekey, setRekey] = useState<TableKey | null>(null);
  const broken = byRange && rangesBroken(rows);
  const applyKey = (next: TableKey) => edit(draft => {
    const was = keyOf(draft);
    draft.key = next;
    if ((was === 'range') !== (next === 'range')) draft.rows = [blankRow(next, [])];
    if (next === 'number') {
      for (const row of draft.rows ?? []) row.value = Number(row.value) || 0;
    }
  });

  const edit = (change: (draft: Table) => void) => editSystem(draft => {
    const target = draft.tables?.[id];
    if (target) change(target);
  });
  const relabel = (next: string) => {
    const state = useWorld.getState();
    const fresh = renameTable(state.system, id, next, { compendium: state.compendium, sheets: state.sheets });
    editSystem(draft => {
      const target = draft.tables?.[id];
      if (target) target.label = next;
      moveTable(draft, id, fresh);
    });
    if (fresh === id) return;
    if (onRekey) onRekey(fresh); else state.pick({ activeTableId: fresh });
  };

  const summary = users.length
    ? (users.length > 3
      ? `берут отсюда: ${users.slice(0, 3).join(', ')} и ещё ${users.length - 3}`
      : `берут отсюда: ${users.join(', ')}`)
    : 'пока никто не берёт';

  return (
    <div ref={ref}>
    <Fold
      title={table.label || id} count={rows.length} open={openAtStart || undefined}
      rename={{ value: table.label ?? '', placeholder: 'как зовётся таблица', onCommit: relabel }}
      actions={(
        <>
          {held ? (
            <Button size="sm" variant="danger" disabled title={`нельзя удалить: ${summary}`}>Удалить</Button>
          ) : (
            <DangerButton size="sm" title="удалить таблицу из системы" onConfirm={() => editSystem(draft => { delete draft.tables?.[id]; })}>
              Удалить
            </DangerButton>
          )}
          {onClose ? <Button size="sm" variant="ghost" title="закрыть таблицу" onClick={onClose}>×</Button> : null}
        </>
      )}
    >
      <Fold title="ещё" summary={`чьи значения, ключ строки, подсказка · ${summary}`}>
      <FieldRow
        id="table-head"
        fields={[
          {
            key: 'key', label: 'Ключ строки', width: 150,
            node: (
              <Select
                value={keyOf(table)}
                options={ROW_KEYS}
                onChange={next => {
                  const wipes = (keyOf(table) === 'range') !== (next === 'range') && rows.some(row => row.value !== undefined && row.value !== '' || Object.keys(row.cells ?? {}).length);
                  if (wipes) setRekey(next); else applyKey(next);
                }}
              />
            ),
          },
          {
            key: 'owner', label: 'Чьи значения', width: 170,
            hint: 'Справочник — значения одни на всех; у листа, группы или стола — у каждого свои.',
            node: (
              <Select<string>
                value={table.owner ?? ''}
                options={[['', 'справочник'], ...HOLDERS]}
                onChange={next => edit(draft => { if (next) draft.owner = next as Table['owner']; else delete draft.owner; })}
              />
            ),
          },
          {
            key: 'icon', label: 'Значок', width: 80,
            node: <Input value={table.icon ?? ''} placeholder="⚔" onChange={next => edit(draft => { if (next.trim()) draft.icon = next.trim(); else delete draft.icon; })} />,
          },
          {
            key: 'hint', label: 'Подсказка', width: 220,
            node: <TextArea value={table.hint ?? ''} placeholder="что это за таблица" onChange={next => edit(draft => { if (next.trim()) draft.hint = next; else delete draft.hint; })} />,
          },
          {
            key: 'group', label: 'Папка', width: 180,
            hint: 'Таблицы с одной папкой в списке идут вместе.',
            node: <FolderInput value={table.group ?? ''} folders={foldersOf(system)} onChange={next => edit(draft => { if (next.trim()) draft.group = next.trim(); else delete draft.group; })} />,
          },
          {
            key: 'note', label: 'Заметка автора', width: 260,
            hint: 'Видна только здесь, игроку не показывается.',
            node: <TextArea value={table.note ?? ''} placeholder="для себя" onChange={next => edit(draft => { if (next.trim()) draft.note = next; else delete draft.note; })} />,
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
      />

      <UsageRow title="Где используется:" items={users.map(text => ({ key: text, text }))} />
      </Fold>

      {rekey ? (
        <Verdict tone="warn" action={(
          <>
            <Button size="sm" variant="danger" onClick={() => { applyKey(rekey); setRekey(null); }}>сменить и стереть строки</Button>
            <Button size="sm" variant="ghost" onClick={() => setRekey(null)}>отмена</Button>
          </>
        )}>
          {rekey === 'range' ? 'Диапазоны' : 'Слова и числа'} — другой вид строк: старые строки сотрутся.
        </Verdict>
      ) : null}
      {broken ? <Verdict tone="warn">диапазоны перекрываются или дырявы</Verdict> : null}

      {picked && columns.some(c => c.key === picked) ? (
        <TableColumnCard key={`${picked}:${general}`} id={id} table={table} column={columns.find(c => c.key === picked)!} system={system} edit={edit} more={general} onClose={() => pick(null)} onRekey={key => pick(key)} />
      ) : null}

      <Rows key={id} id={id} table={table} system={system} edit={edit} editSystem={editSystem} picked={picked} onPick={pick} />
    </Fold>
    </div>
  );
}


const kindLabel = (column: TableColumn): string =>
  (column.kind === undefined && column.expr !== undefined ? 'по формуле' : `${kindWord(column.kind)}${column.expr !== undefined ? ' · формула' : ''}`);

const HOLDERS = [
  ['sheet', 'своё у каждого листа'],
  ['group', 'общее у группы — отряда, банды'],
  ['desk', 'общее на столе — одно на комнату'],
] as const;

export function renameColumn(draft: System, tableId: string, key: string, label: string, fresh: string): void {
  const column = draft.tables?.[tableId]?.columns?.find(c => c.key === key);
  if (!column) return;
  column.label = label;
  if (fresh !== key) renameLayoutColumn(draft, tableId, key, fresh);
  column.key = fresh;
}

export function moveColumn(draft: System, tableId: string, key: string, holder: Holder): void {
  const from = draft.tables?.[tableId];
  const column = from?.columns?.find(c => c.key === key);
  if (!from || !column) return;
  from.columns = from.columns!.filter(c => c.key !== key);
  forgetFields(draft);
  draft.tables = withColumn(draft, column, holder).tables;
}

const HOLDER_WORDS: Record<Holder, string> = { sheet: 'у каждого героя своё', group: 'общее у группы', desk: 'одно на весь стол' };

export function whose(table: Table, column: TableColumn, id: string): string {
  const holder = holderOf(table);
  if (isSingle(table)) return column.expr !== undefined ? 'поле · считается по формуле' : `поле · ${HOLDER_WORDS[holder ?? 'sheet']}`;
  if (table.shape === 'book') return `свойство «${table.label || id}» · у каждой записи своё`;
  const value = column.expr !== undefined ? 'одна формула на все строки' : holder ? `в каждой строке ${HOLDER_WORDS[holder]}` : 'у каждой строки своё значение';
  return `колонка таблицы «${table.label || id}» · ${value}`;
}

export function TableColumnCard({ id, table, column, system, edit, onClose, onRekey, onOpenTable, extra, lead, bounds = true, more = false }: {
  more?: boolean;
  onRekey?: (key: string) => void;
  onOpenTable?: () => void;
  extra?: ReactNode;
  lead?: ReactNode;
  bounds?: boolean;
  id: string;
  table: Table;
  column: TableColumn;
  system: System;
  edit: (change: (draft: Table) => void) => void;
  onClose: () => void;
}) {
  const single = isSingle(table);
  const book = table.shape === 'book';
  const usage = useUsage();
  const compendium = useBook();
  const editSystem = useWorld(state => state.editSystem);
  const pick = useWorld(state => state.pick);
  const set = (change: (c: TableColumn) => void) => edit(draft => {
    const c = draft.columns?.find(x => x.key === column.key);
    if (c) change(c);
  });
  const others = (single || book ? choiceTables(system) : rowTables(system).filter(([key]) => key !== id))
    .map(([key, t]) => [key, t.label || key] as [string, string]);
  const name = column.label || column.key;
  const users = single ? usersOf(usage, 'field', column.key, system) : [];

  const rename = (label: string) => {
    const state = useWorld.getState();
    const key = column.key;
    const world = JSON.stringify({ s: { ...state.system, blocks: undefined }, c: state.compendium, sh: state.sheets });
    const auto = /^(field|колонка)(_\d+)?$/u.test(key) || key === slugOf(column.label ?? '');
    const named = new RegExp(`[@#.]${key}(?![\\p{L}\\p{N}_])`, 'u').test(world);
    const filled = (table.rows ?? []).some(row => row.cells && key in row.cells);
    const virgin = !book && auto && !named && (single ? world.split(`"${key}"`).length - 1 <= 1 : !filled);
    const taken = single
      ? [...fieldsOf(state.system).map(f => f.tag).filter(tag => tag !== key), ...Object.keys(state.system.tables ?? {})]
      : (table.columns ?? []).map(c => c.key).filter(other => other !== key);
    const fresh = virgin && slugOf(label) ? freeId(taken, label) : key;
    editSystem(draft => renameColumn(draft, id, key, label, fresh));
    if (fresh === key) return;
    if (single) pick({ activeFieldTag: fresh });
    if (state.activeColumn?.table === id && state.activeColumn.column === key) pick({ activeColumn: { table: id, column: fresh } });
    onRekey?.(fresh);
  };

  return (
    <ColumnCard
      table={id}
      column={{ label: column.label ?? '', kind: column.kind ?? (column.expr ? '' : single ? 'number' : 'text'), from: column.from, many: column.many, expr: column.expr?.expr, hint: column.hint, min: column.min, max: column.max }}
      kinds={single ? FIELD_KINDS : book ? PROP_KINDS : COLUMN_KINDS}
      tables={others}
      rowsOf={numberTables(system).filter(([key]) => key !== id).map(([key, t]) => [key, t.label || key] as [string, string])}
      many
      formulaHint={single ? 'Формула для всех листов' : book ? 'Формула для всех записей' : 'Формула для всех строк'}
      where={`${table.label || id} · ${name}`}
      noun={single ? 'поле' : book ? 'свойство' : 'колонка'}
      sub={<>{whose(table, column, id)}{onOpenTable && !single && !book ? <> <Button size="sm" variant="ghost" onClick={onOpenTable}>открыть таблицу</Button></> : null}</>}
      {...(single ? {} : { names: rowNames(system, id) })}
      system={system}
      onChange={patch => (patch.label !== undefined ? rename(patch.label) : set(c => applyPatch(c, patch)))}
      onDelete={users.length ? null : () => {
        edit(draft => {
          draft.columns = (draft.columns ?? []).filter(c => c.key !== column.key);
          for (const row of draft.rows ?? []) { delete row.cells?.[column.key]; delete row.view?.[column.key]; }
        });
        onClose();
      }}
      onClose={onClose}
      preview={single && column.expr !== undefined
        ? <LiveValue system={system} compendium={compendium} tag={column.key} source={column.expr.expr} /> : null}
      lead={lead}
      bounds={bounds}
      more={more}
      hinted
      extra={<>
        {single || onSheet(table) ? <ColumnSheetFields tableId={id} column={column} system={system} /> : null}
        {(column.kind ?? 'number') === 'number' && (single || column.stages) ? (
          <StagesEditor stages={column.stages} onChange={next => set(c => { if (next) c.stages = next; else delete c.stages; })} />
        ) : null}
        {book ? (
          <Field label="Обязательна">
            <Select
              value={column.optional ? 'no' : 'yes'}
              options={[['yes', 'да — запись без неё неполна'], ['no', 'нет — можно оставить пустой']] as const}
              onChange={next => set(c => { if (next === 'no') c.optional = true; else delete c.optional; })}
            />
          </Field>
        ) : null}
        {!single && !book && !table.owner && (column.kind ?? 'number') === 'number' ? (
          <Field label="Граница дистанции" hint="полоса дистанции в таблице: «от» и «до» в единицах клетки поля боя">
            <Select
              value={column.bound ?? ''}
              options={[['', 'нет'], ['from', 'от'], ['to', 'до']] as const}
              onChange={next => set(c => { if (next) c.bound = next as 'from' | 'to'; else delete c.bound; })}
            />
          </Field>
        ) : null}
        {single ? <Field label="Чьё значение">
          <Select
            value={holderOf(table) ?? 'sheet'}
            options={HOLDERS}
            onChange={next => editSystem(draft => moveColumn(draft, id, column.key, next))}
          />
        </Field> : null}
        {single && users.length ? (
          <div className="inline inline--tight">
            <span className="faint">смотрят:</span>
            {users.map(user => <Chip key={user}>{user}</Chip>)}
          </div>
        ) : null}
        {extra}
      </>}
    />
  );
}

function applyPatch(c: TableColumn, patch: ColumnPatch): void {
  if (patch.label !== undefined) c.label = patch.label;
  if (patch.kind === '') {
    delete c.kind; delete c.default; delete c.from; delete c.many;
  } else if (patch.kind !== undefined) {
    if (patch.kind !== c.kind) { delete c.default; delete c.from; }
    c.kind = patch.kind;
    if (patch.kind !== 'choice') delete c.many;
    if (patch.kind !== 'number') { delete c.min; delete c.max; }
  }
  if (patch.from !== undefined) { if (patch.from) c.from = patch.from; else delete c.from; }
  if (patch.many !== undefined && Boolean(patch.many) !== Boolean(c.many)) { delete c.default; if (patch.many) c.many = true; else delete c.many; }
  if (patch.expr !== undefined) {
    if (patch.expr !== null) c.expr = { expr: patch.expr };
    else { delete c.expr; if (c.kind === undefined) c.kind = 'number'; }
  }
  if (patch.hint !== undefined) { if (patch.hint) c.hint = patch.hint; else delete c.hint; }
  if (patch.min !== undefined) { if (patch.min !== null) c.min = patch.min; else delete c.min; }
  if (patch.max !== undefined) { if (patch.max !== null) c.max = patch.max; else delete c.max; }
}

const defaultWidth = (column?: TableColumn): number =>
  (!column ? 200 : column.expr !== undefined ? 360 : column.kind === 'choice' && column.many ? 220 : 150);

function Rows({ id, table, system, edit, editSystem, picked, onPick }: {
  picked: string | null;
  onPick: (key: string | null, toGeneral?: boolean) => void;
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
    else (row.cells ??= {})[column] = value as CellValue;
  });

  const placed = onSheet(table);
  const lead = byRange ? ['от', 'до'] : key === 'number' ? ['число', 'подпись'] : ['строка'];
  const gridColumns: GridColumn[] = [
    ...lead.map(name => ({ key: `:${name}`, label: name, width: byRange ? 90 : defaultWidth() })),
    ...columns.map(c => ({
      key: c.key, label: c.label || c.key, sub: kindLabel(c), width: defaultWidth(c),
      active: picked === c.key, onClick: () => onPick(picked === c.key ? null : c.key),
    })),
  ];
  const addRow = () => {
    if (!byRange) focusNew();
    edit(draft => {
      const list = (draft.rows ??= []);
      if (byRange) {
        const from = list.length ? (list[list.length - 1]!.to ?? 0) + 1 : 1;
        list.push({ from, to: from, cells: {} });
      } else {
        list.push(blankRow(key, list));
      }
    });
  };
  const addColumn = () => {
    focusNew('как зовётся колонка');
    const key = freeId(columns.map(c => c.key), 'колонка');
    edit(draft => { (draft.columns ??= []).push({ key, label: '', kind: 'number' }); });
    onPick(key);
  };
  const names = rowNames(system, id);
  const tuned = placed ? columns.filter(c => (c.kind ?? 'number') === 'number' && c.expr === undefined) : [];
  const [own, setOwn] = useState(() => rows.some(row => tuned.some(c => row.view?.[c.key] && ('min' in row.view[c.key]! || 'max' in row.view[c.key]! || 'default' in row.view[c.key]!))));
  const showOwn = own && tuned.length > 0;
  const shown = tuned.some(c => c.key === picked) ? tuned.filter(c => c.key === picked) : tuned;
  const VIEW_PARTS: [RowViewKey, string][] = [['default', 'в новом листе'], ['min', 'не ниже'], ['max', 'не выше']];
  const ownColumns: GridColumn[] = showOwn ? shown.flatMap(c => VIEW_PARTS.map(([part, word]) => ({
    key: `:${c.key}:${part}`, label: `${c.label || c.key}: ${word}`, sub: 'своё у строки · общее — щелчком', width: defaultWidth(),
    active: picked === c.key, onClick: () => onPick(c.key, true),
  }))) : [];
  const generalOf = (column: TableColumn, part: RowViewKey): unknown => (part === 'default' ? column.default ?? 0 : column[part]);
  const setOwnCell = (i: number, column: TableColumn, part: RowViewKey, value: unknown) => {
    if (part === 'default' && value !== null && typeof value === 'object') return;
    edit(draft => {
      const row = draft.rows?.[i];
      if (row) setRowView(row, column.key, part, value, generalOf(column, part));
    });
  };

  return (
    <div className="stack stack--tight">
      <span className="field__label">Строки</span>
      {tuned.length ? (
        <Button size="sm" variant="ghost" title="у колонки — общее; строка может перебить своим: пустая клетка — как у колонки"
          onClick={() => setOwn(!own)}>{showOwn ? 'скрыть «в новом листе» и границы строк' : 'ещё: «в новом листе» и границы строк'}</Button>
      ) : null}

      <SheetGrid id={`table.${id}`} columns={[...gridColumns, ...ownColumns]} tailHead={<span data-guide="add-column"><Button size="sm" variant="ghost" title="добавить колонку" onClick={addColumn}>+</Button></span>}>
          {rows.map((row, i) => (
            <RowCells
              key={i} tableId={id} row={row} at={i} rowKey={key} columns={columns} system={system} placed={placed}
              users={key === 'range' ? [] : rowUsers(system, id, row.value, compendium).map(u => u.text)}
              onRename={to => (row.value === undefined || row.value === ''
                ? edit(draft => { const target = draft.rows?.[i]; if (target) target.value = to as never; })
                : rename(row.value, to))} taken={next => taken(next, i)}
              edit={edit} setCell={setCell} names={names}
              own={showOwn ? shown.flatMap(c => VIEW_PARTS.map(([part]) => (
                <CellEditor
                  key={`${c.key}:${part}`}
                  column={{ key: `${c.key}:${part}`, label: c.label, kind: 'number' }}
                  value={row.view?.[c.key]?.[part]}
                  system={system}
                  where={`${table.label || id} · «${String(row.value ?? '')}» · ${c.label || c.key}`}
                  names={names}
                  placed={false}
                  placeholder={generalWord(generalOf(c, part))}
                  onChange={value => setOwnCell(i, c, part, value)}
                />
              ))) : undefined}
              where={column => `${table.label || id} · «${String(row.value ?? `${row.from}–${row.to}`)}» · ${column.label || column.key}`}
            />
          ))}
      </SheetGrid>

      <Button size="sm" onClick={addRow}>{byRange ? '+ ступень' : '+ строка'}</Button>

    </div>
  );
}

const TYPED = ['number', 'text', 'dice'];

const generalWord = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return 'как у колонки: нет';
  if (typeof value === 'object' && 'expr' in (value as object)) return 'как у колонки: формула';
  return `как у колонки: ${String(value)}`;
};

export const spoken = (system: System, tableId: string, row: TableRow, expr: string): RowPiece[] | undefined => {
  try { return rowPieces(system, tableId, row, expr); } catch { return undefined; }
};

export function CellEditor({ column, value, system, where, names, placed, inherited, placeholder, onChange }: {
  inherited?: RowPiece[];
  placeholder?: string;
  column: TableColumn;
  value: unknown;
  system: System;
  where: string;
  names: Map<string, string>;
  placed: boolean;
  onChange: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (isFormulaCell(value)) {
    return (
      <FormulaField
        value={value.expr}
        system={system}
        where={where}
        extraNames={names}
        placeholder="пусто — клетка очистится"
        onChange={next => onChange(next.trim() ? { expr: next } : undefined)}
      />
    );
  }
  const empty = value === undefined || value === '';
  const hint = placeholder ?? (column.expr !== undefined ? '= как у колонки' : placed ? 'вводит игрок' : '');
  if (!TYPED.includes(column.kind ?? 'text')) {
    return <ValueEditor type={column} value={empty ? '' : value} system={system} blank={hint || '— нет —'} onChange={next => onChange(next === '' ? undefined : next)} />;
  }
  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (!text) onChange(undefined);
    else if (text.startsWith('=')) onChange({ expr: text.slice(1).trim() });
    else if (column.kind === 'number') onChange(/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : { expr: text });
    else onChange(text);
  };
  if (column.expr !== undefined && empty && draft === null && inherited) {
    return (
      <button type="button" className="row-formula"
        title={`${inherited.map(piece => ('chip' in piece ? piece.chip : piece.text)).join('')} — формула колонки для этой строки; щёлкните, чтобы вписать строке своё`}
        onClick={() => setDraft('')}>
        {inherited.map((piece, at) => ('chip' in piece
          ? <span key={at} className="chips__chip">{piece.chip}</span>
          : <span key={at} className="row-formula__text">{piece.text}</span>))}
      </button>
    );
  }
  return (
    <Input
      value={draft ?? (empty ? '' : String(value))}
      mono={column.kind !== 'text'}
      autoFocus={draft === '' && empty}
      placeholder={hint}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function RowCells({ tableId, row, at, rowKey, columns, system, edit, setCell, users, onRename, taken, where, placed, names, own }: {
  tableId: string;
  own?: ReactNode[];
  placed: boolean;
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
          {rowKey === 'number' ? (
            <>
              <KeyInput value={row.value} numeric taken={taken} onRename={onRename} />
              <Input value={row.label ?? ''} placeholder="как показать" onChange={next => set(r => { if (next.trim()) r.label = next; else delete r.label; })} />
            </>
          ) : (
            <RowName row={row} taken={taken} onRename={onRename}
              onLabel={label => set(r => { if (label === undefined) delete r.label; else r.label = label; })}
              onFirst={(value, label) => set(r => { r.value = value as never; if (label === undefined) delete r.label; else r.label = label; })} />
          )}
        </>
      )}
      {columns.map(column => (
        <CellEditor
          key={column.key}
          column={column}
          value={cells[column.key]}
          system={system}
          where={where(column)}
          names={names}
          placed={placed}
          inherited={column.expr !== undefined ? spoken(system, tableId, row, column.expr.expr) : undefined}
          onChange={value => setCell(at, column.key, value)}
        />
      ))}
      {own}
      {users.length ? (
        <Button size="sm" variant="ghost" disabled title={`строку используют: ${users.slice(0, 4).join('; ')}${users.length > 4 ? ` и ещё ${users.length - 4}` : ''}`}>×</Button>
      ) : (
        <Button size="sm" variant="ghost" title="убрать строку" onClick={() => edit(draft => { draft.rows?.splice(at, 1); })}>×</Button>
      )}
    </>
  );
}

function RowName({ row, taken, onRename, onLabel, onFirst }: {
  row: TableRow;
  taken: (next: unknown) => boolean;
  onRename: (next: unknown) => void;
  onLabel: (label: string | undefined) => void;
  onFirst: (value: string, label: string | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const key = row.value === undefined ? '' : String(row.value);
  const shown = draft ?? row.label ?? key;
  const labelFor = (name: string, value: string) => (name === value ? undefined : name);

  const commit = () => {
    if (draft === null) return;
    const name = draft.trim();
    setDraft(null);
    if (!name || name === (row.label ?? key)) { setTrouble(null); return; }
    const slug = slugOf(name);
    if (!slug) { setTrouble('нужны буквы или цифры'); return; }
    if (!key) {
      if (taken(slug)) { setTrouble(`«${name}» уже есть`); return; }
      setTrouble(null);
      onFirst(slug, labelFor(name, slug));
      return;
    }
    setTrouble(null);
    if (slug !== key && !taken(slug)) {
      onRename(slug);
      onLabel(labelFor(name, slug));
      return;
    }
    onLabel(labelFor(name, key));
  };

  return (
    <div className="stack stack--tight">
      <Input
        value={shown}
        invalid={Boolean(trouble)}
        placeholder="как зовётся строка"
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      {trouble ? <span className="field__error">{trouble}</span> : null}
    </div>
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

