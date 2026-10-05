import { useWorld } from '../../store/world.ts';
import { Card, CardHead, Field, Button, LabelInput } from '../../ui/primitives.tsx';
import { CellEditor, spoken } from './rules/tables-section.tsx';
import { rowNames } from './row-names.ts';
import { onSheet, rowKeyOf } from '@vtt/engine/model/sheet-columns';
import type { System } from '@vtt/schema';

export function RowPanel({ table: id, row: key, system }: { table: string; row: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const table = system.tables?.[id];
  const row = table?.rows?.find(r => rowKeyOf(r) === key);
  if (!table || !row) return null;
  const name = row.label ?? String(row.value);
  const names = rowNames(system, id);
  const change = (edit: (target: NonNullable<typeof row>) => void) => editSystem(draft => {
    const target = draft.tables?.[id]?.rows?.find(r => rowKeyOf(r) === key);
    if (target) edit(target);
  });
  return (
    <Card>
      <CardHead title={`Строка «${name}»`} sub={`таблица «${table.label || id}»`}
        actions={<Button size="sm" variant="ghost" title="закрыть" onClick={() => pick({ activeRow: null })}>×</Button>} />
      <Field label="Подпись">
        <LabelInput value={row.label ?? ''} placeholder={String(row.value)}
          onCommit={next => change(target => { if (next.trim()) target.label = next.trim(); else delete target.label; })} />
      </Field>
      {(table.columns ?? []).map(column => (
        <Field key={column.key} label={column.label || column.key}>
          <CellEditor
            column={column}
            value={row.cells?.[column.key]}
            system={system}
            where={`${table.label || id} · ${name} · ${column.label || column.key}`}
            names={names}
            placed={onSheet(table)}
            {...(column.expr !== undefined ? { inherited: spoken(system, id, row, column.expr.expr) } : {})}
            onChange={value => change(target => {
              if (value === undefined) { delete target.cells?.[column.key]; if (target.cells && !Object.keys(target.cells).length) delete target.cells; }
              else (target.cells ??= {})[column.key] = value as never;
            })}
          />
        </Field>
      ))}
      <Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeTableId: id })}>Правила: таблица «{table.label || id}» →</Button>
    </Card>
  );
}
