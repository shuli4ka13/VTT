import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorld, emptySystem, publicationOf } from '../../store/world.ts';
import { Button, DangerButton, Card, CardHead, Empty, Fold, Input, Segmented, Verdict } from '../../ui/primitives.tsx';
import { RowsTable } from '../../ui/layout.tsx';
import { stampOf } from '../../ui/stamp.ts';
import { listSystems, getSystem, createSystem, deleteSystem } from '../../api/client.ts';
import { rememberVersion, markClean } from '../../store/autosave.ts';
import type { SystemSummary } from '@vtt/schema';
import { t, useT } from '../../i18n/index.ts';

type Mode = 'edit' | 'copy' | 'blank' | null;

type Order = 'time' | 'title' | 'author';

const ORDER_KEYS = ['time', 'title', 'author'] as const;

const byText = (x: string, y: string): number => x.localeCompare(y, 'ru');

export function sortSystems(items: readonly SystemSummary[], order: Order): SystemSummary[] {
  return [...items].sort((x, y) =>
    (order === 'author' ? byText(x.authorName, y.authorName) : 0)
    || (order === 'time' ? y.updatedAt.localeCompare(x.updatedAt) : 0)
    || byText(x.title, y.title));
}

export const stateOf = (status: 'draft' | 'published', behind?: boolean): string =>
  status === 'published' ? (behind ? t('author:state.publishedBehind') : t('author:state.published')) : t('author:state.draft');

export function copyTitle(title: string, taken: readonly string[]): string {
  const word = t('author:copySuffix');
  const base = `${title.replace(new RegExp(` — ${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: \\d+)?$`, 'u'), '')} — ${word}`;
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function SystemStart() {
  const replaceWorld = useWorld(s => s.replaceWorld);
  const setOrigin = useWorld(s => s.setOrigin);
  const navigate = useNavigate();
  const t = useT('author');
  const orders = ORDER_KEYS.map(key => ({ key, label: t(`order.${key}`) }));

  const [mode, setMode] = useState<Mode>(null);
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [order, setOrder] = useState<Order>('time');

  useEffect(() => {
    if (mode !== 'edit' && mode !== 'copy') return;
    listSystems().then(setSystems).catch(err => setTrouble((err as Error).message));
  }, [mode]);

  const start = async (name: string, system = emptySystem()) => {
    setBusy(true);
    setTrouble(null);
    try {
      const named = { ...system, name };
      const saved = await createSystem(name, named);
      rememberVersion({ system: saved.updatedAt, compendium: undefined });
      replaceWorld({ system: named, compendium: { records: [] }, sheets: [] });
      setOrigin({
        mode: 'system', systemId: saved.id, systemTitle: name, systemMine: true, publication: 'draft',
        compendiumId: undefined, compendiumTitle: undefined, lesson: undefined,
      });
      markClean();
      navigate('/author/system');
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  const open = async (summary: SystemSummary) => {
    if (mode === 'copy') {
      const saved = await getSystem(summary.id);
      return start(copyTitle(saved.title, systems.map(item => item.title)), saved.system);
    }
    setBusy(true);
    try {
      const saved = await getSystem(summary.id);
      rememberVersion({ system: saved.updatedAt, compendium: undefined });
      replaceWorld({ system: saved.system, compendium: { records: [] }, sheets: [] });
      setOrigin({
        mode: 'system', systemId: saved.id, systemTitle: saved.title, systemMine: true, publication: publicationOf(saved.behind),
        compendiumId: undefined, compendiumTitle: undefined, lesson: undefined,
      });
      markClean();
      navigate('/author/system');
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  const remove = (item: SystemSummary) => {
    setTrouble(null);
    deleteSystem(item.id)
      .then(() => listSystems())
      .then(setSystems)
      .catch(err => setTrouble((err as Error).message));
  };

  const shown = mode === 'edit' ? systems.filter(item => item.mine !== false) : systems;
  const main = mode === 'copy' ? shown.filter(item => item.status === 'published') : shown;
  const drafts = mode === 'copy' ? shown.filter(item => item.status !== 'published') : [];

  return (
    <div className="start__scroll"><div className="start">
      <h1 className="start__title">{t('title')}</h1>
      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}

      <div className="roles__grid">
        <button type="button" className={`role${mode === 'edit' ? ' role--active' : ''}`}
          onClick={() => setMode('edit')}>
          <span className="role__name">{t('continue.name')}</span>
          <span className="role__hint">{t('continue.hint')}</span>
        </button>

        <button type="button" className={`role${mode === 'copy' ? ' role--active' : ''}`}
          onClick={() => setMode('copy')}>
          <span className="role__name">{t('copy.name')}</span>
          <span className="role__hint">{t('copy.hint')}</span>
        </button>

        <button type="button" className={`role${mode === 'blank' ? ' role--active' : ''}`}
          onClick={() => setMode('blank')}>
          <span className="role__name">{t('blank.name')}</span>
          <span className="role__hint">{t('blank.hint')}</span>
        </button>
      </div>

      {mode === 'blank' ? (
        <Card>
          <CardHead title={t('naming.title')} sub={t('naming.sub')} />
          <div className="gate__form">
            <Input value={title} onChange={setTitle}
              onKeyDown={e => { if (e.key === 'Enter' && title.trim()) void start(title.trim()); }} />
            <Button variant="primary" disabled={!title.trim() || busy}
              onClick={() => void start(title.trim())}>
              {busy ? t('creating') : t('create')}
            </Button>
          </div>
        </Card>
      ) : null}

      {mode === 'edit' || mode === 'copy' ? (
        <Card>
          <CardHead
            title={mode === 'edit' ? t('list.openTitle') : t('list.copyTitle')}
            sub={mode === 'copy' ? t('list.copyHint') : undefined}
            actions={<Segmented value={order} options={orders} onChange={setOrder} />}
          />
          {shown.length === 0
            ? <Empty title={t('list.emptyTitle')} hint={t('list.emptyHint')} />
            : (
              <>
                <SystemList items={sortSystems(main, order)} busy={busy} act={mode === 'copy' ? t('act.copy') : t('act.open')} onOpen={item => void open(item)}
                  onRemove={mode === 'edit' ? remove : undefined} />
                {drafts.length ? (
                  <Fold title={t('list.drafts')} count={drafts.length}>
                    <SystemList items={sortSystems(drafts, order)} busy={busy} act={t('act.copy')} onOpen={item => void open(item)} />
                  </Fold>
                ) : null}
              </>
            )}
        </Card>
      ) : null}
    </div></div>
  );
}

function SystemList({ items, busy, act, onOpen, onRemove }: {
  items: SystemSummary[];
  busy: boolean;
  act: string;
  onOpen: (item: SystemSummary) => void;
  onRemove?: ((item: SystemSummary) => void) | undefined;
}) {
  const t = useT('author');
  return (
    <RowsTable
      columns={[
        { head: t('head.system'), width: 'minmax(0, 2fr)' },
        { head: t('head.state'), width: 'minmax(0, 1.5fr)', minor: true },
        { head: t('head.author'), width: 'minmax(0, 1fr)', minor: true },
        { head: t('head.changed'), width: '132px', minor: true },
        { head: '', width: 'auto' },
      ]}
      rows={items.map(item => ({
        key: item.id,
        onOpen: busy ? undefined : () => onOpen(item),
        cells: [
          item.title,
          stateOf(item.status, item.behind),
          item.authorName,
          stampOf(item.updatedAt),
          <>
            <Button size="sm" disabled={busy} onClick={() => onOpen(item)}>{act}</Button>
            {onRemove && item.mine ? <DangerButton size="sm" onConfirm={() => onRemove(item)}>{t('act.remove')}</DangerButton> : null}
          </>,
        ],
      }))}
    />
  );
}
