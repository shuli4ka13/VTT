import { useWorld } from '../../store/world.ts';
import { BlockPick } from './block-pick.tsx';
import { RollTagsPick } from './roll-tags-pick.tsx';
import { dieEntries } from './rules/dice-section.tsx';
import { CONTROLS } from '../../sheet/controls/index.tsx';
import { Card, CardHead, Field, Input, Select, Chip } from '../../ui/primitives.tsx';
import { isRange } from '@vtt/engine/model/tables';
import { ROW, cellSource, onSheet, isSingle, fieldsOf } from '@vtt/engine/model/sheet-columns';
import type { System, Column } from '@vtt/schema';

export const sheetTables = (system: System): [string, string][] =>
  Object.entries(system.tables ?? {})
    .filter(([, table]) => !isRange(table) && !onSheet(table) && (table.rows ?? []).length > 0)
    .map(([id, table]) => [id, table.label || id]);

export function placeOnSheet(draft: System, tableId: string): void {
  const table = draft.tables?.[tableId];
  if (!table) return;
  table.owner = 'sheet';
  table.block ??= table.label || tableId;
  if ((table.columns ?? []).some(column => (table.rows ?? []).some(row => cellSource(column, row).kind === 'input'))) return;
  const columns = (table.columns ??= []);
  const taken = new Set(columns.map(c => c.key));
  let key = 'value';
  for (let n = 2; taken.has(key); n++) key = `value_${n}`;
  columns.unshift({ key, label: 'Значение', kind: 'number' });
}

const parseStart = (text: string): number | string => (/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text);

export function ColumnOnSheet({ tableId, column, system }: { tableId: string; column: Column; system: System }) {
  const editColumn = useWorld(s => s.editColumn);
  const table = system.tables![tableId]!;
  const single = isSingle(table);
  const stored = single ? column.expr === undefined : (table.rows ?? []).some(row => cellSource(column, row).kind === 'input');
  const first = fieldsOf(system).find(f => f.home === tableId && (single ? f.tag === column.key : f.cell?.column === column.key));
  const self = single ? `@${column.key}` : `@${ROW}.${column.key}`;
  const edit = (change: (draft: Column) => void) => editColumn(tableId, column.key, change);

  return (
    <Card>
      <CardHead title={column.label || column.key} sub={<Chip>{stored ? 'вводит игрок' : 'считается'}</Chip>} />
      <div className="row">
        <Field label="Блок">
          <BlockPick of="fields" system={system} value={column.block ?? table.block}
            onChange={next => edit(draft => { if (next) draft.block = next; else delete draft.block; })} />
        </Field>
        {stored ? (
          <Field label="Как выглядит">
            <Select
              value={column.control ?? ''}
              options={[['', 'обычное поле'],
                ...(Object.keys(CONTROLS) as (keyof typeof CONTROLS)[]).map(key => [key, CONTROLS[key]] as const)] as never}
              onChange={next => edit(draft => { if (next) draft.control = next as Column['control']; else delete draft.control; })}
            />
          </Field>
        ) : null}
        {stored ? (
          <Field label="В новом листе">
            <Input value={column.default === undefined ? '' : String(column.default)}
              onChange={text => edit(draft => { if (!text.trim()) delete draft.default; else draft.default = parseStart(text); })} />
          </Field>
        ) : null}
        {single ? null : (
          <Field label="Подпись">
            <Input value={column.title ?? ''} placeholder={first?.label ?? ''}
              onChange={next => edit(draft => { if (next.trim()) draft.title = next; else delete draft.title; })} />
          </Field>
        )}
      </div>
      <Field label="Бросок">
        <div className="stack stack--tight">
          <Select
            value={!column.roll ? '' : column.roll.count ? 'pool' : 'bonus'}
            options={[['', 'не бросают'], ['bonus', 'значение — прибавка к кости'], ['pool', 'значение — число костей']] as const}
            onChange={next => edit(draft => {
              if (!next) { delete draft.roll; return; }
              const die = dieEntries(system)[0]?.[0];
              const roll = draft.roll ?? { ...(single ? { label: `Проверка: ${draft.label ?? draft.key}` } : {}), ...(die ? { die: { constant: die } } : {}) };
              if (next === 'pool') { roll.count = { expr: self }; delete roll.bonus; } else { roll.bonus = { expr: self }; delete roll.count; }
              draft.roll = roll;
            })}
          />
          {column.roll ? (
            <>
              <Select
                value={column.roll.die?.constant ?? ''}
                options={[['', '— какой костью —'], ...dieEntries(system).map(([key, c]) => [key, c.label || key] as const)] as never}
                onChange={key => edit(draft => {
                  if (!draft.roll) return;
                  if (key) draft.roll.die = { constant: key }; else delete draft.roll.die;
                })}
              />
              <RollTagsPick
                system={system}
                value={column.roll.tags}
                onChange={tags => edit(draft => {
                  if (!draft.roll) return;
                  if (tags.length) draft.roll.tags = tags; else delete draft.roll.tags;
                })}
              />
            </>
          ) : null}
        </div>
      </Field>
    </Card>
  );
}
