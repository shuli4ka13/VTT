import { useState } from 'react';
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
import { NO_BLOCK } from '@vtt/engine/model/blocks';
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

export function CharacterSection({ system, editSystem, usage, onTable }: {
  system: System;
  editSystem: WorldState['editSystem'];
  usage: UsageIndex;
  onTable: (id: string) => void;
}) {
  const picked = useWorld(s => s.activeFieldTag);
  const pick = useWorld(s => s.pick);
  const [of, setOf] = useState('');
  const kinds = sheetKinds(system);
  const kind = of ? system.records?.[of] : undefined;
  const columns = system.fields.filter(isCharacterColumn);
  const active = columns.find(f => f.tag === picked) ?? null;

  const blocks = new Map<string, { fields: FieldModel[]; tables: string[] }>();
  for (const field of system.fields) {
    const name = field.group ?? NO_BLOCK;
    const entry = blocks.get(name) ?? { fields: [], tables: [] };
    if (!field.cell) entry.fields.push(field);
    else if (!entry.tables.includes(field.cell.table)) entry.tables.push(field.cell.table);
    blocks.set(name, entry);
  }
  const names = [...blocks.keys()];
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
    pick({ activeFieldTag: made.key });
  };
  const addType = () => {
    const key = freeId(Object.keys(system.records ?? {}), 'лист');
    editSystem(draft => { (draft.records ??= {})[key] = { kind: 'sheet', label: 'Новый тип листа' }; });
    setOf(key);
  };

  return (
    <Card>
      <CardHead title="Листы" actions={<Button size="sm" onClick={() => add(freeGroupName(system, 'Новый блок'))}>+ блок</Button>} />
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
      {names.length === 0 ? <Empty title="Лист пока пуст" /> : null}
      {names.map(block => {
        const { fields, tables } = blocks.get(block)!;
        const on = shown(block);
        return (
          <div key={block} className={`stack stack--tight${on ? '' : ' faint'}`}>
            <div className="inline inline--tight">
              {kind ? (
                <input type="checkbox" checked={on} title={on ? 'есть на этом листе' : 'нет на этом листе'} onChange={() => toggle(block)} />
              ) : null}
              <LabelInput value={block} onCommit={next => editSystem(draft => renameGroup(draft, block, next))} />
            </div>
            <div className="inline inline--tight">
              {fields.map(field => (
                <Button key={field.tag} size="sm" variant={field.tag === picked ? 'primary' : 'ghost'}
                  title={kindOf(field)} onClick={() => pick({ activeFieldTag: field.tag === picked ? null : field.tag })}>
                  {field.label}{field.value.kind === 'formula' ? ' =' : ''}
                </Button>
              ))}
              {tables.map(id => (
                <Button key={id} size="sm" variant="ghost" title="таблица" onClick={() => onTable(id)}>
                  ▦ {system.tables?.[id]?.label || id} · {(system.tables?.[id]?.rows ?? []).length}
                </Button>
              ))}
              <Button size="sm" variant="ghost" title={`колонка в блоке «${block}»`} onClick={() => add(block)}>+</Button>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
