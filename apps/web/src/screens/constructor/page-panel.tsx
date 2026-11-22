import { useWorld } from '../../store/world.ts';
import { Card, CardHead, Field, Button, DangerButton, LabelInput } from '../../ui/primitives.tsx';
import { pagesOf, pageOfBlock, renamePage, removePage } from '@vtt/engine';
import { moveKey } from '../../ui/pick-order.tsx';
import { useDragList } from '../../ui/drag-list.ts';
import { focusNew } from '../../ui/focus-new.ts';
import { followInstance } from './instance.ts';
import type { System } from '@vtt/schema';

export const FIRST_PAGE = 'Основное';

export function freePageName(system: System): string {
  const taken = new Set(pagesOf(system).map(page => page.name));
  if (!taken.size) return FIRST_PAGE;
  for (let n = pagesOf(system).length + 1; ; n++) if (!taken.has(`Страница ${n}`)) return `Страница ${n}`;
}

export function addPage(draft: System, name: string): void {
  draft.pages = [...pagesOf(draft), { name }];
}

export function movePage(draft: System, name: string, target: string, after: boolean): void {
  const pages = draft.pages ?? [];
  const order = moveKey(pages.map(page => page.name), name, target, after);
  draft.pages = order.map(key => pages.find(page => page.name === key)!);
}

export function setTop(draft: System, name: string, on: boolean): void {
  for (const page of draft.pages ?? []) {
    if (page.name === name) { if (on) page.top = true; else delete page.top; }
    else if (on) delete page.top;
  }
}

export function PagePanel({ name, system }: { name: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const pages = pagesOf(system);
  const drag = useDragList((key, to, after) => editSystem(draft => movePage(draft, key, to, after)), 'x');
  const page = pages.find(item => item.name === name);
  if (!page) return null;

  return (
    <Card>
      <CardHead
        title={<LabelInput value={page.name} placeholder="как зовётся страница"
          onCommit={next => {
            const clean = next.trim();
            if (!clean || clean === name || pages.some(other => other.name === clean)) return;
            editSystem(draft => renamePage(draft, name, clean));
            followInstance('страница', name, clean);
            pick({ activePage: clean });
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
              <span key={item.name} className={`inline inline--tight drag-item${drag.mark(item.name)}`} {...drag.props(item.name)}>
                <span className="drag-grip" aria-hidden>⋮⋮</span>
                {item.name === name ? <b>{item.name}</b> : item.name}
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
        <Button key={page.name} size="sm" variant={page.name === shown ? 'primary' : 'ghost'}
          onClick={() => pick({ ...OPEN_PAGE, activePage: page.name })}>
          над закладками: {page.name}
        </Button>
      ))}
      <Button size="sm" onClick={() => {
        focusNew('как зовётся страница');
        const name = freePageName(useWorld.getState().system);
        editSystem(draft => addPage(draft, name));
        pick({ ...OPEN_PAGE, activePage: name });
      }}>+ страница</Button>
    </div>
  );
}
