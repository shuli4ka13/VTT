import { useWorld, useBook, freeId, slugOf } from '../../../store/world.ts';
import { LiveValue } from '../live-value.tsx';
import { Card, CardHead, Button, Field, Select, Chip, Empty } from '../../../ui/primitives.tsx';
import { ColumnCard } from './column-card.tsx';
import type { ColumnPatch } from './column-card.tsx';
import { newField } from '../factory.ts';
import { usersOf } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import { kindsFor, kindWord } from '@vtt/engine/words/kinds';
import { choiceTables } from '@vtt/engine/model/tables';
import { onSheet } from '@vtt/engine/model/sheet-columns';
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
  const columns = system.fields.filter(isCharacterColumn);
  const active = columns.find(f => f.tag === picked) ?? null;
  const blocks = new Map<string, FieldModel[]>();
  for (const field of columns) {
    const name = field.group ?? NO_BLOCK;
    blocks.set(name, [...blocks.get(name) ?? [], field]);
  }
  const tables = Object.entries(system.tables ?? {}).filter(([, table]) => onSheet(table));
  const add = (group: string) => {
    const made = newField(system, group);
    editSystem(draft => { draft.fields.push(made.value); });
    pick({ activeFieldTag: made.key });
  };

  return (
    <Card>
      <CardHead title="Персонаж" actions={<Button size="sm" onClick={() => add(NO_BLOCK)}>+ колонка</Button>} />
      {active ? <FieldColumnCard field={active} system={system} usage={usage} onClose={() => pick({ activeFieldTag: null })} /> : null}
      {columns.length === 0 ? <Empty title="У персонажа пока нет колонок" /> : null}
      {[...blocks].map(([block, fields]) => (
        <div key={block} className="stack stack--tight">
          <span className="field__label">{block}</span>
          <div className="inline inline--tight">
            {fields.map(field => (
              <Button key={field.tag} size="sm" variant={field.tag === picked ? 'primary' : 'ghost'}
                title={kindOf(field)} onClick={() => pick({ activeFieldTag: field.tag === picked ? null : field.tag })}>
                {field.label}{field.value.kind === 'formula' ? ' =' : ''}
              </Button>
            ))}
            <Button size="sm" variant="ghost" title={`колонка в блоке «${block}»`} onClick={() => add(block)}>+</Button>
          </div>
        </div>
      ))}
      {tables.length ? (
        <div className="stack stack--tight">
          <span className="field__label">Таблицы у персонажа</span>
          <div className="inline inline--tight">
            {tables.map(([id, table]) => (
              <Button key={id} size="sm" variant="ghost" onClick={() => onTable(id)}>
                ▦ {table.label || id} · {(table.rows ?? []).length}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
