import { useWorld, freeId } from '../../store/world.ts';
import { Card, CardHead, Field, Button, DangerButton, LabelInput } from '../../ui/primitives.tsx';
import { pagesOf, pageOfBlock, pageLabel, labelPage, removePage } from '@vtt/engine';
import { moveKey } from '../../ui/pick-order.tsx';
import { useDragList } from '../../ui/drag-list.ts';
import { focusNew } from '../../ui/focus-new.ts';
import type { System } from '@vtt/schema';

export const FIRST_PAGE = 'Основное';

export function freePageTitle(system: System): string {
  const taken = new Set(pagesOf(system).map(page => pageLabel(system, page.key)));
  if (!taken.size) return FIRST_PAGE;
  for (let n = pagesOf(system).length + 1; ; n++) if (!taken.has(`Страница ${n}`)) return `Страница ${n}`;
}

export function addPage(draft: System, title: string): string {
  const key = freeId(pagesOf(draft).map(page => page.key), title);
  draft.pages = [...pagesOf(draft), { key }];
  labelPage(draft, key, title);
  return key;
}

export function movePage(draft: System, name: string, target: string, after: boolean): void {
  const pages = draft.pages ?? [];
  const order = moveKey(pages.map(page => page.key), name, target, after);
  draft.pages = order.map(key => pages.find(page => page.key === key)!);
}

export function setTop(draft: System, name: string, on: boolean): void {
  for (const page of draft.pages ?? []) {
    if (page.key === name) { if (on) page.top = true; else delete page.top; }
    else if (on) delete page.top;
  }
}

export function PagePanel({ name, system }: { name: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const pages = pagesOf(system);
  const drag = useDragList((key, to, after) => editSystem(draft => movePage(draft, key, to, after)), 'x');
  const page = pages.find(item => item.key === name);
  if (!page) return null;

  return (
    <Card>
      <CardHead
        title={<LabelInput value={pageLabel(system, name)} placeholder="как зовётся страница"
          onCommit={next => {
            const clean = next.trim();
            if (!clean || clean === pageLabel(system, name) || pages.some(other => other.key !== name && pageLabel(system, other.key) === clean)) return;
            editSystem(draft => labelPage(draft, name, clean));
          }} />}
        actions={<Button size="sm" variant="ghost" onClick={() => pick({ activePage: null })}>×</Button>} />
      <label className="inline inline--tight">
        <input type="checkbox" checked={page.top === true} onChange={event => editSystem(draft => setTop(draft, name, event.currentTarget.checked))} />
        Над закладками — видна всегда
      </label>
      <Field label="Порядок страниц">
        <div className="stack stack--tight block-pick">
          <span className="block-pick__title">перетащите, чтобы поменять порядок закладок</span>
          <div className="inline inline--tight">
            {pages.map(item => (
              <span key={item.key} className={`inline inline--tight drag-item${drag.mark(item.key)}`} {...drag.props(item.key)}>
                <span className="drag-grip" aria-hidden>⋮⋮</span>
                {item.key === name ? <b>{pageLabel(system, item.key)}</b> : pageLabel(system, item.key)}
              </span>
            ))}
          </div>
        </div>
      </Field>
      <div className="inline inline--tight">
        <DangerButton size="sm" onConfirm={() => { editSystem(draft => removePage(draft, name)); pick({ activePage: null }); }}>Удалить страницу</DangerButton>
      </div>
    </Card>
  );
}

export const OPEN_PAGE = { activeThing: null, activeBlock: null, activeFieldTag: null, activeColumn: null, activeRow: null, activeSheetTable: null, activeGroupName: null } as const;

export function PageBar({ system }: { system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const activePage = useWorld(s => s.activePage);
  const activeBlock = useWorld(s => s.activeBlock);
  const shown = activeBlock ? pageOfBlock(system, activeBlock) : activePage;
  const pages = pagesOf(system);
  return (
    <div className="inline inline--tight page-bar">
      {pages.filter(page => page.top).map(page => (
        <Button key={page.key} size="sm" variant={page.key === shown ? 'primary' : 'ghost'}
          onClick={() => pick({ ...OPEN_PAGE, activePage: page.key })}>
          над закладками: {pageLabel(system, page.key)}
        </Button>
      ))}
      <Button size="sm" onClick={() => {
        focusNew('как зовётся страница');
        const title = freePageTitle(useWorld.getState().system);
        let key = '';
        editSystem(draft => { key = addPage(draft, title); });
        pick({ ...OPEN_PAGE, activePage: key });
      }}>+ страница</Button>
    </div>
  );
}
