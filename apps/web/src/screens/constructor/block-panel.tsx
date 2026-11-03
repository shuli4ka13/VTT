import { useState } from 'react';
import { useWorld } from '../../store/world.ts';
import { useDragList } from '../../ui/drag-list.ts';
import { PickOrder } from '../../ui/pick-order.tsx';
import { Card, CardHead, Field, Select, Button, DangerButton, LabelInput, Verdict } from '../../ui/primitives.tsx';
import { readyForSheet } from './table-field.tsx';
import { onSheet, rowKeyOf, fieldsOf, isSingle } from '@vtt/engine/model/sheet-columns';
import { recordKinds } from '@vtt/engine/model/owned';
import { pagesOf, cellHead, setWidth, setHeight, GRID, SHEET_LIST_KEYS } from '@vtt/engine/model/pages';
import { SHEET_LISTS, widthWords, splitWords, perRowWords } from '@vtt/engine/words/glossary';
import { isRange } from '@vtt/engine/model/tables';
import type { System, SheetBlock, SheetPart, SheetList } from '@vtt/schema';

export const SHEET_TABLE = 'лист';

export const partTables = (system: System): [string, string][] =>
  Object.entries(system.tables ?? {})
    .filter(([, table]) => !isRange(table) && table.shape !== 'book' && (onSheet(table) || (table.rows ?? []).length > 0))
    .map(([id, table]) => [id, onSheet(table) ? table.label || id : `${table.label || id} · справочник`]);

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

export function moveBlockTo(draft: System, name: string, target: string, after: boolean): void {
  const blocks = draft.blocks ?? [];
  const moving = blocks.find(b => b.name === name);
  const anchor = blocks.find(b => b.name === target);
  if (!moving || !anchor || name === target) return;
  for (let at: string | undefined = anchor.parent; at; at = blocks.find(b => b.name === at)?.parent) if (at === name) return;
  blocks.splice(blocks.indexOf(moving), 1);
  if (anchor.parent) moving.parent = anchor.parent; else delete moving.parent;
  blocks.splice(blocks.indexOf(anchor) + (after ? 1 : 0), 0, moving);
}

export function moveColumnTo(part: SheetPart, all: string[], key: string, target: string, after: boolean): void {
  const list = (part.columns ?? all).filter(k => k !== key);
  const at = list.indexOf(target);
  if (at < 0) return;
  list.splice(at + (after ? 1 : 0), 0, key);
  part.columns = list;
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
  for (const key of chosen.filter(k => shown.has(k) && keys.includes(k))) put('в этом блоке', key);
  for (const key of keys.filter(k => shown.has(k))) {
    if (chosen.includes(key)) continue;
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

function ColumnGroup({ title, keys, chosen, labelOf, onToggle, onMove }: {
  title: string;
  keys: string[];
  chosen: string[];
  labelOf: (key: string) => string;
  onToggle: (key: string, on: boolean) => void;
  onMove: (key: string, to: string, after: boolean) => void;
}) {
  const ordered = title === 'в этом блоке';
  const drag = useDragList(onMove, 'x');
  return (
    <div className="stack stack--tight block-pick">
      <span className="block-pick__title">{ordered ? 'показываются' : title}{ordered && keys.length > 1 ? <span className="faint"> · перетащите, чтобы поменять порядок</span> : null}</span>
      <div className="inline inline--tight">
        {keys.map(key => {
          const on = chosen.includes(key);
          return (
            <span key={key} className={`inline inline--tight${ordered ? ` drag-item${drag.mark(key)}` : ''}`} {...(ordered ? drag.props(key) : {})}>
              {ordered ? <span className="drag-grip" aria-hidden>⋮⋮</span> : null}
              <label className="inline inline--tight">
                <input type="checkbox" checked={on} onChange={() => onToggle(key, on)} />
                {labelOf(key)}
              </label>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function BlockPanel({ name, system }: { name: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const [asking, setAsking] = useState<{ table: string; index?: number } | null>(null);
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
  const place = (table: string, index?: number) => {
    setAsking(null);
    editSystem(draft => readyForSheet(draft, table));
    const part = newPart(useWorld.getState().system, table);
    edit(target => { if (index === undefined) target.parts.push(part); else target.parts[index] = part; });
  };
  const choose = (table: string, index?: number) => {
    if (onSheet(system.tables?.[table])) place(table, index);
    else setAsking({ table, ...(index === undefined ? {} : { index }) });
  };
  const askedLabel = asking ? system.tables?.[asking.table]?.label || asking.table : '';
  const descendants = (of: string): string[] => sheetBlockList(system).filter(b => b.parent === of).flatMap(b => [b.name, ...descendants(b.name)]);
  const barred = new Set([name, ...descendants(name)]);
  const parents = sheetBlockList(system).map(b => b.name).filter(other => !barred.has(other));

  const pages = pagesOf(system);
  const top = !block.parent;
  const head = top ? cellHead(system, name) : undefined;

  return (
    <Card>
      <CardHead
        title={<LabelInput value={block.name} placeholder="как зовётся блок"
          onCommit={next => {
            const clean = next.trim();
            if (!clean || clean === name || (system.blocks ?? []).some(other => other.name === clean)) return;
            editSystem(draft => renameBlock(draft, name, clean));
            pick({ activeBlock: clean });
          }} />}
        actions={<Button size="sm" variant="ghost" onClick={() => pick({ activeBlock: null })}>×</Button>} />
      <Field label="Внутри блока">
        <Select<string> label="внутри блока" value={block.parent ?? ''}
          options={[['', 'на верхнем уровне'], ...parents.map(p => [p, p] as const)]}
          onChange={next => edit(target => { if (next) target.parent = next; else delete target.parent; })} />
      </Field>
      {top ? (
        <>
          {pages.length ? (
          <Field label="Страница">
            <Select<string> label="страница блока" value={block.page ?? ''}
              options={[['', `${pages.find(page => !page.top)?.name ?? 'первая'} — первая закладка`], ...pages.map(page => [page.name, page.top ? `${page.name} · над закладками` : page.name] as const)]}
              onChange={next => edit(target => { if (next) target.page = next; else delete target.page; })} />
          </Field>
          ) : null}
          <Field label="Ширина" hint={block.under ? `общая с блоком «${head?.name}», над которым он стоит` : 'можно и потянуть за правый край блока на образце'}>
            <Select<string> label="ширина блока" value={String(head?.width ?? GRID)}
              options={Array.from({ length: GRID }, (_, at) => [String(at + 1), widthWords(at + 1)] as const).reverse()}
              onChange={next => editSystem(draft => setWidth(draft, name, Number(next)))} />
          </Field>
          <label className="inline inline--tight">
            <input type="checkbox" checked={block.under === true}
              onChange={event => { const on = event.currentTarget.checked; edit(target => { if (on) { target.under = true; delete target.width; } else delete target.under; }); }} />
            Под предыдущим блоком
          </label>
        </>
      ) : null}
      <Field label="Высота" hint="в точках экрана; пусто — по содержимому; можно и потянуть за нижний край блока на образце">
        <LabelInput value={block.height ? String(block.height) : ''} placeholder="по содержимому"
          onCommit={text => {
            const clean = text.trim();
            const n = Number(clean);
            if (clean && !Number.isFinite(n)) return;
            editSystem(draft => setHeight(draft, name, clean ? n : undefined));
          }} />
      </Field>
      <Field label="Список в блоке" hint="Показывается после полей блока; в другом блоке этот список снимается.">
        <Select<string> label="список в блоке" value={block.list ?? ''}
          options={[['', 'нет'], ...SHEET_LIST_KEYS.map(list => [list, SHEET_LISTS[list]] as const)]}
          onChange={next => editSystem(draft => {
            for (const other of draft.blocks ?? []) {
              if (other.name === name) { if (next) other.list = next as SheetList; else delete other.list; }
              else if (next && other.list === next) delete other.list;
            }
          })} />
      </Field>
      {block.list === 'things' ? (() => {
        const all = recordKinds(system).filter(([, kind]) => kind.use === 'item').map(([key]) => key);
        return (
          <Field label="Типы в списке">
            <PickOrder keys={all} chosen={block.kinds ?? all} labelOf={key => system.tables?.[key]?.label || key}
              onChange={next => edit(target => {
                if (next.length === all.length && next.every((key, at) => key === all[at])) delete target.kinds; else target.kinds = next;
              })} />
          </Field>
        );
      })() : null}
      {block.parts.some(part => isSingle(system.tables?.[part.table])) ? (
        <Field label="Поля внутри блока">
          <Select<string> label="поля внутри блока" value={String(block.per ?? '')}
            options={[['', 'как поместятся'], ...Array.from({ length: GRID }, (_, at) => [String(at + 1), perRowWords(at + 1)] as const)]}
            onChange={next => edit(target => { if (next) target.per = Number(next); else delete target.per; })} />
        </Field>
      ) : null}
      {block.parts.some(part => !isSingle(system.tables?.[part.table])) ? (
        <Field label="Строки таблицы">
          <Select<string> label="строки таблицы" value={String(block.split ?? 1)}
            options={Array.from({ length: GRID }, (_, at) => [String(at + 1), splitWords(at + 1)] as const)}
            onChange={next => edit(target => { if (Number(next) > 1) target.split = Number(next); else delete target.split; })} />
        </Field>
      ) : null}
      {block.parts.map((part, index) => {
        const table = system.tables?.[part.table];
        const columns = table?.columns ?? [];
        const rows = table?.rows ?? [];
        const single = table?.shape === 'single';
        const chosen = part.columns ?? columns.map(c => c.key);
        const chosenRows = part.rows ?? rows.map(rowKeyOf);
        return (
          <div key={index} className="stack stack--tight">
            <Field label="Поля из таблицы" hint="«Лист» — поля персонажа, «Стол» — общее на столе; справочник при выборе станет своим у каждого листа">
              <Select<string> label="таблица части" value={part.table}
                options={tables.map(([id, label]) => [id, label] as const)}
                onChange={next => choose(next, index)} />
            </Field>
            <Field label="Колонки">
              <div className="stack stack--tight">
                {groupsOf(system, part.table, columns.map(c => c.key), name, chosen).map(([title, keys]) => (
                  <ColumnGroup key={title} title={title} keys={keys} chosen={chosen}
                    labelOf={key => { const column = columns.find(c => c.key === key); return column?.label || key; }}
                    onToggle={(key, on) => editPart(index, target => {
                      const all = columns.map(c => c.key);
                      const now = target.columns ?? all;
                      target.columns = on ? now.filter(k => k !== key) : [...now, key];
                    })}
                    onMove={(key, to, after) => editPart(index, target => moveColumnTo(target, columns.map(c => c.key), key, to, after))} />
                ))}
              </div>
            </Field>
            {single ? null : (
              <Field label="Строки">
                <PickOrder keys={rows.map(rowKeyOf)} chosen={chosenRows}
                  labelOf={key => { const row = rows.find(one => rowKeyOf(one) === key); return row?.label ?? String(row?.value ?? key); }}
                  onChange={next => editPart(index, target => {
                    const all = rows.map(rowKeyOf);
                    if (!next.length) return;
                    if (next.length === all.length && next.every((key, at) => key === all[at])) delete target.rows; else target.rows = next;
                  })} />
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
      {asking ? (
        <Verdict tone="warn">
          <div className="stack stack--tight">
            <span>«{askedLabel}» — справочник: значения одни на всех. Чтобы поставить на лист, они станут своими у каждого листа — у каждого персонажа свои.</span>
            <div className="inline inline--tight">
              <Button size="sm" variant="primary" onClick={() => place(asking.table, asking.index)}>Да, своими у каждого листа</Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>Нет</Button>
            </div>
          </div>
        </Verdict>
      ) : null}
      <div className="inline inline--tight">
        <Select<string> label="добавить поля из таблицы" value=""
          options={[['', '+ поля из таблицы…'], ...tables.map(([id, label]) => [id, label] as const)]}
          onChange={id => { if (id) choose(id); }} />
        <DangerButton size="sm" onConfirm={() => { editSystem(draft => removeBlock(draft, name)); pick({ activeBlock: null }); }}>Удалить блок</DangerButton>
      </div>
    </Card>
  );
}
