import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorld } from '../../store/world.ts';
import { useSession } from '../../store/session.ts';
import { rememberVersion } from '../../store/autosave.ts';
import { Button, DangerButton, Card, CardHead, Empty, Input, Segmented, Verdict } from '../../ui/primitives.tsx';
import { RowsTable } from '../../ui/layout.tsx';
import { stampOf } from '../../ui/stamp.ts';
import { copyTitle, sortSystems } from '../author/start.tsx';
import {
  listSystems, getSystem, listCompendiums, getCompendium, createCompendium, deleteCompendium,
} from '../../api/client.ts';
import type { Compendium, CompendiumSummary, SystemSummary } from '@vtt/schema';
import { Trans, dataT, t as tNow, useT } from '../../i18n/author.ts';

type Order = 'time' | 'title' | 'author';

const orders = (): { key: Order; label: string }[] => [
  { key: 'time', label: tNow('book:order.time') },
  { key: 'title', label: tNow('book:order.title') },
  { key: 'author', label: tNow('book:order.author') },
];

export function sortBooks(items: readonly CompendiumSummary[], order: Order): CompendiumSummary[] {
  return [...items].sort((x, y) =>
    (order === 'author' ? x.authorName.localeCompare(y.authorName, 'ru') : 0)
    || (order === 'time' ? y.updatedAt.localeCompare(x.updatedAt) : 0)
    || x.title.localeCompare(y.title, 'ru'));
}

const EMPTY: Compendium = { records: [] };

export function BookStart() {
  const t = useT('book');
  const system = useWorld(s => s.system);
  const sheets = useWorld(s => s.sheets);
  const me = useSession(s => s.name);
  const replaceWorld = useWorld(s => s.replaceWorld);
  const setOrigin = useWorld(s => s.setOrigin);
  const navigate = useNavigate();

  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [chosen, setChosen] = useState<{ id: string; title: string } | null>(null);
  const [books, setBooks] = useState<CompendiumSummary[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [systemOrder, setSystemOrder] = useState<Order>('time');
  const [bookOrder, setBookOrder] = useState<Order>('time');

  useEffect(() => {
    listSystems()
      .then(all => setSystems(all.filter(item => item.status === 'published')))
      .catch(err => setTrouble((err as Error).message));
  }, []);

  useEffect(() => {
    if (!chosen) return;
    listCompendiums(chosen.id).then(setBooks).catch(err => setTrouble((err as Error).message));
  }, [chosen]);

  const pickSystem = async (summary: SystemSummary) => {
    setBusy(true);
    setTrouble(null);
    try {
      const saved = await getSystem(summary.id);
      replaceWorld({ system: saved.system, compendium: EMPTY, sheets });
      setOrigin({
        mode: 'compendium', systemId: saved.id, systemTitle: saved.title,
        systemMine: summary.authorName === me,
        compendiumId: undefined, compendiumTitle: undefined,
      });
      setChosen({ id: saved.id, title: saved.title });
      setTitle(dataT(saved.system)('book:start.newTitle', { name: saved.title }));
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  const create = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const td = dataT(useWorld.getState().system);
      const name = title.trim() || td('book:start.newTitle', { name: chosen.title });
      const saved = await createCompendium(name, chosen.id, EMPTY);
      rememberVersion({ compendium: saved.updatedAt });
      setOrigin({ compendiumId: saved.id, compendiumTitle: name });
      navigate('/book/edit');
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  const remove = (summary: CompendiumSummary) => {
    if (!chosen) return;
    setTrouble(null);
    deleteCompendium(summary.id)
      .then(() => listCompendiums(chosen.id))
      .then(setBooks)
      .catch(err => setTrouble((err as Error).message));
  };

  const open = async (summary: CompendiumSummary, copy: boolean) => {
    if (!chosen) return;
    setBusy(true);
    try {
      const saved = await getCompendium(summary.id);
      if (copy) {
        const name = copyTitle(saved.title, books.map(item => item.title));
        const made = await createCompendium(name, chosen.id, saved.compendium);
        rememberVersion({ compendium: made.updatedAt });
        replaceWorld({ system: useWorld.getState().system, compendium: saved.compendium, sheets });
        setOrigin({ compendiumId: made.id, compendiumTitle: name });
      } else {
        rememberVersion({ compendium: saved.updatedAt });
        replaceWorld({ system: useWorld.getState().system, compendium: saved.compendium, sheets });
        setOrigin({ compendiumId: saved.id, compendiumTitle: saved.title });
      }
      navigate('/book/edit');
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="start__scroll"><div className="start">
      <h1 className="start__title">{t('start.title')}</h1>
      <p className="start__lead">
        {t('start.lead')}
      </p>
      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}

      {chosen ? (
        <Verdict tone="ok" action={
          <Button size="sm" variant="ghost" onClick={() => { setChosen(null); setBooks([]); }}>
            {t('start.chooseOther')}
          </Button>
        }>
          <Trans i18nKey="book:start.system" values={{ name: chosen.title }} components={{ b: <b /> }} />
        </Verdict>
      ) : (
        <Card>
          <CardHead title={t('start.published')}
            actions={<Segmented value={systemOrder} options={orders()} onChange={setSystemOrder} />} />
          {systems.length === 0
            ? <Empty title={t('start.noSystems.title')} hint={t('start.noSystems.hint')} />
            : (
              <RowsTable
                columns={[
                  { head: t('start.head.system'), width: 'minmax(0, 2fr)' },
                  { head: t('start.head.author'), width: 'minmax(0, 1fr)', minor: true },
                  { head: t('start.head.changed'), width: '132px', minor: true },
                  { head: '', width: 'auto' },
                ]}
                rows={sortSystems(systems, systemOrder).map(item => ({
                  key: item.id,
                  onOpen: busy ? undefined : () => void pickSystem(item),
                  cells: [
                    item.title,
                    item.authorName,
                    stampOf(item.updatedAt),
                    <Button size="sm" disabled={busy} onClick={() => void pickSystem(item)}>{t('start.pick')}</Button>,
                  ],
                }))}
              />
            )}
        </Card>
      )}

      {chosen ? (
        <>
          <Card>
            <CardHead title={t('start.newHead')} />
            <div className="gate__form">
              <Input value={title} onChange={setTitle} placeholder={dataT(system)('book:start.newTitle', { name: chosen.title })}
                onKeyDown={e => { if (e.key === 'Enter') void create(); }} />
              <Button variant="primary" disabled={busy} onClick={() => void create()}>
                {busy ? t('start.creating') : t('start.create')}
              </Button>
            </div>
          </Card>

          <Card>
            <CardHead title={t('start.existing')}
              actions={<Segmented value={bookOrder} options={orders()} onChange={setBookOrder} />} />
            {books.length === 0
              ? <Empty title={t('start.noBooks.title')} hint={t('start.noBooks.hint')} />
              : (
                <RowsTable
                  columns={[
                    { head: t('start.head.book'), width: 'minmax(0, 2fr)' },
                    { head: t('start.head.state'), width: 'minmax(0, 1fr)', minor: true },
                    { head: t('start.head.author'), width: 'minmax(0, 1fr)', minor: true },
                    { head: t('start.head.items'), width: '72px', minor: true },
                    { head: t('start.head.bookChanged'), width: '132px', minor: true },
                    { head: '', width: 'auto' },
                  ]}
                  rows={sortBooks(books, bookOrder).map(item => ({
                    key: item.id,
                    onOpen: busy ? undefined : () => void open(item, false),
                    cells: [
                      item.title,
                      item.status === 'published' ? t('start.state.published') : t('start.state.draft'),
                      item.authorName,
                      item.itemCount,
                      stampOf(item.updatedAt),
                      <>
                        <Button size="sm" disabled={busy} onClick={() => void open(item, false)}>{t('start.open')}</Button>
                        <Button size="sm" disabled={busy} onClick={() => void open(item, true)}>{t('start.copy')}</Button>
                        {item.mine ? <DangerButton size="sm" onConfirm={() => remove(item)}>{t('common:delete')}</DangerButton> : null}
                      </>,
                    ],
                  }))}
                />
              )}
          </Card>
        </>
      ) : null}
    </div></div>
  );
}
