import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorld } from '../../store/world.ts';
import { useSession } from '../../store/session.ts';
import { rememberVersion } from '../../store/autosave.ts';
import { Button, Card, CardHead, Empty, Input, Verdict } from '../../ui/primitives.tsx';
import {
  listSystems, getSystem, listCompendiums, getCompendium, createCompendium,
} from '../../api/client.ts';
import type { Compendium, CompendiumSummary, SystemSummary } from '@vtt/schema';

const when = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU');
const EMPTY: Compendium = { items: [], actions: [] };

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

  const open = async (summary: CompendiumSummary, copy: boolean) => {
    if (!chosen) return;
    setBusy(true);
    try {
      const saved = await getCompendium(summary.id);
      if (copy) {
        const name = `${saved.title} — копия`;
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
    <div className="start">
      <h1 className="start__title">Компендиум — для какой системы?</h1>
      <p className="start__lead">
        Компендиум наполняет готовую систему вещами. Система может быть чужой — важно только,
        чтобы она была опубликована: из её родов записей и берутся поля вещей.
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
          <CardHead title="Опубликованные системы" />
          {systems.length === 0
            ? <Empty title="Опубликованных систем нет" hint="Компендиум пишется к готовой системе — сперва её должен кто-то опубликовать." />
            : (
              <div className="start__list">
                {systems.map(item => (
                  <button key={item.id} type="button" className="start__item"
                    disabled={busy} onClick={() => void pickSystem(item)}>
                    <span className="start__item-name">{item.title}</span>
                    <span className="start__item-meta">{item.authorName} · {when(item.updatedAt)}</span>
                  </button>
                ))}
              </div>
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
            <CardHead title="Или продолжить существующий" />
            {books.length === 0
              ? <Empty title="Компендиумов для этой системы нет" hint="Заведите первый — он появится здесь." />
              : (
                <div className="start__list">
                  {books.map(item => (
                    <div key={item.id} className="start__item start__item--row">
                      <span className="start__item-head">
                        <span className="start__item-name">{item.title}</span>
                        <span className={`tag${item.status === 'published' ? ' tag--done' : ''}`}>
                          {item.status === 'published' ? 'опубликован' : 'черновик'}
                        </span>
                      </span>
                      <span className="start__item-meta">
                        {item.authorName} · записей: {item.itemCount} · {when(item.updatedAt)}
                      </span>
                      <span className="start__item-actions">
                        <Button size="sm" disabled={busy} onClick={() => void open(item, false)}>открыть</Button>
                        <Button size="sm" variant="ghost" disabled={busy}
                          onClick={() => void open(item, true)}>копия</Button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
