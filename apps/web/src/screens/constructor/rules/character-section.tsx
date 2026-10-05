import { SheetKindEditor } from '../records-tab.tsx';
import type { ReactNode } from 'react';
import { TableColumnCard } from './tables-section.tsx';
import { useWorld, freeId } from '../../../store/world.ts';
import { sheetKinds } from '@vtt/engine/model/owned';
import { hasDesk } from '@vtt/engine/events/desk';
import { DESK_ID } from '@vtt/engine/engine/owners';
import { Card, CardHead, Button, Empty, LabelInput, DangerButton, Select } from '../../../ui/primitives.tsx';
import { newColumn } from '../factory.ts';
import { freeBlockName, addColumnToBlock, SHEET_TABLE } from '../block-panel.tsx';
import type { UsageIndex } from '../usage.ts';
import type { System, Column, SheetBlock, SheetPart } from '@vtt/schema';
import type { Field as FieldModel, Holder } from '@vtt/engine/model/types';
import type { WorldState } from '../../../store/world.ts';
import { fieldsOf, withColumn, singleTableOf } from '@vtt/engine/model/sheet-columns';

export const isCharacterColumn = (field: FieldModel): boolean => !field.cell;

export function addColumn(draft: System, column: Column, holder: Holder = 'sheet', block?: string): void {
  draft.tables = withColumn(draft, column, holder).tables;
  if (block) addColumnToBlock(draft, block, singleTableOf(draft, holder) ?? SHEET_TABLE, column.key);
}

interface BlockNode { block: SheetBlock; children: BlockNode[] }

function treeOf(blocks: SheetBlock[]): BlockNode[] {
  const names = new Set(blocks.map(b => b.name));
  const make = (block: SheetBlock, seen: string[]): BlockNode => ({
    block,
    children: blocks.filter(b => b.parent === block.name && !seen.includes(b.name)).map(b => make(b, [...seen, b.name])),
  });
  return blocks.filter(b => !b.parent || !names.has(b.parent) || b.parent === b.name).map(b => make(b, [b.name]));
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
  const setCell = (next: Picked) => pick({ activeColumn: next });
  const kinds = sheetKinds(system);
  const kind = of ? system.sheets?.[of] : undefined;
  const blocks = system.blocks ?? [];
  const names = blocks.map(b => b.name);
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
    const made = newColumn(system);
    editSystem(draft => addColumn(draft, made.value, 'sheet', block));
    setCell(null);
    pick({ activeFieldTag: made.key, activeBlock: null });
  };
  const addBlock = (parent?: string) => {
    const name = freeBlockName(system, 'Новый блок');
    editSystem(draft => { (draft.blocks ??= []).push({ name, ...(parent ? { parent } : {}), parts: [] }); });
    pick({ activeBlock: name, activeFieldTag: null, activeColumn: null });
  };
  const addType = () => {
    const key = freeId([...Object.keys(system.sheets ?? {}), ...Object.keys(system.tables ?? {})], 'лист');
    editSystem(draft => { (draft.sheets ??= {})[key] = { label: 'Новый тип листа' }; });
    setOf(key);
  };
  const pickField = (tag: string) => { pick({ activeColumn: null, activeBlock: null, activeFieldTag: tag === picked ? null : tag }); };
  const pickCell = (next: Picked) => {
    pick({ activeFieldTag: null, activeBlock: null });
    setCell(cell && next && cell.table === next.table && cell.column === next.column ? null : next);
  };
  const pickBlock = (name: string) => pick({ activeBlock: name === activeBlock ? null : name, activeFieldTag: null, activeColumn: null });
  const open: Picked = cell ?? (active ? { table: active.home, column: active.tag } : null);
  const openTable = open ? system.tables?.[open.table] : undefined;
  const openColumn = open ? openTable?.columns?.find(c => c.key === open.column) : undefined;

  const describe = (part: SheetPart): ReactNode => {
    const table = system.tables?.[part.table];
    const single = table?.shape === 'single';
    const placed = new Set(fieldsOf(system).filter(f => f.home === part.table).map(f => f.cell?.column ?? f.tag));
    const columns = (table?.columns ?? []).filter(c => (!part.columns || part.columns.includes(c.key)) && placed.has(c.key));
    const by = part.by ? table?.columns?.find(c => c.key === part.by) : undefined;
    return (
      <div key={`${part.table}|${part.by ?? ''}|${(part.columns ?? []).join(',')}`} className="inline inline--tight">
        <span className="faint">{table?.label || part.table}:</span>
        {columns.map(column => {
          const on = single ? picked === column.key : cell?.table === part.table && cell.column === column.key;
          return (
            <Button key={column.key} size="sm" variant={on ? 'primary' : 'ghost'}
              onClick={() => (single ? pickField(column.key) : pickCell({ table: part.table, column: column.key }))}>
              {column.label || column.key}{column.expr !== undefined ? ' =' : ''}
            </Button>
          );
        })}
        {part.rows ? <span className="faint">· строки: {part.rows.length}</span> : null}
        {by ? <span className="faint">· группировать по «{by.label || by.key}»</span> : null}
      </div>
    );
  };

  const branch = (nodes: BlockNode[], depth: number): ReactNode => nodes.map(({ block, children }) => {
    const on = shown(block.name);
    return (
      <div key={block.name} className={`stack stack--tight${depth ? ' list__nest' : ''}${on ? '' : ' faint'}`}>
        <div className="inline inline--tight block-head">
          {kind ? (
            <input type="checkbox" checked={on} title={on ? 'есть на этом листе' : 'нет на этом листе'} onChange={() => toggle(block.name)} />
          ) : null}
          <Button size="sm" variant={block.name === activeBlock ? 'primary' : 'ghost'} title="настройки блока" onClick={() => pickBlock(block.name)}>{block.name}</Button>
          <span className="block-head__more">
            <Button size="sm" variant="ghost" title={`колонка в блоке «${block.name}»`} onClick={() => add(block.name)}>+</Button>
            <Button size="sm" variant="ghost" title={`блок внутри «${block.name}»`} onClick={() => addBlock(block.name)}>+ блок внутрь</Button>
          </span>
        </div>
        {block.parts.map(describe)}
        {branch(children, depth + 1)}
      </div>
    );
  });

  const placed = new Set(fieldsOf(system).filter(f => f.group).map(f => `${f.home}.${f.cell?.column ?? f.tag}`));
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
            <LabelInput value={kind.label ?? ''} placeholder="как зовётся тип листа"
              onCommit={label => editSystem(draft => { const target = draft.sheets?.[of]; if (target) target.label = label; })} />
            <DangerButton size="sm" onConfirm={() => { editSystem(draft => { delete draft.sheets?.[of]; }); setOf(''); }}>Удалить тип</DangerButton>
          </div>
          <SheetKindEditor id={of} kind={kind} system={system} />
        </>
      ) : null}
      {!docked && open && openTable && openColumn ? (
        <TableColumnCard id={open.table} table={openTable} column={openColumn} system={system}
          edit={change => editSystem(draft => { const target = draft.tables?.[open.table]; if (target) change(target); })}
          onClose={() => { setCell(null); pick({ activeFieldTag: null }); }} />
      ) : null}
      {tree.length === 0 && loose.length === 0 ? <Empty title="Лист пока пуст" /> : null}
      {branch(tree, 0)}
      {loose.length ? (
        <div className="stack stack--tight">
          <span className="faint">Без блока</span>
          <div className="inline inline--tight">
            {loose.map(item => (
              <span key={`${item.table}.${item.column}`} className="inline inline--tight">
                <Button size="sm" variant="ghost"
                  onClick={() => (item.single ? pickField(item.column) : pickCell({ table: item.table, column: item.column }))}>{item.label}</Button>
                <Select<string> label={`«${item.label}»: в блок`} value="" options={[['', 'в блок…'], ...names.map(n => [n, n] as const)]}
                  onChange={name => name && editSystem(draft => addColumnToBlock(draft, name, item.table, item.column))} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
