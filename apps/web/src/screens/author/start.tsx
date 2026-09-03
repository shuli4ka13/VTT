import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorld, emptySystem } from '../../store/world.ts';
import { Button, Card, CardHead, Empty, Input, Verdict } from '../../ui/primitives.tsx';
import {
  listSystems, getSystem, createSystem,
  listCompendiums, getCompendium, createCompendium,
} from '../../api/client.ts';
import type { CompendiumSummary, SystemSummary } from '@vtt/schema';

type Mode = 'edit' | 'copy' | 'blank' | null;

const when = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU');

function Status({ status }: { status: 'draft' | 'published' }) {
  return status === 'published'
    ? <span className="tag tag--done">опубликована</span>
    : <span className="tag">черновик</span>;
}

export function SystemStart() {
  const replaceWorld = useWorld(s => s.replaceWorld);
  const setOrigin = useWorld(s => s.setOrigin);
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>(null);
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);

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
      replaceWorld({ system: named, compendium: { items: [], actions: [] }, sheets: [] });
      setOrigin({
        kind: 'edit', systemId: saved.id, systemTitle: name,
        compendiumId: undefined, compendiumTitle: undefined,
      });
      navigate('/author/system');
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  const open = async (summary: SystemSummary) => {
    if (mode === 'copy') {
      const saved = await getSystem(summary.id);
      return start(`${saved.title} — копия`, saved.system);
    }
    setBusy(true);
    try {
      const saved = await getSystem(summary.id);
      replaceWorld({ system: saved.system, compendium: { items: [], actions: [] }, sheets: [] });
      setOrigin({
        kind: 'edit', systemId: saved.id, systemTitle: saved.title,
        compendiumId: undefined, compendiumTitle: undefined,
      });
      navigate('/author/system');
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="start">
      <h1 className="start__title">С чего начнём?</h1>
      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}

      <div className="roles__grid">
        <button type="button" className={`role${mode === 'edit' ? ' role--active' : ''}`}
          onClick={() => setMode('edit')}>
          <span className="role__name">Продолжить работу</span>
          <span className="role__hint">Открыть свою систему — черновик или уже опубликованную.</span>
        </button>

        <button type="button" className={`role${mode === 'copy' ? ' role--active' : ''}`}
          onClick={() => setMode('copy')}>
          <span className="role__name">Сделать копию</span>
          <span className="role__hint">Взять чужую или свою за основу — оригинал останется нетронутым.</span>
        </button>

        <button type="button" className={`role${mode === 'blank' ? ' role--active' : ''}`}
          onClick={() => setMode('blank')}>
          <span className="role__name">Начать с нуля</span>
          <span className="role__hint">Пустой лист: поля, словари и эффекты заводите сами.</span>
        </button>
      </div>

      {mode === 'blank' ? (
        <Card>
          <CardHead title="Как назовём систему" sub="Имя можно поменять потом — оно нужно, чтобы система нашлась в списке." />
          <div className="gate__form">
            <Input value={title} onChange={setTitle} placeholder="например: Полынь и порох"
              onKeyDown={e => { if (e.key === 'Enter' && title.trim()) void start(title.trim()); }} />
            <Button variant="primary" disabled={!title.trim() || busy}
              onClick={() => void start(title.trim())}>
              {busy ? 'создаём…' : 'Создать'}
            </Button>
          </div>
        </Card>
      ) : null}

      {mode === 'edit' || mode === 'copy' ? (
        <Card>
          <CardHead
            title={mode === 'edit' ? 'Что открыть' : 'С чего снять копию'}
            sub={mode === 'copy' ? 'Копия сохранится отдельной системой: правки не заденут исходную.' : undefined}
          />
          {systems.length === 0
            ? <Empty title="Систем пока нет" hint="Начните с нуля — она появится здесь сразу после создания." />
            : (
              <div className="start__list">
                {systems.map(item => (
                  <button key={item.id} type="button" className="start__item"
                    disabled={busy} onClick={() => void open(item)}>
                    <span className="start__item-head">
                      <span className="start__item-name">{item.title}</span>
                      <Status status={item.status} />
                    </span>
                    <span className="start__item-meta">{item.authorName} · {when(item.updatedAt)}</span>
                  </button>
                ))}
              </div>
            )}
        </Card>
      ) : null}
    </div>
  );
}

export function CompendiumStart() {
  const system = useWorld(s => s.system);
  const sheets = useWorld(s => s.sheets);
  const origin = useWorld(s => s.origin);
  const replaceWorld = useWorld(s => s.replaceWorld);
  const setOrigin = useWorld(s => s.setOrigin);
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>(null);
  const [books, setBooks] = useState<CompendiumSummary[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' && mode !== 'copy') return;
    listCompendiums(origin.systemId)
      .then(setBooks)
      .catch(err => setTrouble((err as Error).message));
  }, [mode, origin.systemId]);

  const start = async (name: string, book = { items: [], actions: [] }) => {
    if (!origin.systemId) return setTrouble('сначала создайте или откройте систему');
    setBusy(true);
    setTrouble(null);
    try {
      const saved = await createCompendium(name, origin.systemId, book);
      replaceWorld({ system, compendium: book, sheets });
      setOrigin({ compendiumId: saved.id, compendiumTitle: name });
      navigate('/author/compendium');
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  const open = async (summary: CompendiumSummary) => {
    const saved = await getCompendium(summary.id);
    if (mode === 'copy') return start(`${saved.title} — копия`, saved.compendium as never);
    setBusy(true);
    try {
      replaceWorld({ system, compendium: saved.compendium, sheets });
      setOrigin({ compendiumId: saved.id, compendiumTitle: saved.title });
      navigate('/author/compendium');
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="start">
      <h1 className="start__title">Компендиум для «{system.name}»</h1>
      <p className="start__lead">
        Компендиум — вещи мира: оружие, заклинания, доспехи. Механику они берут из эффектов системы.
      </p>
      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}

      <div className="roles__grid">
        <button type="button" className={`role${mode === 'edit' ? ' role--active' : ''}`}
          onClick={() => setMode('edit')}>
          <span className="role__name">Продолжить работу</span>
          <span className="role__hint">Открыть черновик или опубликованный компендиум.</span>
        </button>

        <button type="button" className={`role${mode === 'copy' ? ' role--active' : ''}`}
          onClick={() => setMode('copy')}>
          <span className="role__name">Сделать копию</span>
          <span className="role__hint">Взять готовый набор вещей за основу.</span>
        </button>

        <button type="button" className={`role${mode === 'blank' ? ' role--active' : ''}`}
          onClick={() => setMode('blank')}>
          <span className="role__name">Начать с нуля</span>
          <span className="role__hint">Пустой список — заводите записи сами.</span>
        </button>
      </div>

      {mode === 'blank' ? (
        <Card>
          <CardHead title="Как назовём компендиум" />
          <div className="gate__form">
            <Input value={title} onChange={setTitle} placeholder={`Компендиум · ${system.name}`}
              onKeyDown={e => { if (e.key === 'Enter') void start(title.trim() || `Компендиум · ${system.name}`); }} />
            <Button variant="primary" disabled={busy}
              onClick={() => void start(title.trim() || `Компендиум · ${system.name}`)}>
              {busy ? 'создаём…' : 'Создать'}
            </Button>
          </div>
        </Card>
      ) : null}

      {mode === 'edit' || mode === 'copy' ? (
        <Card>
          <CardHead title={mode === 'edit' ? 'Что открыть' : 'С чего снять копию'} />
          {books.length === 0
            ? <Empty title="Компендиумов пока нет" hint="Начните с нуля — он появится здесь сразу после создания." />
            : (
              <div className="start__list">
                {books.map(item => (
                  <button key={item.id} type="button" className="start__item"
                    disabled={busy} onClick={() => void open(item)}>
                    <span className="start__item-head">
                      <span className="start__item-name">{item.title}</span>
                      <Status status={item.status} />
                    </span>
                    <span className="start__item-meta">
                      {item.authorName} · записей: {item.itemCount} · {when(item.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}
        </Card>
      ) : null}
    </div>
  );
}
