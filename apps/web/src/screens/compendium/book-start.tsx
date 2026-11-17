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

type Order = 'time' | 'title' | 'author';

const ORDERS = [
  { key: 'time', label: 'по времени' },
  { key: 'title', label: 'по названию' },
  { key: 'author', label: 'по автору' },
] as const;

export function sortBooks(items: readonly CompendiumSummary[], order: Order): CompendiumSummary[] {
  return [...items].sort((x, y) =>
    (order === 'author' ? x.authorName.localeCompare(y.authorName, 'ru') : 0)
    || (order === 'time' ? y.updatedAt.localeCompare(x.updatedAt) : 0)
    || x.title.localeCompare(y.title, 'ru'));
}

const EMPTY: Compendium = { records: [] };

export function BookStart() {
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
      setTitle(`Книга · ${saved.title}`);
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  const create = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const saved = await createCompendium(title.trim() || `Книга · ${chosen.title}`, chosen.id, EMPTY);
      rememberVersion({ compendium: saved.updatedAt });
      setOrigin({ compendiumId: saved.id, compendiumTitle: title.trim() || `Книга · ${chosen.title}` });
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
      <h1 className="start__title">Компендиум — для какой системы?</h1>
      <p className="start__lead">
        Компендиум наполняет готовую систему вещами. Система может быть чужой — важно только,
        чтобы она была опубликована: из её книг-таблиц и берутся колонки вещей.
      </p>
      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}

      {chosen ? (
        <Verdict tone="ok" action={
          <Button size="sm" variant="ghost" onClick={() => { setChosen(null); setBooks([]); }}>
            выбрать другую
          </Button>
        }>
          Система: <b>{chosen.title}</b>
        </Verdict>
      ) : (
        <Card>
          <CardHead title="Опубликованные системы"
            actions={<Segmented value={systemOrder} options={ORDERS} onChange={setSystemOrder} />} />
          {systems.length === 0
            ? <Empty title="Опубликованных систем нет" hint="Компендиум пишется к готовой системе — сперва её должен кто-то опубликовать." />
            : (
              <RowsTable
                columns={[
                  { head: 'Система', width: 'minmax(0, 2fr)' },
                  { head: 'Автор', width: 'minmax(0, 1fr)', minor: true },
                  { head: 'Изменена', width: '132px', minor: true },
                  { head: '', width: 'auto' },
                ]}
                rows={sortSystems(systems, systemOrder).map(item => ({
                  key: item.id,
                  onOpen: busy ? undefined : () => void pickSystem(item),
                  cells: [
                    item.title,
                    item.authorName,
                    stampOf(item.updatedAt),
                    <Button size="sm" disabled={busy} onClick={() => void pickSystem(item)}>Выбрать</Button>,
                  ],
                }))}
              />
            )}
        </Card>
      )}

      {chosen ? (
        <>
          <Card>
            <CardHead title="Завести новый" />
            <div className="gate__form">
              <Input value={title} onChange={setTitle} placeholder={`Книга · ${chosen.title}`}
                onKeyDown={e => { if (e.key === 'Enter') void create(); }} />
              <Button variant="primary" disabled={busy} onClick={() => void create()}>
                {busy ? 'создаём…' : 'Создать'}
              </Button>
            </div>
          </Card>

          <Card>
            <CardHead title="Или продолжить существующий"
              actions={<Segmented value={bookOrder} options={ORDERS} onChange={setBookOrder} />} />
            {books.length === 0
              ? <Empty title="Компендиумов для этой системы нет" hint="Заведите первый — он появится здесь." />
              : (
                <RowsTable
                  columns={[
                    { head: 'Компендиум', width: 'minmax(0, 2fr)' },
                    { head: 'Состояние', width: 'minmax(0, 1fr)', minor: true },
                    { head: 'Автор', width: 'minmax(0, 1fr)', minor: true },
                    { head: 'Записей', width: '72px', minor: true },
                    { head: 'Изменён', width: '132px', minor: true },
                    { head: '', width: 'auto' },
                  ]}
                  rows={sortBooks(books, bookOrder).map(item => ({
                    key: item.id,
                    onOpen: busy ? undefined : () => void open(item, false),
                    cells: [
                      item.title,
                      item.status === 'published' ? 'опубликован' : 'черновик',
                      item.authorName,
                      item.itemCount,
                      stampOf(item.updatedAt),
                      <>
                        <Button size="sm" disabled={busy} onClick={() => void open(item, false)}>Открыть</Button>
                        <Button size="sm" disabled={busy} onClick={() => void open(item, true)}>Снять копию</Button>
                        {item.mine ? <DangerButton size="sm" onConfirm={() => remove(item)}>Удалить</DangerButton> : null}
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
