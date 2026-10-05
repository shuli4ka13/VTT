import { useWorld } from '../../store/world.ts';
import { Columns } from '../../ui/layout.tsx';
import { useLookupPane } from './lookup-panel.tsx';
import { Select, Button, Empty, DangerButton, Card } from '../../ui/primitives.tsx';
import { takesBounds } from '../../sheet/views/index.tsx';
import { DonorPalette } from './donors.tsx';
import { newColumn } from './factory.ts';
import { addColumn, CharacterSection } from './rules/character-section.tsx';
import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useUsage } from './usage.ts';
import { Segmented } from '../../ui/primitives.tsx';
import { placeOnSheet, sheetTables, BlockViewField } from './table-field.tsx';
import { TableColumnCard } from './rules/tables-section.tsx';
import { BlockPanel } from './block-panel.tsx';
import { RowPanel } from './row-panel.tsx';
import { SheetSample } from './sheet-sample.tsx';
import type { System } from '@vtt/schema';
import type { Field as FieldModel } from '@vtt/engine/model/types';
import { fieldOf, rowKeyOf } from '@vtt/engine/model/sheet-columns';

export function SheetTab() {
  const system = useWorld(s => s.system);
  const activeTag = useWorld(s => s.activeFieldTag);
  const activeColumn = useWorld(s => s.activeColumn);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);
  const activeBlock = useWorld(s => s.activeBlock);
  const activeRow = useWorld(s => s.activeRow);
  const rowOpen = Boolean(activeRow && system.tables?.[activeRow.table]?.rows?.some(r => rowKeyOf(r) === activeRow.row));
  const active = activeTag ? fieldOf(system, activeTag) ?? null : null;
  const blockOpen = Boolean(activeBlock && system.blocks?.some(b => b.name === activeBlock));
  const columnOpen = Boolean(activeColumn && system.tables?.[activeColumn.table]?.columns?.some(c => c.key === activeColumn.column));
  const docked = Boolean(active) || blockOpen || rowOpen || columnOpen;
  const tables = sheetTables(system);
  const right = useLookupPane({ head: 'Готовое из образцов', body: <DonorPalette kind="blocks" /> });
  const kindPicked = useWorld(s => s.activeSheetKind);
  const [view, setView] = useState<'sample' | 'kinds'>(kindPicked ? 'kinds' : 'sample');
  const usage = useUsage();

  const add = () => {
    const made = newColumn(system);
    editSystem(draft => addColumn(draft, made.value, 'sheet', blockOpen ? activeBlock! : undefined));
    pick({ activeFieldTag: made.key, activeBlock: null });
  };

  return (
    <Columns
      left={{
        head: 'Лист',
        tools: (
          <>
            <Button size="sm" onClick={add}>+ колонка</Button>
            {tables.length ? (
              <Select value="" options={[['', '+ таблица'], ...tables] as never} onChange={id => {
                if (!id) return;
                editSystem(draft => placeOnSheet(draft, id));
                pick({ activeFieldTag: null });
              }} />
            ) : null}
          </>
        ),
        ...(docked ? { pinned: true } : {}),
        body: active
          ? <Docked at={active.tag}><ViewPanel field={active} system={system} /></Docked>
          : rowOpen
            ? <Docked at={`строка|${activeRow!.table}|${activeRow!.row}`}><RowPanel table={activeRow!.table} row={activeRow!.row} system={system} /></Docked>
            : columnOpen
              ? <Docked at={`${activeColumn!.table}.${activeColumn!.column}`}><ColumnPanel table={activeColumn!.table} column={activeColumn!.column} system={system} /></Docked>
              : blockOpen
                ? <Docked at={`блок|${activeBlock}`}><BlockPanel name={activeBlock!} system={system} /></Docked>
                : <Empty title="Щёлкните поле на листе" />,
      }}
      main={{
        body: (
          <>
            <Segmented
              value={view}
              options={[{ key: 'sample', label: 'образец листа' }, { key: 'kinds', label: 'блоки и типы листов' }]}
              onChange={next => setView(next as 'sample' | 'kinds')}
            />
            {view === 'sample'
              ? <SheetSample system={system} picked={activeTag}
                  onPick={(tag, block) => pick({ activeFieldTag: tag, activeIn: block ?? null, activeGroupName: null, activeColumn: null, activeBlock: null, activeRow: null })}
                  onPickBlock={name => pick({ activeBlock: name, activeFieldTag: null, activeColumn: null, activeRow: null })}
                  onPickRow={(table, row) => pick({ activeRow: { table, row }, activeFieldTag: null, activeColumn: null, activeBlock: null })} />
              : <CharacterSection docked system={system} editSystem={editSystem} usage={usage} onTable={id => pick({ activeTab: 'dictionaries', activeTableId: id })} />}
          </>
        ),
      }}
      right={right}
    />
  );
}

function ViewPanel({ field, system }: { field: FieldModel; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const activeIn = useWorld(s => s.activeIn);
  const table = system.tables?.[field.home];
  const column = table?.columns?.find(c => c.key === (field.cell?.column ?? field.tag));
  if (!table || !column) return null;
  const homes = (field.placements ?? []).map(place => place.group);
  const block = activeIn && homes.includes(activeIn) ? activeIn : homes[0];
  const view = block ? (system.blocks ?? []).find(b => b.name === block)?.parts.find(p => p.table === field.home && (!p.columns || p.columns.includes(column.key)))?.views?.[column.key] : undefined;

  return (
    <>
      {block ? (
        <Card>
          <BlockViewField tableId={field.home} column={column} system={system} block={block} />
          {field.cell ? <BlockViewField tableId={field.home} column={column} system={system} block={block} row={field.cell.row} /> : null}
          {homes.length > 1 ? <span className="faint">Поле стоит и в других блоках: {homes.filter(h => h !== block).join(', ')} — там вид свой.</span> : null}
        </Card>
      ) : <span className="faint">Поле не стоит ни в одном блоке — вид задаётся в блоке.</span>}
      <TableColumnCard id={field.home} table={table} column={column} system={system}
        bounds={!(view && takesBounds(view.kind, column))}
        edit={change => editSystem(draft => { const target = draft.tables?.[field.home]; if (target) change(target); })}
        onClose={() => pick({ activeFieldTag: null })} />
      <div className="inline inline--tight">
        {field.cell ? (
          <>
            <Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeTableId: field.home })}>
              Правила: таблица «{table.label || field.home}» →
            </Button>
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { const target = draft.tables?.[field.home]; if (target) delete target.owner; });
              pick({ activeFieldTag: null });
            }}>Убрать таблицу с листа</DangerButton>
          </>
        ) : (
          <Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeFieldTag: field.tag })}>
            Правила: колонка «{field.label}» →
          </Button>
        )}
      </div>
    </>
  );
}

function ColumnPanel({ table: id, column: key, system }: { table: string; column: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const activeIn = useWorld(s => s.activeIn);
  const table = system.tables![id]!;
  const column = table.columns!.find(c => c.key === key)!;
  return (
    <>
      {activeIn ? <Card><BlockViewField tableId={id} column={column} system={system} block={activeIn} /></Card> : null}
      <TableColumnCard id={id} table={table} column={column} system={system}
        edit={change => editSystem(draft => { const target = draft.tables?.[id]; if (target) change(target); })}
        onClose={() => pick({ activeColumn: null })} />
    </>
  );
}

function Docked({ at, children }: { at: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }, [at]);
  return <div ref={ref} className="stack">{children}</div>;
}
