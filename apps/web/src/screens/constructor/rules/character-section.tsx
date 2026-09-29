import { useState } from 'react';
import type { ReactNode } from 'react';
import { blockTree } from '../block-tree.tsx';
import type { BlockNode } from '../block-tree.tsx';
import { TableColumnCard } from './tables-section.tsx';
import { useWorld, useBook, freeId, slugOf } from '../../../store/world.ts';
import { freeGroupName, renameGroup } from '../groups.ts';
import { sheetKinds } from '@vtt/engine/model/owned';
import { LiveValue } from '../live-value.tsx';
import { Card, CardHead, Button, Field, Select, Chip, Empty, LabelInput, DangerButton } from '../../../ui/primitives.tsx';
import { ColumnCard } from './column-card.tsx';
import type { ColumnPatch } from './column-card.tsx';
import { newField } from '../factory.ts';
import { usersOf } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import { kindsFor, kindWord } from '@vtt/engine/words/kinds';
import { choiceTables } from '@vtt/engine/model/tables';
import type { Field as FieldModel, System, ValueKind } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

const FIELD_KINDS = kindsFor('field');

const ZERO = { number: 0, text: '', boolean: false, choice: '' } as const;

type Stored = 'number' | 'text' | 'boolean' | 'choice';

export const isCharacterColumn = (field: FieldModel): boolean => !field.cell;

const kindOf = (field: FieldModel): string =>
  (field.value.kind === 'formula' ? 'формула' : kindWord(field.value.type));

function applyField(system: System, field: FieldModel, patch: ColumnPatch): void {
  if (patch.label !== undefined) field.label = patch.label;
  if (patch.expr !== undefined) {
    field.value = patch.expr !== null
      ? { kind: 'formula', expr: patch.expr }
      : { kind: 'stored', type: 'number', default: 0 };
    return;
  }
  if (field.value.kind !== 'stored') {
    if (patch.kind === undefined) return;
    field.value = { kind: 'stored', type: 'number', default: 0 };
  }
  const value = field.value;
  if (patch.kind !== undefined) {
    const type = (['number', 'text', 'boolean', 'choice'].includes(patch.kind) ? patch.kind : 'text') as Stored;
    const from = type === 'choice' ? choiceTables(system)[0]?.[0] : undefined;
    if (type === 'choice' && !from) return;
    field.value = { kind: 'stored', type, default: ZERO[type], ...(from ? { from } : {}) };
    return;
  }
  if (patch.from !== undefined && patch.from) field.value = { kind: 'stored', type: 'choice', from: patch.from, default: '' };
  if (patch.min !== undefined) { if (patch.min !== null) value.min = patch.min; else delete value.min; }
  if (patch.max !== undefined) { if (patch.max !== null) value.max = patch.max; else delete value.max; }
}

function FieldColumnCard({ field, system, usage, onClose }: {
  field: FieldModel;
  system: System;
  usage: UsageIndex;
  onClose: () => void;
}) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const compendium = useBook();
  const users = usersOf(usage, 'field', field.tag, system);
  const rename = (label: string) => {
    const state = useWorld.getState();
    const world = JSON.stringify({ s: state.system, c: state.compendium, sh: state.sheets });
    const virgin = (/^field(_\d+)?$/.test(field.tag) || field.tag === slugOf(field.label))
      && world.split(`"${field.tag}"`).length - 1 <= 1
      && !new RegExp(`[@#]${field.tag}(?![\\p{L}\\p{N}_])`, 'u').test(world);
    const fresh = virgin && slugOf(label) ? freeId(state.system.fields.filter(f => f.tag !== field.tag).map(f => f.tag), label) : field.tag;
    editSystem(draft => {
      const target = draft.fields.find(f => f.tag === field.tag);
      if (target) { target.label = label; target.tag = fresh; }
    });
    if (fresh !== field.tag) pick({ activeFieldTag: fresh });
  };
  const edit = (change: (draft: FieldModel) => void) => editSystem(draft => {
    const target = draft.fields.find(f => f.tag === field.tag);
    if (target) change(target);
  });
  const value = field.value;

  return (
    <ColumnCard
      column={{
        label: field.label,
        kind: (value.kind === 'stored' ? value.type : 'number') as ValueKind,
        ...(value.kind === 'stored' && value.from ? { from: value.from } : {}),
        ...(value.kind === 'formula' ? { expr: value.expr } : {}),
        ...(value.kind === 'stored' && value.min !== undefined ? { min: value.min } : {}),
        ...(value.kind === 'stored' && value.max !== undefined ? { max: value.max } : {}),
      }}
      kinds={FIELD_KINDS}
      tables={choiceTables(system).map(([key, t]) => [key, t.label || key])}
      formulaHint="Формула для всех персонажей"
      where={`Персонаж · ${field.label}`}
      system={system}
      onChange={patch => (patch.label !== undefined ? rename(patch.label) : edit(draft => applyField(system, draft, patch)))}
      onDelete={users.length ? null : () => {
        editSystem(draft => { draft.fields = draft.fields.filter(f => f.tag !== field.tag); });
        onClose();
      }}
      onClose={onClose}
      preview={value.kind === 'formula' ? <LiveValue system={system} compendium={compendium} tag={field.tag} source={value.expr} /> : null}
      extra={<>
        <Field label="Чьё значение">
          <Select
            value={field.lives ?? 'sheet'}
            options={[['sheet', 'своё у каждого листа'], ['group', 'общее у группы — отряда, банды'], ['desk', 'общее на столе — одно на комнату']] as const}
            onChange={next => edit(draft => { if (next === 'sheet') delete draft.lives; else draft.lives = next; })}
          />
        </Field>
        {users.length ? (
          <div className="inline inline--tight">
            <span className="faint">смотрят:</span>
            {users.map(user => <Chip key={user}>{user}</Chip>)}
          </div>
        ) : null}
      </>}
    />
  );
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

export function CharacterSection({ system, editSystem, usage }: {
  system: System;
  editSystem: WorldState['editSystem'];
  usage: UsageIndex;
  onTable?: (id: string) => void;
}) {
  const picked = useWorld(s => s.activeFieldTag);
  const pick = useWorld(s => s.pick);
  const [of, setOf] = useState('');
  const [cell, setCell] = useState<Picked>(null);
  const kinds = sheetKinds(system);
  const kind = of ? system.records?.[of] : undefined;
  const active = system.fields.filter(isCharacterColumn).find(f => f.tag === picked) ?? null;
  const tree = blockTree<FieldModel>(system, system.fields, field => field.group);
  const names: string[] = [];
  const collect = (nodes: BlockNode<FieldModel>[]) => { for (const node of nodes) { names.push(node.name); collect(node.children); } };
  collect(tree);

  const shown = (block: string) => !kind?.blocks || kind.blocks.includes(block);
  const toggle = (block: string) => editSystem(draft => {
    const target = draft.records?.[of];
    if (!target) return;
    const now = target.blocks ?? names;
    const next = now.includes(block) ? now.filter(b => b !== block) : [...now, block];
    if (names.every(name => next.includes(name))) delete target.blocks; else target.blocks = next;
  });
  const add = (group: string) => {
    const made = newField(system, group);
    editSystem(draft => { draft.fields.push(made.value); });
    setCell(null);
    pick({ activeFieldTag: made.key });
  };
  const addBlock = (parent?: string) => {
    const name = freeGroupName(system, 'Новый блок');
    const made = newField(system, name);
    editSystem(draft => {
      draft.fields.push(made.value);
      if (parent) (draft.groups ??= {})[name] = { parent };
    });
    setCell(null);
    pick({ activeFieldTag: made.key });
  };
  const addType = () => {
    const key = freeId(Object.keys(system.records ?? {}), 'лист');
    editSystem(draft => { (draft.records ??= {})[key] = { kind: 'sheet', label: 'Новый тип листа' }; });
    setOf(key);
  };
  const pickField = (tag: string) => { setCell(null); pick({ activeFieldTag: tag === picked ? null : tag }); };
  const pickCell = (next: Picked) => {
    pick({ activeFieldTag: null });
    setCell(cell && next && cell.table === next.table && cell.column === next.column ? null : next);
  };
  const cellTable = cell ? system.tables?.[cell.table] : undefined;
  const cellColumn = cell ? cellTable?.columns?.find(c => c.key === cell.column) : undefined;

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
          <span className="block-head__more"><Button size="sm" variant="ghost" title={`блок внутри «${node.name}»`} onClick={() => addBlock(node.name)}>+ блок внутрь</Button></span>
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
                const row = (table?.rows ?? []).find(r => String(r.key ?? r.value) === key);
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
      </div>
      {kind ? (
        <div className="inline inline--tight">
          <LabelInput value={kind.label ?? ''} placeholder="как зовётся тип листа"
            onCommit={label => editSystem(draft => { const target = draft.records?.[of]; if (target) target.label = label; })} />
          <DangerButton size="sm" onConfirm={() => { editSystem(draft => { delete draft.records?.[of]; }); setOf(''); }}>Удалить тип</DangerButton>
        </div>
      ) : null}
      {active ? <FieldColumnCard field={active} system={system} usage={usage} onClose={() => pick({ activeFieldTag: null })} /> : null}
      {cell && cellTable && cellColumn ? (
        <TableColumnCard id={cell.table} table={cellTable} column={cellColumn} system={system}
          edit={change => editSystem(draft => { const target = draft.tables?.[cell.table]; if (target) change(target); })}
          onClose={() => setCell(null)} />
      ) : null}
      {tree.length === 0 ? <Empty title="Лист пока пуст" /> : null}
      {branch(tree, 0)}
    </Card>
  );
}
