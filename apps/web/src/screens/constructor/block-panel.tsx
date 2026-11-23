import { useState } from 'react';
import { useWorld, freeId } from '../../store/world.ts';
import { useDragList } from '../../ui/drag-list.ts';
import { PickOrder } from '../../ui/pick-order.tsx';
import { Card, CardHead, Field, Select, Button, DangerButton, LabelInput, Verdict } from '../../ui/primitives.tsx';
import { readyForSheet } from './table-field.tsx';
import { blockNames, blockLabel, labelBlock, pageLabel, onSheet, rowKeyOf, fieldsOf, isSingle, recordKinds, pagesOf, cellHead, setWidth, setHeight, GRID, SHEET_LIST_KEYS, SHEET_LISTS, widthWords, splitWords, perRowWords, isRange } from '@vtt/engine';
import type { System, SheetBlock, SheetPart, SheetList } from '@vtt/schema';
import { useT, t } from '../../i18n/author.ts';

export const SHEET_TABLE = 'list';

export const partTables = (system: System): [string, string][] =>
  Object.entries(system.tables ?? {})
    .filter(([, table]) => !isRange(table) && table.shape !== 'book' && (onSheet(table) || (table.rows ?? []).length > 0))
    .map(([id, table]) => [id, onSheet(table) ? table.label || id : t('sheetTab:block.part.reference', { name: table.label || id })]);

export const sheetBlockList = (system: System): SheetBlock[] => system.blocks ?? [];

export const freeBlockKey = (system: System, title: string): string => freeId(blockNames(system), title);

export function titleTaken(system: System, key: string, title: string): boolean {
  return blockNames(system).some(other => other !== key && blockLabel(system, other) === title);
}

export function removeBlock(draft: System, name: string): void {
  const own = (draft.blocks ?? []).find(b => b.key === name);
  draft.blocks = (draft.blocks ?? []).filter(b => b.key !== name);
  for (const block of draft.blocks) if (block.parent === name) { if (own?.parent) block.parent = own.parent; else delete block.parent; }
  for (const kind of Object.values(draft.sheets ?? {})) {
    if (kind.blocks) kind.blocks = kind.blocks.filter(b => b !== name);
  }
  if (!draft.blocks.length) delete draft.blocks;
}

export function moveBlockTo(draft: System, name: string, target: string, after: boolean): void {
  const blocks = draft.blocks ?? [];
  const moving = blocks.find(b => b.key === name);
  const anchor = blocks.find(b => b.key === target);
  if (!moving || !anchor || name === target) return;
  for (let at: string | undefined = anchor.parent; at; at = blocks.find(b => b.key === at)?.parent) if (at === name) return;
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
  const block = (draft.blocks ?? []).find(b => b.key === name);
  if (!block) return;
  const part = block.parts.find(p => p.table === table);
  if (!part) block.parts.push({ table, columns: [key] });
  else if (part.columns && !part.columns.includes(key)) part.columns.push(key);
}

export function homesOf(system: System, table: string, column: string): string[] {
  const field = fieldsOf(system).find(f => f.home === table && (f.cell?.column ?? f.tag) === column);
  return (field?.placements ?? []).map(place => place.group);
}

type GroupId = 'here' | 'none' | `in:${string}`;

function groupsOf(system: System, table: string, keys: string[], self: string, chosen: string[]): { id: GroupId; title: string; keys: string[] }[] {
  const shown = new Set(fieldsOf(system).filter(f => f.home === table).map(f => f.cell?.column ?? f.tag));
  const out = new Map<GroupId, { title: string; keys: string[] }>();
  const put = (id: GroupId, title: string, key: string) => out.set(id, { title, keys: [...out.get(id)?.keys ?? [], key] });
  for (const key of chosen.filter(k => shown.has(k) && keys.includes(k))) put('here', t('sheetTab:block.group.here'), key);
  for (const key of keys.filter(k => shown.has(k))) {
    if (chosen.includes(key)) continue;
    const homes = homesOf(system, table, key).filter(home => home !== self);
    if (homes.length) put(`in:${homes[0]!}`, t('sheetTab:block.group.elsewhere', { name: blockLabel(system, homes[0]!) }), key);
    else put('none', t('sheetTab:block.group.none'), key);
  }
  const order = (id: GroupId) => (id === 'here' ? 0 : id === 'none' ? 1 : 2);
  return [...out].map(([id, group]) => ({ id, ...group })).sort((a, b) => order(a.id) - order(b.id));
}

export function newPart(system: System, table: string): SheetPart {
  const keys = (system.tables?.[table]?.columns ?? []).map(c => c.key);
  const shown = new Set(fieldsOf(system).filter(f => f.home === table).map(f => f.cell?.column ?? f.tag));
  const free = keys.filter(key => shown.has(key) && !homesOf(system, table, key).length);
  if (free.length) return { table, columns: free };
  const first = keys.find(key => shown.has(key)) ?? keys[0];
  return { table, columns: first ? [first] : [] };
}

function ColumnGroup({ ordered, title, keys, chosen, labelOf, onToggle, onMove }: {
  ordered: boolean;
  title: string;
  keys: string[];
  chosen: string[];
  labelOf: (key: string) => string;
  onToggle: (key: string, on: boolean) => void;
  onMove: (key: string, to: string, after: boolean) => void;
}) {
  const t = useT('sheetTab');
  const drag = useDragList(onMove, 'x');
  return (
    <div className="stack stack--tight block-pick">
      <span className="block-pick__title">{ordered ? t('block.pick.shown') : title}{ordered && keys.length > 1 ? <span className="faint">{t('block.pick.reorder')}</span> : null}</span>
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
  const t = useT('sheetTab');
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const [asking, setAsking] = useState<{ table: string; index?: number } | null>(null);
  const block = sheetBlockList(system).find(b => b.key === name);
  if (!block) return null;
  const tables = partTables(system);
  const edit = (change: (target: SheetBlock) => void) => editSystem(draft => {
    const target = (draft.blocks ?? []).find(b => b.key === name);
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
  const descendants = (of: string): string[] => sheetBlockList(system).filter(b => b.parent === of).flatMap(b => [b.key, ...descendants(b.key)]);
  const barred = new Set([name, ...descendants(name)]);
  const parents = sheetBlockList(system).map(b => b.key).filter(other => !barred.has(other));

  const pages = pagesOf(system);
  const firstTab = pages.find(page => !page.top);
  const head = cellHead(system, name);

  return (
    <Card>
      <CardHead
        title={<LabelInput value={blockLabel(system, name)} placeholder={t('common:name.block')}
          onCommit={next => {
            const clean = next.trim();
            if (!clean || clean === blockLabel(system, name) || titleTaken(system, name, clean)) return;
            editSystem(draft => labelBlock(draft, name, clean));
          }} />}
        actions={<Button size="sm" variant="ghost" onClick={() => pick({ activeBlock: null })}>×</Button>} />
      <Field label={t('block.parent.label')}>
        <Select<string> label={t('block.parent.aria')} value={block.parent ?? ''}
          options={[['', t('block.parent.top')], ...parents.map(p => [p, blockLabel(system, p)] as const)]}
          onChange={next => edit(target => { if (next) target.parent = next; else delete target.parent; })} />
      </Field>
      {pages.length ? (
        <Field label={t('block.page.label')}>
          <Select<string> label={t('block.page.aria')} value={block.page ?? ''}
            options={[['', block.parent ? t('block.page.likeParent', { name: blockLabel(system, block.parent) }) : firstTab ? t('block.page.firstTab', { name: pageLabel(system, firstTab.key) }) : t('block.page.firstTabPlain')], ...pages.map(page => [page.key, page.top ? t('block.page.aboveTabs', { name: pageLabel(system, page.key) }) : pageLabel(system, page.key)] as const)]}
            onChange={next => edit(target => { if (next) target.page = next; else delete target.page; })} />
        </Field>
      ) : null}
      <Field label={t('block.width.label')} hint={block.under ? t('block.width.hintUnder', { name: head ? blockLabel(system, head.key) : '' }) : t('block.width.hint')}>
        <Select<string> label={t('block.width.aria')} value={String(head?.width ?? GRID)}
          options={Array.from({ length: GRID }, (_, at) => [String(at + 1), widthWords(at + 1)] as const).reverse()}
          onChange={next => editSystem(draft => setWidth(draft, name, Number(next)))} />
      </Field>
      <label className="inline inline--tight">
        <input type="checkbox" checked={block.under === true}
          onChange={event => { const on = event.currentTarget.checked; edit(target => { if (on) { target.under = true; delete target.width; } else delete target.under; }); }} />
        {t('block.under')}
      </label>
      <Field label={t('block.height.label')} hint={t('block.height.hint')}>
        <LabelInput value={block.height ? String(block.height) : ''} placeholder={t('block.height.placeholder')}
          onCommit={text => {
            const clean = text.trim();
            const n = Number(clean);
            if (clean && !Number.isFinite(n)) return;
            editSystem(draft => setHeight(draft, name, clean ? n : undefined));
          }} />
      </Field>
      <Field label={t('block.list.label')} hint={t('block.list.hint')}>
        <Select<string> label={t('block.list.aria')} value={block.list ?? ''}
          options={[['', t('common:no')], ...SHEET_LIST_KEYS.map(list => [list, SHEET_LISTS[list]] as const)]}
          onChange={next => editSystem(draft => {
            for (const other of draft.blocks ?? []) {
              if (other.key === name) { if (next) other.list = next as SheetList; else delete other.list; }
              else if (next && other.list === next) delete other.list;
            }
          })} />
      </Field>
      {block.list === 'things' ? (() => {
        const all = recordKinds(system).filter(([, kind]) => kind.use === 'item').map(([key]) => key);
        return (
          <Field label={t('block.kinds')}>
            <PickOrder keys={all} chosen={block.kinds ?? all} labelOf={key => system.tables?.[key]?.label || key}
              onChange={next => edit(target => {
                if (next.length === all.length && next.every((key, at) => key === all[at])) delete target.kinds; else target.kinds = next;
              })} />
          </Field>
        );
      })() : null}
      {block.parts.some(part => isSingle(system.tables?.[part.table])) ? (
        <Field label={t('block.per.label')}>
          <Select<string> label={t('block.per.aria')} value={String(block.per ?? '')}
            options={[['', t('block.per.auto')], ...Array.from({ length: GRID }, (_, at) => [String(at + 1), perRowWords(at + 1)] as const)]}
            onChange={next => edit(target => { if (next) target.per = Number(next); else delete target.per; })} />
        </Field>
      ) : null}
      {block.parts.some(part => !isSingle(system.tables?.[part.table])) ? (
        <Field label={t('block.split.label')}>
          <Select<string> label={t('block.split.aria')} value={String(block.split ?? 1)}
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
            <Field label={t('block.table.label')} hint={t('block.table.hint')}>
              <Select<string> label={t('block.table.aria')} value={part.table}
                options={tables.map(([id, label]) => [id, label] as const)}
                onChange={next => choose(next, index)} />
            </Field>
            <Field label={t('block.columns')}>
              <div className="stack stack--tight">
                {groupsOf(system, part.table, columns.map(c => c.key), name, chosen).map(({ id, title, keys }) => (
                  <ColumnGroup key={id} ordered={id === 'here'} title={title} keys={keys} chosen={chosen}
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
              <Field label={t('block.rows')}>
                <PickOrder keys={rows.map(rowKeyOf)} chosen={chosenRows}
                  labelOf={key => { const row = rows.find(one => rowKeyOf(one) === key); return row?.label ?? String(row?.value ?? key); }}
                  onChange={next => editPart(index, target => {
                    const all = rows.map(rowKeyOf);
                    if (!next.length) return;
                    if (next.length === all.length && next.every((key, at) => key === all[at])) delete target.rows; else target.rows = next;
                  })} />
              </Field>
            )}
            <Field label={t('block.by.label')}>
              <Select<string> label={t('block.by.aria')} value={part.by ?? ''}
                options={[['', t('block.by.none')], ...columns.map(c => [c.key, c.label || c.key] as const)]}
                onChange={next => editPart(index, target => { if (next) target.by = next; else delete target.by; })} />
            </Field>
            <DangerButton size="sm" onConfirm={() => edit(target => { target.parts.splice(index, 1); })}>{t('block.removePart')}</DangerButton>
          </div>
        );
      })}
      {asking ? (
        <Verdict tone="warn">
          <div className="stack stack--tight">
            <span>{t('block.ask.text', { name: askedLabel })}</span>
            <div className="inline inline--tight">
              <Button size="sm" variant="primary" onClick={() => place(asking.table, asking.index)}>{t('block.ask.yes')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>{t('block.ask.no')}</Button>
            </div>
          </div>
        </Verdict>
      ) : null}
      <div className="inline inline--tight">
        <Select<string> label={t('block.add.aria')} value=""
          options={[['', t('block.add.option')], ...tables.map(([id, label]) => [id, label] as const)]}
          onChange={id => { if (id) choose(id); }} />
        <DangerButton size="sm" onConfirm={() => { editSystem(draft => removeBlock(draft, name)); pick({ activeBlock: null }); }}>{t('block.remove')}</DangerButton>
      </div>
    </Card>
  );
}
