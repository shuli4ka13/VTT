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
import { useT, dataT } from '../../../i18n/author.ts';

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
  const t = useT('rolls');
  const td = dataT(system);
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
    focusNew(t('common:name.field'));
    const made = newColumn(system);
    editSystem(draft => addColumn(draft, made.value, 'sheet', block));
    setCell(null);
    pick({ activeFieldTag: made.key, activeBlock: null });
  };
  const addTable = (block: string) => {
    focusNew(t('common:name.table'));
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
    focusNew(t('common:name.block'));
    const { key, title: shown } = newGroup(system);
    editSystem(draft => {
      (draft.blocks ??= []).push({ key, ...(parent ? { parent } : {}), parts: [] });
      labelBlock(draft, key, shown);
    });
    pick({ activeBlock: key, activeFieldTag: null, activeColumn: null, activeRow: null });
  };
  const addType = () => {
    focusNew(t('common:name.sheetKind'));
    const key = freeId([...Object.keys(system.sheets ?? {}), ...Object.keys(system.tables ?? {})], 'list');
    editSystem(draft => { (draft.sheets ??= {})[key] = { label: td('rolls:new.sheetKind') }; });
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
          : <Button size="sm" variant="ghost" title={t('character.openTable')} onClick={() => showTable(part.table)}>{table?.label || t('character.newTable')}:</Button>}
        {columns.map(column => {
          const on = single ? picked === column.key : cell?.table === part.table && cell.column === column.key;
          return (
            <Button key={column.key} size="sm" variant={on ? 'primary' : 'ghost'}
              {...(column.expr !== undefined ? { title: t('character.byFormula') } : {})}
              onClick={() => (single ? pickField(column.key, blockName) : pickCell({ table: part.table, column: column.key }, blockName))}>
              {column.label || column.key}
            </Button>
          );
        })}
        {part.rows ? <span className="faint">{t('character.rowsCount', { n: part.rows.length })}</span> : null}
        {by ? <span className="faint">{t('character.groupBy', { name: by.label || by.key })}</span> : null}
        {!single && blockName !== undefined && index !== undefined ? (
          <DangerButton size="sm" title={t('character.dropPart')}
            onConfirm={() => dropPart(blockName, index, part.table)}>×</DangerButton>
        ) : null}
      </div>
    );
  };

  const drag = useDragList((from, to, after) => editSystem(draft => moveBlockTo(draft, from, to, after)));
  const fieldCount = (block: SheetBlock): number => fieldsOf(system).filter(f => (f.placements ?? []).some(place => place.group === block.key)).length;
  const sourceOf = (block: SheetBlock): string => block.parts
    .filter(part => system.tables?.[part.table]?.shape !== 'single')
    .map(part => `${system.tables?.[part.table]?.label || part.table}${part.by ? t('character.sourceBy', { name: system.tables?.[part.table]?.columns?.find(c => c.key === part.by)?.label ?? part.by }) : ''}`)
    .join(', ');
  const from = (block: SheetBlock): string => {
    if (!block.parts.length) return t('character.empty');
    const same = block.parts.length === 1 && !block.parts[0]!.by && (system.tables?.[block.parts[0]!.table]?.label || block.parts[0]!.table) === blockLabel(system, block.key);
    const source = sourceOf(block);
    return same || !source ? '' : t('character.from', { source });
  };
  const branch = (nodes: BlockNode[], depth: number): ReactNode => nodes.map(({ block, children }) => {
    const on = shown(block.key);
    const count = fieldCount(block);
    return (
      <details key={instanceOf('block', block.key)} className={`block-fold${depth ? ' block-fold--nested' : ''}${on ? '' : ' faint'}${drag.mark(block.key)}`} open={block.key === activeBlock || undefined}>
        <summary className="block-fold__head" {...drag.props(block.key)} title={t('character.dragTitle')}>
          <span className="drag-grip" aria-hidden>⋮⋮</span>
          {kind ? (
            <input type="checkbox" checked={on} title={on ? t('character.onSheet') : t('character.offSheet')}
              onClick={event => event.stopPropagation()} onChange={() => toggle(block.key)} />
          ) : null}
          <button type="button" className={`block-fold__name${block.key === activeBlock ? ' block-fold__name--on' : ''}`} title={t('character.blockSettings')}
            onClick={event => { event.preventDefault(); pickBlock(block.key); }}>{blockLabel(system, block.key)}</button>
          <span className="block-fold__count">{count}</span>
          <span className="block-fold__from">{from(block)}{children.length ? t('character.inside', { n: children.length }) : ''}</span>

        </summary>
        <div className="block-fold__body">
          {block.parts.map((part, index) => describe(part, block.key, index))}
          <div className="inline inline--tight">
            <Button size="sm" variant="ghost" title={t('character.addFieldTitle')} onClick={() => add(block.key)}>{t('character.addField')}</Button>
            <Button size="sm" variant="ghost" title={t('character.addTableTitle')} onClick={() => addTable(block.key)}>{t('character.addTable')}</Button>
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
      <CardHead title={t('character.title')} actions={<Button size="sm" onClick={() => addBlock()}>{t('character.addBlock')}</Button>} />
      <div className="inline inline--tight">
        <Button size="sm" variant={of ? 'ghost' : 'primary'} onClick={() => setOf('')}>{t('character.allBlocks')}</Button>
        {kinds.map(([key, k]) => (
          <Button key={key} size="sm" variant={of === key ? 'primary' : 'ghost'} onClick={() => setOf(key)}>{k.label ?? key}</Button>
        ))}
        <Button size="sm" variant="ghost" onClick={addType}>{t('character.addKind')}</Button>
        {hasDesk(system) && !system.sheets?.[DESK_ID] ? (
          <Button size="sm" variant="ghost" title={t('character.deskTitle')}
            onClick={() => editSystem(draft => { (draft.sheets ??= {})[DESK_ID] = { label: td('rolls:new.desk') }; })}>{t('character.addDesk')}</Button>
        ) : null}
      </div>
      {kind ? (
        <>
          <div className="inline inline--tight">
            <LabelInput key={of} value={kind.label ?? ''} placeholder={t('common:name.sheetKind')}
              onCommit={label => editSystem(draft => { const target = draft.sheets?.[of]; if (target) target.label = label; })} />
            <DangerButton size="sm" onConfirm={() => { editSystem(draft => { delete draft.sheets?.[of]; }); setOf(''); }}>{t('character.dropKind')}</DangerButton>
          </div>
          <SheetKindEditor id={of} kind={kind} system={system} />
        </>
      ) : null}
      {kind ? null : (
        <Card>
          <CardHead title={t('character.grantsTitle')} sub={t('character.grantsSub')} />
          <div data-field={t('character.grantsTitle')}>
            <GrantsEditor system={system} value={system.grants}
              onCreate={() => createEffect('passive', (draft, key) => { draft.grants = [...(draft.grants ?? []), key]; })}
              onChange={next => editSystem(draft => { if (next) draft.grants = next; else delete draft.grants; })} />
          </div>
        </Card>
      )}
      {!docked && open && openTable && openColumn ? (
        <TableColumnCard key={instanceOf('column', columnAddress(open.table, open.column, isSingle(openTable)))} id={open.table} table={openTable} column={openColumn} system={system}
          onOpenTable={() => showTable(open.table)}
          edit={change => editSystem(draft => { const target = draft.tables?.[open.table]; if (target) change(target); })}
          onClose={() => { setCell(null); pick({ activeFieldTag: null }); }} />
      ) : null}
      {tree.length === 0 && loose.length === 0 ? <Empty title={t('character.emptySheet')} /> : null}
      {branch(tree, 0)}
      {loose.length ? (
        <div className="stack stack--tight">
          <span className="faint">{NO_BLOCK}</span>
          <div className="inline inline--tight">
            {loose.map(item => (
              <span key={`${item.table}.${item.column}`} className="inline inline--tight">
                <Button size="sm" variant="ghost"
                  onClick={() => (item.single ? pickField(item.column) : pickCell({ table: item.table, column: item.column }))}>{item.label}</Button>
                <Select<string> label={t('character.toBlock', { label: item.label })} value="" options={[['', t('character.toBlockEmpty')], ...names.map(n => [n, blockLabel(system, n)] as const)]}
                  onChange={name => name && editSystem(draft => addColumnToBlock(draft, name, item.table, item.column))} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
