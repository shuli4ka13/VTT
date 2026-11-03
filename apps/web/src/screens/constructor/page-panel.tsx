import { useWorld } from '../../store/world.ts';
import { Card, CardHead, Field, Segmented, Button, DangerButton, LabelInput } from '../../ui/primitives.tsx';
import { PAGE_LISTS, pagesOf, pageOfBlock, renamePage, removePage } from '@vtt/engine/model/pages';
import { SHEET_LISTS } from '@vtt/engine/words/glossary';
import type { System, SheetPage, PageList } from '@vtt/schema';

export const FIRST_PAGE = 'Основное';

export function freePageName(system: System): string {
  const taken = new Set(pagesOf(system).map(page => page.name));
  if (!taken.size) return FIRST_PAGE;
  for (let n = pagesOf(system).length + 1; ; n++) if (!taken.has(`Страница ${n}`)) return `Страница ${n}`;
}

export function addPage(draft: System, name: string): void {
  draft.pages = [...pagesOf(draft), { name }];
}

export function movePage(draft: System, name: string, by: -1 | 1): void {
  const pages = draft.pages ?? [];
  const at = pages.findIndex(page => page.name === name);
  const to = at + by;
  if (at < 0 || to < 0 || to >= pages.length) return;
  const [moving] = pages.splice(at, 1);
  pages.splice(to, 0, moving!);
}

export function setTop(draft: System, name: string, on: boolean): void {
  for (const page of draft.pages ?? []) {
    if (page.name === name) { if (on) page.top = true; else delete page.top; }
    else if (on) delete page.top;
  }
}

export function setStacks(page: SheetPage, count: number): void {
  if (count === 2 || count === 3) page.stacks = count; else delete page.stacks;
}

export function setList(draft: System, name: string, list: PageList, on: boolean): void {
  for (const page of draft.pages ?? []) {
    const rest = (page.lists ?? []).filter(item => item !== list);
    const next = page.name === name && on ? PAGE_LISTS.filter(item => item === list || rest.includes(item)) : rest;
    if (next.length) page.lists = next; else delete page.lists;
  }
}

export function PagePanel({ name, system }: { name: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const pages = pagesOf(system);
  const index = pages.findIndex(page => page.name === name);
  const page = pages[index];
  if (!page) return null;
  const edit = (change: (target: SheetPage) => void) => editSystem(draft => {
    const target = (draft.pages ?? []).find(item => item.name === name);
    if (target) change(target);
  });

  return (
    <Card>
      <CardHead
        title={<LabelInput value={page.name} placeholder="как зовётся страница"
          onCommit={next => {
            const clean = next.trim();
            if (!clean || clean === name || pages.some(other => other.name === clean)) return;
            editSystem(draft => renamePage(draft, name, clean));
            pick({ activePage: clean });
          }} />}
        actions={<Button size="sm" variant="ghost" onClick={() => pick({ activePage: null })}>×</Button>} />
      <Field label="Значок">
        <LabelInput value={page.icon ?? ''} placeholder="без значка"
          onCommit={next => edit(target => { const clean = next.trim(); if (clean) target.icon = clean; else delete target.icon; })} />
      </Field>
      <label className="inline inline--tight">
        <input type="checkbox" checked={page.top === true} onChange={event => editSystem(draft => setTop(draft, name, event.currentTarget.checked))} />
        Шапка — видна всегда
      </label>
      <Field label="Столбцов">
        <Segmented<string> value={String(page.stacks ?? 1)}
          options={[{ key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3', label: '3' }]}
          onChange={next => edit(target => setStacks(target, Number(next)))} />
      </Field>
      <Field label="Списки на этой странице">
        <div className="stack stack--tight">
          {PAGE_LISTS.map(list => (
            <label key={list} className="inline inline--tight">
              <input type="checkbox" checked={(page.lists ?? []).includes(list)}
                onChange={event => editSystem(draft => setList(draft, name, list, event.currentTarget.checked))} />
              {SHEET_LISTS[list]}
            </label>
          ))}
        </div>
      </Field>
      <div className="inline inline--tight">
        <Button size="sm" disabled={index === 0} onClick={() => editSystem(draft => movePage(draft, name, -1))}>↑ раньше</Button>
        <Button size="sm" disabled={index === pages.length - 1} onClick={() => editSystem(draft => movePage(draft, name, 1))}>↓ позже</Button>
        <DangerButton size="sm" onConfirm={() => { editSystem(draft => removePage(draft, name)); pick({ activePage: null }); }}>Удалить страницу</DangerButton>
      </div>
    </Card>
  );
}

export const OPEN_PAGE = { activeBlock: null, activeFieldTag: null, activeColumn: null, activeRow: null, activeSheetTable: null, activeGroupName: null } as const;

export function PageBar({ system }: { system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const activePage = useWorld(s => s.activePage);
  const activeBlock = useWorld(s => s.activeBlock);
  const shown = activeBlock ? pageOfBlock(system, activeBlock) : activePage;
  const pages = pagesOf(system);
  const ordered = [...pages.filter(page => page.top), ...pages.filter(page => !page.top)];
  return (
    <div className="inline inline--tight page-bar">
      {ordered.map(page => (
        <Button key={page.name} size="sm" variant={page.name === shown ? 'primary' : 'ghost'}
          onClick={() => pick({ ...OPEN_PAGE, activePage: page.name })}>
          {page.icon ? `${page.icon} ` : ''}{page.name}{page.top ? ' · шапка' : ''}
        </Button>
      ))}
      <Button size="sm" onClick={() => {
        const name = freePageName(useWorld.getState().system);
        editSystem(draft => addPage(draft, name));
        pick({ ...OPEN_PAGE, activePage: name });
      }}>+ страница</Button>
    </div>
  );
}
