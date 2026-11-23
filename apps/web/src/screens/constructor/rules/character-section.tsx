import { SheetKindEditor } from '../records-tab.tsx';
import { newGroup } from '../groups.ts';
import { NO_BLOCK, blockLabel, labelBlock, sheetKinds, hasDesk, DESK_ID, fieldsOf, withColumn, singleTableOf, isSingle } from '@vtt/engine';
import type { Field as FieldModel, Holder } from '@vtt/engine';
import type { ReactNode } from 'react';
import { TableColumnCard } from './tables-section.tsx';
import { useWorld, freeId } from '../../../store/world.ts';
import { Card, CardHead, Button, Empty, LabelInput, DangerButton, Select } from '../../../ui/primitives.tsx';
import { GrantsEditor } from '../grants-editor.tsx';
import { createEffect } from '../effects/factory.ts';
import { newColumn, newTable } from '../factory.ts';
import { readyForSheet } from '../table-field.tsx';
import { addColumnToBlock, moveBlockTo, SHEET_TABLE } from '../block-panel.tsx';
import { useDragList } from '../../../ui/drag-list.ts';
import type { UsageIndex } from '../usage.ts';
import type { System, Column, SheetBlock, SheetPart } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';
import { focusNew } from '../../../ui/focus-new.ts';
import { instanceOf, columnAddress } from '../instance.ts';

export const isCharacterColumn = (field: FieldModel): boolean => !field.cell;

export function addColumn(draft: System, column: Column, holder: Holder = 'sheet', block?: string): void {
  draft.tables = withColumn(draft, column, holder).tables;
  if (block) addColumnToBlock(draft, block, singleTableOf(draft, holder) ?? SHEET_TABLE, column.key);
}

interface BlockNode { block: SheetBlock; children: BlockNode[] }

function treeOf(blocks: SheetBlock[]): BlockNode[] {
  const names = new Set(blocks.map(b => b.key));
  const make = (block: SheetBlock, seen: string[]): BlockNode => ({
    block,
    children: blocks.filter(b => b.parent === block.key && !seen.includes(b.key)).map(b => make(b, [...seen, b.key])),
  });
  return blocks.filter(b => !b.parent || !names.has(b.parent) || b.parent === b.key).map(b => make(b, [b.key]));
}

type Picked = { table: string; column: string } | null;

export function CharacterSection({ system, editSystem, docked }: {
  docked?: boolean;
  system: System;
  editSystem: WorldState['editSystem'];
  usage?: UsageIndex;
  onTable?: (id: string) => void;
}) {
  const picked = useWorld(s => s.activeFieldTag);
  const pick = useWorld(s => s.pick);
  const activeBlock = useWorld(s => s.activeBlock);
  const of = useWorld(s => s.activeSheetKind) ?? '';
  const setOf = (key: string) => pick({ activeSheetKind: key || null });
  const cell = useWorld(s => s.activeColumn) as Picked;
  const setCell = (next: Picked) => pick({ activeColumn: next, activeRow: null });
  const kinds = sheetKinds(system);
  const kind = of ? system.sheets?.[of] : undefined;
  const blocks = system.blocks ?? [];
  const names = blocks.map(b => b.key);
  const tree = treeOf(blocks);
  const active = fieldsOf(system).filter(isCharacterColumn).find(f => f.tag === picked) ?? null;

  const shown = (block: string) => !kind?.blocks || kind.blocks.includes(block);
  const toggle = (block: string) => editSystem(draft => {
    const target = draft.sheets?.[of];
    if (!target) return;
    const now = target.blocks ?? names;
    const next = now.includes(block) ? now.filter(b => b !== block) : [...now, block];
    if (names.every(name => next.includes(name))) delete target.blocks; else target.blocks = next;
  });
  const add = (block?: string) => {
    focusNew('как зовётся поле');
    const made = newColumn(system);
    editSystem(draft => addColumn(draft, made.value, 'sheet', block));
    setCell(null);
    pick({ activeFieldTag: made.key, activeBlock: null });
  };
  const addTable = (block: string) => {
    focusNew('как зовётся таблица');
    const made = newTable(system);
    editSystem(draft => {
      (draft.tables ??= {})[made.key] = made.value;
      readyForSheet(draft, made.key);
      (draft.blocks ?? []).find(b => b.key === block)?.parts.push({ table: made.key });
    });
    pick({ activeSheetTable: made.key, activeFieldTag: null, activeColumn: null, activeBlock: null, activeRow: null });
  };
  const showTable = (table: string) => pick({ activeSheetTable: table, activeFieldTag: null, activeColumn: null, activeBlock: null, activeRow: null });
  const addBlock = (parent?: string) => {
    focusNew('как зовётся блок');
    const { key, title: shown } = newGroup(system);
    editSystem(draft => {
      (draft.blocks ??= []).push({ key, ...(parent ? { parent } : {}), parts: [] });
      labelBlock(draft, key, shown);
    });
    pick({ activeBlock: key, activeFieldTag: null, activeColumn: null, activeRow: null });
  };
  const addType = () => {
    focusNew('как зовётся тип листа');
    const key = freeId([...Object.keys(system.sheets ?? {}), ...Object.keys(system.tables ?? {})], 'лист');
    editSystem(draft => { (draft.sheets ??= {})[key] = { label: 'Новый тип листа' }; });
    setOf(key);
  };
  const pickField = (tag: string, block?: string) => { pick({ activeColumn: null, activeBlock: null, activeRow: null, activeSheetTable: null, activeIn: block ?? null, activeFieldTag: tag === picked ? null : tag }); };
  const pickCell = (next: Picked, block?: string) => {
    pick({ activeFieldTag: null, activeBlock: null, activeRow: null, activeSheetTable: null, activeIn: block ?? null });
    setCell(cell && next && cell.table === next.table && cell.column === next.column ? null : next);
  };
  const pickBlock = (name: string) => pick({ activeBlock: name === activeBlock ? null : name, activeFieldTag: null, activeColumn: null, activeRow: null, activeSheetTable: null });
  const open: Picked = cell ?? (active ? { table: active.home, column: active.tag } : null);
  const openTable = open ? system.tables?.[open.table] : undefined;
  const openColumn = open ? openTable?.columns?.find(c => c.key === open.column) : undefined;

  const dropPart = (blockName: string, index: number, table: string) => editSystem(draft => {
    const target = (draft.blocks ?? []).find(b => b.key === blockName);
    if (target?.parts[index]?.table === table) target.parts.splice(index, 1);
  });

  const describe = (part: SheetPart, blockName?: string, index?: number): ReactNode => {
    const table = system.tables?.[part.table];
    const single = table?.shape === 'single';
    const placed = new Set(fieldsOf(system).filter(f => f.home === part.table).map(f => f.cell?.column ?? f.tag));
    const columns = (table?.columns ?? []).filter(c => (!part.columns || part.columns.includes(c.key)) && placed.has(c.key));
    const by = part.by ? table?.columns?.find(c => c.key === part.by) : undefined;
    return (
      <div key={`${part.table}|${part.by ?? ''}|${(part.columns ?? []).join(',')}`} className="inline inline--tight">
        {single
          ? null
          : <Button size="sm" variant="ghost" title="открыть таблицу" onClick={() => showTable(part.table)}>{table?.label || 'новая таблица'}:</Button>}
        {columns.map(column => {
          const on = single ? picked === column.key : cell?.table === part.table && cell.column === column.key;
          return (
            <Button key={column.key} size="sm" variant={on ? 'primary' : 'ghost'}
              {...(column.expr !== undefined ? { title: 'считается формулой' } : {})}
              onClick={() => (single ? pickField(column.key, blockName) : pickCell({ table: part.table, column: column.key }, blockName))}>
              {column.label || column.key}
            </Button>
          );
        })}
        {part.rows ? <span className="faint">· строки: {part.rows.length}</span> : null}
        {by ? <span className="faint">· группировать по «{by.label || by.key}»</span> : null}
        {!single && blockName !== undefined && index !== undefined ? (
          <DangerButton size="sm" title="убрать таблицу из блока — сама таблица останется в «Таблицах»"
            onConfirm={() => dropPart(blockName, index, part.table)}>×</DangerButton>
        ) : null}
      </div>
    );
  };

  const drag = useDragList((from, to, after) => editSystem(draft => moveBlockTo(draft, from, to, after)));
  const fieldCount = (block: SheetBlock): number => fieldsOf(system).filter(f => (f.placements ?? []).some(place => place.group === block.key)).length;
  const sourceOf = (block: SheetBlock): string => block.parts
    .filter(part => system.tables?.[part.table]?.shape !== 'single')
    .map(part => `${system.tables?.[part.table]?.label || part.table}${part.by ? ` · по «${system.tables?.[part.table]?.columns?.find(c => c.key === part.by)?.label ?? part.by}»` : ''}`)
    .join(', ');
  const from = (block: SheetBlock): string => {
    if (!block.parts.length) return 'пока пусто';
    const same = block.parts.length === 1 && !block.parts[0]!.by && (system.tables?.[block.parts[0]!.table]?.label || block.parts[0]!.table) === blockLabel(system, block.key);
    const source = sourceOf(block);
    return same || !source ? '' : `из: ${source}`;
  };
  const branch = (nodes: BlockNode[], depth: number): ReactNode => nodes.map(({ block, children }) => {
    const on = shown(block.key);
    const count = fieldCount(block);
    return (
      <details key={instanceOf('блок', block.key)} className={`block-fold${depth ? ' block-fold--nested' : ''}${on ? '' : ' faint'}${drag.mark(block.key)}`} open={block.key === activeBlock || undefined}>
        <summary className="block-fold__head" {...drag.props(block.key)} title="перетащите выше или ниже — так блок встанет на листе">
          <span className="drag-grip" aria-hidden>⋮⋮</span>
          {kind ? (
            <input type="checkbox" checked={on} title={on ? 'есть на этом листе' : 'нет на этом листе'}
              onClick={event => event.stopPropagation()} onChange={() => toggle(block.key)} />
          ) : null}
          <button type="button" className={`block-fold__name${block.key === activeBlock ? ' block-fold__name--on' : ''}`} title="настройки блока"
            onClick={event => { event.preventDefault(); pickBlock(block.key); }}>{blockLabel(system, block.key)}</button>
          <span className="block-fold__count">{count}</span>
          <span className="block-fold__from">{from(block)}{children.length ? ` · внутри блоков: ${children.length}` : ''}</span>

        </summary>
        <div className="block-fold__body">
          {block.parts.map((part, index) => describe(part, block.key, index))}
          <div className="inline inline--tight">
            <Button size="sm" variant="ghost" title="одно значение: хиты, уровень, имя" onClick={() => add(block.key)}>+ поле</Button>
            <Button size="sm" variant="ghost" title="строки и колонки: характеристики, навыки" onClick={() => addTable(block.key)}>+ таблица</Button>
          </div>
          {branch(children, depth + 1)}
        </div>
      </details>
    );
  });

  const placed = new Set(fieldsOf(system).filter(f => f.placements?.length).map(f => `${f.home}.${f.cell?.column ?? f.tag}`));
  const loose: { table: string; column: string; label: string; single: boolean }[] = [];
  for (const field of fieldsOf(system)) {
    const column = field.cell?.column ?? field.tag;
    const id = `${field.home}.${column}`;
    if (placed.has(id) || loose.some(l => `${l.table}.${l.column}` === id)) continue;
    const spec = system.tables?.[field.home]?.columns?.find(c => c.key === column);
    loose.push({ table: field.home, column, label: spec?.label || field.label, single: !field.cell });
  }

  return (
    <Card>
      <CardHead title="Листы" actions={<Button size="sm" onClick={() => addBlock()}>+ блок</Button>} />
      <div className="inline inline--tight">
        <Button size="sm" variant={of ? 'ghost' : 'primary'} onClick={() => setOf('')}>все блоки</Button>
        {kinds.map(([key, k]) => (
          <Button key={key} size="sm" variant={of === key ? 'primary' : 'ghost'} onClick={() => setOf(key)}>{k.label ?? key}</Button>
        ))}
        <Button size="sm" variant="ghost" onClick={addType}>+ тип листа</Button>
        {hasDesk(system) && !system.sheets?.[DESK_ID] ? (
          <Button size="sm" variant="ghost" title="Что выдано столу: правила, которые срабатывают раз на всю комнату — например, раз за раунд"
            onClick={() => editSystem(draft => { (draft.sheets ??= {})[DESK_ID] = { label: 'Стол' }; })}>+ тип стола</Button>
        ) : null}
      </div>
      {kind ? (
        <>
          <div className="inline inline--tight">
            <LabelInput key={of} value={kind.label ?? ''} placeholder="как зовётся тип листа"
              onCommit={label => editSystem(draft => { const target = draft.sheets?.[of]; if (target) target.label = label; })} />
            <DangerButton size="sm" onConfirm={() => { editSystem(draft => { delete draft.sheets?.[of]; }); setOf(''); }}>Удалить тип</DangerButton>
          </div>
          <SheetKindEditor id={of} kind={kind} system={system} />
        </>
      ) : null}
      {kind ? null : (
        <Card>
          <CardHead title="Что даёт всем листам" sub="Действует на любой лист, какого бы типа он ни был, и на лист без типа" />
          <div data-field="Что даёт всем листам">
            <GrantsEditor system={system} value={system.grants}
              onCreate={() => createEffect('passive', (draft, key) => { draft.grants = [...(draft.grants ?? []), key]; })}
              onChange={next => editSystem(draft => { if (next) draft.grants = next; else delete draft.grants; })} />
          </div>
        </Card>
      )}
      {!docked && open && openTable && openColumn ? (
        <TableColumnCard key={instanceOf('колонка', columnAddress(open.table, open.column, isSingle(openTable)))} id={open.table} table={openTable} column={openColumn} system={system}
          onOpenTable={() => showTable(open.table)}
          edit={change => editSystem(draft => { const target = draft.tables?.[open.table]; if (target) change(target); })}
          onClose={() => { setCell(null); pick({ activeFieldTag: null }); }} />
      ) : null}
      {tree.length === 0 && loose.length === 0 ? <Empty title="Лист пока пуст" /> : null}
      {branch(tree, 0)}
      {loose.length ? (
        <div className="stack stack--tight">
          <span className="faint">{NO_BLOCK}</span>
          <div className="inline inline--tight">
            {loose.map(item => (
              <span key={`${item.table}.${item.column}`} className="inline inline--tight">
                <Button size="sm" variant="ghost"
                  onClick={() => (item.single ? pickField(item.column) : pickCell({ table: item.table, column: item.column }))}>{item.label}</Button>
                <Select<string> label={`«${item.label}»: в блок`} value="" options={[['', 'в блок…'], ...names.map(n => [n, blockLabel(system, n)] as const)]}
                  onChange={name => name && editSystem(draft => addColumnToBlock(draft, name, item.table, item.column))} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
