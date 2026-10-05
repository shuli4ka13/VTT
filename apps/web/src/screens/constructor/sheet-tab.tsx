import { useWorld } from '../../store/world.ts';
import { Columns } from '../../ui/layout.tsx';
import { useLookupPane } from './lookup-panel.tsx';
import { Select, Button, Empty, DangerButton, Field } from '../../ui/primitives.tsx';
import { ViewGallery } from './view-gallery.tsx';
import { familyOf, viewNeeds, VIEWS } from '../../sheet/views/index.tsx';
import { DonorPalette } from './donors.tsx';
import { newColumn } from './factory.ts';
import { addColumn, CharacterSection } from './rules/character-section.tsx';
import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useUsage } from './usage.ts';
import { Segmented } from '../../ui/primitives.tsx';
import { placeOnSheet, sheetTables } from './table-field.tsx';
import { TableColumnCard } from './rules/tables-section.tsx';
import { BlockPanel } from './block-panel.tsx';
import { SheetSample } from './sheet-sample.tsx';
import type { System } from '@vtt/schema';
import type { Field as FieldModel } from '@vtt/engine/model/types';
import { fieldOf, rowKeyOf, cellSource } from '@vtt/engine/model/sheet-columns';

export function SheetTab() {
  const system = useWorld(s => s.system);
  const activeTag = useWorld(s => s.activeFieldTag);
  const activeColumn = useWorld(s => s.activeColumn);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);
  const activeBlock = useWorld(s => s.activeBlock);
  const active = activeTag ? fieldOf(system, activeTag) ?? null : null;
  const blockOpen = Boolean(activeBlock && system.blocks?.some(b => b.name === activeBlock));
  const docked = Boolean(active) || blockOpen || Boolean(activeColumn && system.tables?.[activeColumn.table]?.columns?.some(c => c.key === activeColumn.column));
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
          : blockOpen && !(activeColumn && system.tables?.[activeColumn.table]?.columns?.some(c => c.key === activeColumn.column))
            ? <Docked at={`блок|${activeBlock}`}><BlockPanel name={activeBlock!} system={system} /></Docked>
            : docked
            ? <Docked at={`${activeColumn!.table}.${activeColumn!.column}`}><ColumnPanel table={activeColumn!.table} column={activeColumn!.column} system={system} /></Docked>
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
              ? <SheetSample system={system} picked={activeTag} onPick={tag => pick({ activeFieldTag: tag, activeGroupName: null, activeColumn: null, activeBlock: null })} />
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
  const table = system.tables?.[field.home];
  const column = table?.columns?.find(c => c.key === (field.cell?.column ?? field.tag));
  if (!table || !column) return null;

  return (
    <>
      <TableColumnCard id={field.home} table={table} column={column} system={system}
        edit={change => editSystem(draft => { const target = draft.tables?.[field.home]; if (target) change(target); })}
        onClose={() => pick({ activeFieldTag: null })} />
      {field.cell ? <RowView field={field} system={system} /> : null}
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

function RowView({ field, system }: { field: FieldModel; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const mark = field.cell!;
  const table = system.tables?.[mark.table];
  const column = table?.columns?.find(c => c.key === mark.column);
  const row = table?.rows?.find(r => rowKeyOf(r) === mark.row);
  if (!table || !column || !row) return null;
  const computed = cellSource(column, row).kind === 'formula';
  const own = row.view?.[mark.column]?.control?.kind;
  const inherited = column.control ? VIEWS[column.control.kind].label.toLowerCase() : computed ? 'просто число' : 'обычное поле';
  const lacking = own ? viewNeeds(own, column) : [];
  return (
    <Field label={`Вид только у «${field.label}»`}>
      <ViewGallery
        label={`Вид только у «${field.label}»`}
        value={own}
        family={familyOf(column.kind ?? (computed ? undefined : 'number'), column.many, computed)}
        computed={computed}
        plain={{ label: 'Как у колонки', hint: `колонка: ${inherited}` }}
        needs={next => viewNeeds(next, column)}
        onChange={next => editSystem(draft => {
          const target = draft.tables?.[mark.table]?.rows?.find(r => rowKeyOf(r) === mark.row);
          if (!target) return;
          const views = { ...target.view };
          const { control: _old, ...rest } = views[mark.column] ?? {};
          if (next && next !== column.control?.kind) views[mark.column] = { ...rest, control: { kind: next } };
          else if (Object.keys(rest).length) views[mark.column] = rest;
          else delete views[mark.column];
          if (Object.keys(views).length) target.view = views; else delete target.view;
        })}
      />
      {own ? (
        <span className="faint">
          Границы, шаг и подписи — общие, в колонке «{column.label || column.key}».{lacking.length ? ` Не хватает: ${lacking.join(', ')}.` : ''}
        </span>
      ) : null}
    </Field>
  );
}

function ColumnPanel({ table: id, column: key, system }: { table: string; column: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const table = system.tables![id]!;
  const column = table.columns!.find(c => c.key === key)!;
  return (
    <TableColumnCard id={id} table={table} column={column} system={system}
      edit={change => editSystem(draft => { const target = draft.tables?.[id]; if (target) change(target); })}
      onClose={() => pick({ activeColumn: null })} />
  );
}

function Docked({ at, children }: { at: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }, [at]);
  return <div ref={ref} className="stack">{children}</div>;
}
