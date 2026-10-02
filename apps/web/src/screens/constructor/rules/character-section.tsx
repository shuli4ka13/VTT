import { SheetKindEditor } from '../records-tab.tsx';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { blockTree } from '../block-tree.tsx';
import type { BlockNode } from '../block-tree.tsx';
import { TableColumnCard } from './tables-section.tsx';
import { useWorld, freeId } from '../../../store/world.ts';
import { freeGroupName, renameGroup } from '../groups.ts';
import { sheetKinds } from '@vtt/engine/model/owned';
import { hasDesk } from '@vtt/engine/events/desk';
import { DESK_ID } from '@vtt/engine/engine/owners';
import { Card, CardHead, Button, Empty, LabelInput, DangerButton, Select } from '../../../ui/primitives.tsx';
import { newColumn } from '../factory.ts';
import type { UsageIndex } from '../usage.ts';
import { kindWord } from '@vtt/engine/words/kinds';
import type { System, Column } from '@vtt/schema';
import type { Field as FieldModel, Holder } from '@vtt/engine/model/types';
import type { WorldState } from '../../../store/world.ts';
import { fieldsOf, withColumn, rowKeyOf } from '@vtt/engine/model/sheet-columns';

export const isCharacterColumn = (field: FieldModel): boolean => !field.cell;

const kindOf = (field: FieldModel): string =>
  (field.value.kind === 'formula' ? 'формула' : kindWord(field.value.type));

export function addColumn(draft: System, column: Column, holder: Holder = 'sheet'): void {
  draft.tables = withColumn(draft, column, holder).tables;
}

interface TablePart { table: string; columns: string[]; rows: string[] }

function partsOf(fields: FieldModel[], system: System): { plain: FieldModel[]; tables: TablePart[] } {
  const plain: FieldModel[] = [];
  const tables: TablePart[] = [];
  for (const field of fields) {
    if (!field.cell) { plain.push(field); continue; }
    const { table, row, column } = field.cell;
    let part = tables.find(p => p.table === table);
    if (!part) { part = { table, columns: [], rows: [] }; tables.push(part); }
    if (!part.columns.includes(column)) part.columns.push(column);
    if (!part.rows.includes(row)) part.rows.push(row);
  }
  for (const part of tables) {
    const order = (system.tables?.[part.table]?.columns ?? []).map(c => c.key);
    part.columns.sort((x, y) => order.indexOf(x) - order.indexOf(y));
  }
  return { plain, tables };
}

function BlockName({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  return (
    <input
      className="block-name"
      value={shown}
      style={{ width: `${Math.max(6, shown.length + 4)}ch` }}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== null && draft.trim() && draft !== value) onCommit(draft.trim()); setDraft(null); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

type Picked = { table: string; column: string } | null;

export function CharacterSection({ system, editSystem }: {
  system: System;
  editSystem: WorldState['editSystem'];
  usage?: UsageIndex;
  onTable?: (id: string) => void;
}) {
  const picked = useWorld(s => s.activeFieldTag);
  const pick = useWorld(s => s.pick);
  const of = useWorld(s => s.activeSheetKind) ?? '';
  const setOf = (key: string) => pick({ activeSheetKind: key || null });
  const [cell, setCell] = useState<Picked>(null);
  const kinds = sheetKinds(system);
  const kind = of ? system.sheets?.[of] : undefined;
  const active = fieldsOf(system).filter(isCharacterColumn).find(f => f.tag === picked) ?? null;
  const tree = blockTree<FieldModel>(system, fieldsOf(system), field => field.group, true);
  const names: string[] = [];
  const collect = (nodes: BlockNode<FieldModel>[]) => { for (const node of nodes) { names.push(node.name); collect(node.children); } };
  collect(tree);

  const shown = (block: string) => !kind?.blocks || kind.blocks.includes(block);
  const toggle = (block: string) => editSystem(draft => {
    const target = draft.sheets?.[of];
    if (!target) return;
    const now = target.blocks ?? names;
    const next = now.includes(block) ? now.filter(b => b !== block) : [...now, block];
    if (names.every(name => next.includes(name))) delete target.blocks; else target.blocks = next;
  });
  const add = (group: string) => {
    const made = newColumn(system, group);
    editSystem(draft => addColumn(draft, made.value));
    setCell(null);
    pick({ activeFieldTag: made.key });
  };
  const addBlock = (parent?: string) => {
    const name = freeGroupName(system, 'Новый блок');
    const made = newColumn(system, name);
    editSystem(draft => {
      (draft.groups ??= {})[name] = parent ? { parent } : {};
      addColumn(draft, made.value);
    });
    setCell(null);
    pick({ activeFieldTag: made.key });
  };
  const addType = () => {
    const key = freeId([...Object.keys(system.sheets ?? {}), ...Object.keys(system.tables ?? {})], 'лист');
    editSystem(draft => { (draft.sheets ??= {})[key] = { label: 'Новый тип листа' }; });
    setOf(key);
  };
  const pickField = (tag: string) => { setCell(null); pick({ activeFieldTag: tag === picked ? null : tag }); };
  const pickCell = (next: Picked) => {
    pick({ activeFieldTag: null });
    setCell(cell && next && cell.table === next.table && cell.column === next.column ? null : next);
  };
  const open: Picked = cell ?? (active ? { table: active.home, column: active.tag } : null);
  const openTable = open ? system.tables?.[open.table] : undefined;
  const openColumn = open ? openTable?.columns?.find(c => c.key === open.column) : undefined;

  const inside = (node: BlockNode<FieldModel>): string[] => node.children.flatMap(child => [child.name, ...inside(child)]);
  const branch = (nodes: BlockNode<FieldModel>[], depth: number): ReactNode => nodes.map(node => {
    const { plain, tables } = partsOf(node.items, system);
    const on = shown(node.name);
    return (
      <div key={node.name} className={`stack stack--tight${depth ? ' list__nest' : ''}${on ? '' : ' faint'}`}>
        <div className="inline inline--tight block-head">
          {kind ? (
            <input type="checkbox" checked={on} title={on ? 'есть на этом листе' : 'нет на этом листе'} onChange={() => toggle(node.name)} />
          ) : null}
          <BlockName value={node.name} onCommit={next => editSystem(draft => renameGroup(draft, node.name, next))} />
          <span className="block-head__more">
            <Button size="sm" variant="ghost" title={`блок внутри «${node.name}»`} onClick={() => addBlock(node.name)}>+ блок внутрь</Button>
            <Select<string>
              value={system.groups?.[node.name]?.parent ?? ''}
              options={[['', 'на верхнем уровне'], ...names.filter(other => other !== node.name && !inside(node).includes(other)).map(other => [other, `внутри «${other}»`] as const)]}
              onChange={next => editSystem(draft => {
                const groups = (draft.groups ??= {});
                const own = (groups[node.name] ??= {});
                if (next) own.parent = next; else delete own.parent;
              })}
            />
            {!node.items.length && !node.children.length ? (
              <Button size="sm" variant="ghost" title="пустой блок — убрать" onClick={() => editSystem(draft => {
                delete draft.groups?.[node.name];
                for (const group of Object.values(draft.groups ?? {})) if (group.parent === node.name) delete group.parent;
              })}>×</Button>
            ) : null}
          </span>
        </div>
        {plain.length || tables.length ? (
          <div className="inline inline--tight">
            {plain.map(field => (
              <Button key={field.tag} size="sm" variant={field.tag === picked ? 'primary' : 'ghost'}
                title={kindOf(field)} onClick={() => pickField(field.tag)}>
                {field.label}{field.value.kind === 'formula' ? ' =' : ''}
              </Button>
            ))}
            {tables.map(part => {
              const table = system.tables?.[part.table];
              const all = (table?.rows ?? []).length;
              const rowName = (key: string) => {
                const row = (table?.rows ?? []).find(r => rowKeyOf(r) === key);
                return row?.label ?? String(row?.value ?? key);
              };
              return (
                <span key={part.table} className="inline inline--tight">
                  <span className="faint" title={part.rows.length < all ? part.rows.map(rowName).join(', ') : `все строки: ${all}`}>
                    ▦ {table?.label || part.table}{part.rows.length < all ? ` (${part.rows.map(rowName).join(', ')})` : ''}:
                  </span>
                  {part.columns.map(column => {
                    const spec = table?.columns?.find(c => c.key === column);
                    const on = cell?.table === part.table && cell.column === column;
                    return (
                      <Button key={column} size="sm" variant={on ? 'primary' : 'ghost'} onClick={() => pickCell({ table: part.table, column })}>
                        {spec?.label || column}{spec?.expr !== undefined ? ' =' : ''}
                      </Button>
                    );
                  })}
                </span>
              );
            })}
            <Button size="sm" variant="ghost" title={`колонка в блоке «${node.name}»`} onClick={() => add(node.name)}>+</Button>
          </div>
        ) : null}
        {branch(node.children, depth + 1)}
      </div>
    );
  });

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
      {open && openTable && openColumn ? (
        <TableColumnCard id={open.table} table={openTable} column={openColumn} system={system}
          edit={change => editSystem(draft => { const target = draft.tables?.[open.table]; if (target) change(target); })}
          onClose={() => { setCell(null); pick({ activeFieldTag: null }); }} />
      ) : null}
      {tree.length === 0 ? <Empty title="Лист пока пуст" /> : null}
      {branch(tree, 0)}
    </Card>
  );
}
