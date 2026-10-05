import { useWorld } from '../../store/world.ts';
import { Card, CardHead, Field, Select, Button, DangerButton, LabelInput } from '../../ui/primitives.tsx';
import { onSheet, rowKeyOf, fieldsOf } from '@vtt/engine/model/sheet-columns';
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
  if (!clean || clean === from || (draft.blocks ?? []).some(block => block.name === clean)) return;
  for (const block of draft.blocks ?? []) {
    if (block.name === from) block.name = clean;
    if (block.parent === from) block.parent = clean;
  }
  for (const kind of Object.values(draft.sheets ?? {})) {
    if (kind.blocks) kind.blocks = kind.blocks.map(name => (name === from ? clean : name));
  }
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

export function homesOf(system: System, table: string, column: string): string[] {
  const field = fieldsOf(system).find(f => f.home === table && (f.cell?.column ?? f.tag) === column);
  return (field?.placements ?? []).map(place => place.group);
}

function groupsOf(system: System, table: string, keys: string[], self: string, chosen: string[]): [string, string[]][] {
  const shown = new Set(fieldsOf(system).filter(f => f.home === table).map(f => f.cell?.column ?? f.tag));
  const out = new Map<string, string[]>();
  const put = (title: string, key: string) => out.set(title, [...out.get(title) ?? [], key]);
  for (const key of keys.filter(k => shown.has(k))) {
    if (chosen.includes(key)) { put('в этом блоке', key); continue; }
    const homes = homesOf(system, table, key).filter(home => home !== self);
    put(homes.length ? `уже в «${homes[0]}»` : 'ни в одном блоке', key);
  }
  const order = (title: string) => (title === 'в этом блоке' ? 0 : title === 'ни в одном блоке' ? 1 : 2);
  return [...out].sort((a, b) => order(a[0]) - order(b[0]));
}

export function newPart(system: System, table: string): SheetPart {
  const keys = (system.tables?.[table]?.columns ?? []).map(c => c.key);
  const shown = new Set(fieldsOf(system).filter(f => f.home === table).map(f => f.cell?.column ?? f.tag));
  const free = keys.filter(key => shown.has(key) && !homesOf(system, table, key).length);
  if (free.length) return { table, columns: free };
  const first = keys.find(key => shown.has(key)) ?? keys[0];
  return { table, columns: first ? [first] : [] };
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
            if (!clean || clean === name || (system.blocks ?? []).some(other => other.name === clean)) return;
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
            <Field label="Поля из таблицы" hint="таблицы, чьи значения живут у листа: «Лист» — поля персонажа, «Стол», и таблицы «своё у каждого листа»">
              <Select<string> label="таблица части" value={part.table}
                options={tables.map(([id, label]) => [id, label] as const)}
                onChange={next => edit(target => { target.parts[index] = newPart(system, next); })} />
            </Field>
            <Field label="Колонки">
              <div className="stack stack--tight">
                {groupsOf(system, part.table, columns.map(c => c.key), name, chosen).map(([title, keys]) => (
                  <div key={title} className="stack stack--tight block-pick">
                    <span className="block-pick__title">{title}</span>
                    <div className="inline inline--tight">
                      {keys.map(key => {
                        const column = columns.find(c => c.key === key)!;
                        const on = chosen.includes(key);
                        return (
                          <label key={key} className="inline inline--tight">
                            <input type="checkbox" checked={on}
                              onChange={() => editPart(index, target => {
                                const all = columns.map(c => c.key);
                                const now = target.columns ?? all;
                                target.columns = on ? now.filter(k => k !== key) : all.filter(k => k === key || now.includes(k));
                              })} />
                            {column.label || column.key}
                          </label>
                        );
                      })}
                    </div>
                  </div>
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
            <DangerButton size="sm" onConfirm={() => edit(target => { target.parts.splice(index, 1); })}>Убрать поля этой таблицы</DangerButton>
          </div>
        );
      })}
      <div className="inline inline--tight">
        <Select<string> label="добавить поля из таблицы" value=""
          options={[['', '+ поля из таблицы…'], ...tables.map(([id, label]) => [id, label] as const)]}
          onChange={id => { if (id) edit(target => { target.parts.push(newPart(system, id)); }); }} />
        <DangerButton size="sm" onConfirm={() => { editSystem(draft => removeBlock(draft, name)); pick({ activeBlock: null }); }}>Удалить блок</DangerButton>
      </div>
    </Card>
  );
}
