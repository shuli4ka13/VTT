import { useWorld } from '../../store/world.ts';
import { Card, CardHead, Field, Select, Button, DangerButton, LabelInput } from '../../ui/primitives.tsx';
import { renameGroup } from './groups.ts';
import { onSheet, rowKeyOf } from '@vtt/engine/model/sheet-columns';
import { isRange } from '@vtt/engine/model/tables';
import type { System, SheetBlock, SheetPart } from '@vtt/schema';

export const SHEET_TABLE = 'лист';

export const partTables = (system: System): [string, string][] =>
  Object.entries(system.tables ?? {})
    .filter(([, table]) => !isRange(table) && onSheet(table))
    .map(([id, table]) => [id, table.label || id]);

export const sheetBlockList = (system: System): SheetBlock[] => system.blocks ?? [];

export function freeBlockName(system: System, base: string): string {
  const taken = new Set([...Object.keys(system.groups ?? {}), ...sheetBlockList(system).map(b => b.name)]);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

export function renameBlock(draft: System, from: string, to: string): void {
  const clean = to.trim();
  if (!clean || clean === from) return;
  for (const block of draft.blocks ?? []) {
    if (block.name === from) block.name = clean;
    if (block.parent === from) block.parent = clean;
  }
  renameGroup(draft, from, clean);
}

export function removeBlock(draft: System, name: string): void {
  const own = (draft.blocks ?? []).find(b => b.name === name);
  draft.blocks = (draft.blocks ?? []).filter(b => b.name !== name);
  for (const block of draft.blocks) if (block.parent === name) { if (own?.parent) block.parent = own.parent; else delete block.parent; }
  for (const kind of Object.values(draft.sheets ?? {})) {
    if (kind.blocks) kind.blocks = kind.blocks.filter(b => b !== name);
  }
  if (!draft.blocks.length) delete draft.blocks;
}

export function addColumnToBlock(draft: System, name: string, table: string, key: string): void {
  const block = (draft.blocks ?? []).find(b => b.name === name);
  if (!block) return;
  const part = block.parts.find(p => p.table === table);
  if (!part) block.parts.push({ table, columns: [key] });
  else if (part.columns && !part.columns.includes(key)) part.columns.push(key);
}

export function BlockPanel({ name, system }: { name: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const block = sheetBlockList(system).find(b => b.name === name);
  if (!block) return null;
  const tables = partTables(system);
  const edit = (change: (target: SheetBlock) => void) => editSystem(draft => {
    const target = (draft.blocks ?? []).find(b => b.name === name);
    if (target) change(target);
  });
  const editPart = (index: number, change: (part: SheetPart) => void) => edit(target => {
    const part = target.parts[index];
    if (part) change(part);
  });
  const descendants = (of: string): string[] => sheetBlockList(system).filter(b => b.parent === of).flatMap(b => [b.name, ...descendants(b.name)]);
  const barred = new Set([name, ...descendants(name)]);
  const parents = sheetBlockList(system).map(b => b.name).filter(other => !barred.has(other));

  return (
    <Card>
      <CardHead title={`Блок «${block.name}»`} actions={<Button size="sm" variant="ghost" onClick={() => pick({ activeBlock: null })}>×</Button>} />
      <Field label="Название">
        <LabelInput value={block.name} placeholder="как зовётся блок"
          onCommit={next => {
            const clean = next.trim();
            if (!clean || clean === name) return;
            editSystem(draft => renameBlock(draft, name, clean));
            pick({ activeBlock: clean });
          }} />
      </Field>
      <Field label="Внутри блока">
        <Select<string> label="внутри блока" value={block.parent ?? ''}
          options={[['', 'на верхнем уровне'], ...parents.map(p => [p, p] as const)]}
          onChange={next => edit(target => { if (next) target.parent = next; else delete target.parent; })} />
      </Field>
      {block.parts.map((part, index) => {
        const table = system.tables?.[part.table];
        const columns = table?.columns ?? [];
        const rows = table?.rows ?? [];
        const single = table?.shape === 'single';
        const chosen = part.columns ?? columns.map(c => c.key);
        const chosenRows = part.rows ?? rows.map(rowKeyOf);
        return (
          <div key={index} className="stack stack--tight">
            <Field label="Часть блока: таблица">
              <Select<string> label="таблица части" value={part.table}
                options={tables.map(([id, label]) => [id, label] as const)}
                onChange={next => editPart(index, target => { target.table = next; delete target.columns; delete target.rows; delete target.by; })} />
            </Field>
            <Field label="Колонки">
              <div className="inline inline--tight">
                {columns.map(column => (
                  <label key={column.key} className="inline inline--tight">
                    <input type="checkbox" checked={chosen.includes(column.key)}
                      onChange={() => editPart(index, target => {
                        const now = target.columns ?? columns.map(c => c.key);
                        const next = now.includes(column.key) ? now.filter(k => k !== column.key) : columns.map(c => c.key).filter(k => k === column.key || now.includes(k));
                        if (next.length === columns.length) delete target.columns; else target.columns = next;
                      })} />
                    {column.label || column.key}
                  </label>
                ))}
              </div>
            </Field>
            {single ? null : (
              <Field label="Строки">
                <div className="inline inline--tight">
                  <Button size="sm" variant={part.rows ? 'ghost' : 'primary'} onClick={() => editPart(index, target => { delete target.rows; })}>все</Button>
                  {rows.map(row => {
                    const key = rowKeyOf(row);
                    return (
                      <label key={key} className="inline inline--tight">
                        <input type="checkbox" checked={chosenRows.includes(key)}
                          onChange={() => editPart(index, target => {
                            const now = target.rows ?? rows.map(rowKeyOf);
                            const next = now.includes(key) ? now.filter(k => k !== key) : rows.map(rowKeyOf).filter(k => k === key || now.includes(k));
                            if (next.length === rows.length) delete target.rows; else target.rows = next;
                          })} />
                        {row.label ?? String(row.value ?? key)}
                      </label>
                    );
                  })}
                </div>
              </Field>
            )}
            <Field label="Группировать по">
              <Select<string> label="группировать по" value={part.by ?? ''}
                options={[['', 'не группировать'], ...columns.map(c => [c.key, c.label || c.key] as const)]}
                onChange={next => editPart(index, target => { if (next) target.by = next; else delete target.by; })} />
            </Field>
            <DangerButton size="sm" onConfirm={() => edit(target => { target.parts.splice(index, 1); })}>Удалить часть</DangerButton>
          </div>
        );
      })}
      <div className="inline inline--tight">
        <Button size="sm" onClick={() => edit(target => { target.parts.push({ table: tables[0]?.[0] ?? SHEET_TABLE }); })}>+ часть</Button>
        <DangerButton size="sm" onConfirm={() => { editSystem(draft => removeBlock(draft, name)); pick({ activeBlock: null }); }}>Удалить блок</DangerButton>
      </div>
    </Card>
  );
}
