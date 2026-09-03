import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorld, emptySystem } from '../../store/world.ts';
import { Button, Card, CardHead, Empty, Verdict } from '../../ui/primitives.tsx';
import { listSystems, getSystem, listCompendiums, getCompendium } from '../../api/client.ts';
import type { CompendiumSummary, SystemSummary } from '@vtt/schema';

type Mode = 'edit' | 'copy' | null;

const when = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU');

export function SystemStart() {
  const replaceWorld = useWorld(s => s.replaceWorld);
  const setOrigin = useWorld(s => s.setOrigin);
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>(null);
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [trouble, setTrouble] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    listSystems().then(setSystems).catch(err => setTrouble((err as Error).message));
  }, [mode]);

  const blank = () => {
    replaceWorld({ system: emptySystem(), compendium: { items: [], actions: [] }, sheets: [] });
    setOrigin({ kind: 'blank', systemId: undefined, systemTitle: undefined, compendiumId: undefined, compendiumTitle: undefined });
    navigate('/author/system');
  };

  const open = async (summary: SystemSummary) => {
    try {
      const saved = await getSystem(summary.id);
      const copy = mode === 'copy';
      const system = copy
        ? { ...saved.system, name: `${saved.system.name ?? saved.title} — копия` }
        : saved.system;
      replaceWorld({ system, compendium: { items: [], actions: [] }, sheets: [] });
      setOrigin(copy
        ? { kind: 'copy', systemId: undefined, systemTitle: saved.title, compendiumId: undefined, compendiumTitle: undefined }
        : { kind: 'edit', systemId: saved.id, systemTitle: saved.title, compendiumId: undefined, compendiumTitle: undefined });
      navigate('/author/system');
    } catch (err) { setTrouble((err as Error).message); }
  };

  return (
    <div className="start">
      <h1 className="start__title">С чего начнём?</h1>
      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}

      <div className="roles__grid">
        <button type="button" className={`role${mode === 'edit' ? ' role--active' : ''}`}
          onClick={() => setMode('edit')}>
          <span className="role__name">Продолжить существующую</span>
          <span className="role__hint">Открыть опубликованную систему и править дальше.</span>
        </button>

        <button type="button" className={`role${mode === 'copy' ? ' role--active' : ''}`}
          onClick={() => setMode('copy')}>
          <span className="role__name">Сделать копию</span>
          <span className="role__hint">Взять чужую или свою за основу — оригинал останется нетронутым.</span>
        </button>

        <button type="button" className="role" onClick={blank}>
          <span className="role__name">Начать с нуля</span>
          <span className="role__hint">Пустой лист: поля, словари и эффекты заводите сами.</span>
        </button>
      </div>

      {mode ? (
        <Card>
          <CardHead
            title={mode === 'edit' ? 'Какую систему открыть' : 'С какой системы снять копию'}
            sub={mode === 'copy' ? 'Копия живёт отдельно: правки не заденут исходную.' : undefined}
          />
          {systems.length === 0
            ? <Empty title="Опубликованных систем пока нет" hint="Начните с нуля — первая появится, когда вы её опубликуете." />
            : (
              <div className="start__list">
                {systems.map(item => (
                  <button key={item.id} type="button" className="start__item" onClick={() => void open(item)}>
                    <span className="start__item-name">{item.title}</span>
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
  const [trouble, setTrouble] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    listCompendiums(origin.systemId)
      .then(setBooks)
      .catch(err => setTrouble((err as Error).message));
  }, [mode, origin.systemId]);

  const blank = () => {
    replaceWorld({ system, compendium: { items: [], actions: [] }, sheets });
    setOrigin({ compendiumId: undefined, compendiumTitle: undefined });
    navigate('/author/compendium');
  };

  const open = async (summary: CompendiumSummary) => {
    try {
      const saved = await getCompendium(summary.id);
      const copy = mode === 'copy';
      replaceWorld({ system, compendium: saved.compendium, sheets });
      setOrigin(copy
        ? { compendiumId: undefined, compendiumTitle: `${saved.title} — копия` }
        : { compendiumId: saved.id, compendiumTitle: saved.title });
      navigate('/author/compendium');
    } catch (err) { setTrouble((err as Error).message); }
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
          <span className="role__name">Продолжить существующий</span>
          <span className="role__hint">Открыть опубликованный компендиум и дополнить.</span>
        </button>

        <button type="button" className={`role${mode === 'copy' ? ' role--active' : ''}`}
          onClick={() => setMode('copy')}>
          <span className="role__name">Сделать копию</span>
          <span className="role__hint">Взять готовый набор вещей за основу.</span>
        </button>

        <button type="button" className="role" onClick={blank}>
          <span className="role__name">Начать с нуля</span>
          <span className="role__hint">Пустой список — заводите записи сами.</span>
        </button>
      </div>

      {mode ? (
        <Card>
          <CardHead
            title={mode === 'edit' ? 'Какой компендиум открыть' : 'С какого снять копию'}
            sub={origin.systemId ? undefined : 'Система ещё не опубликована — показаны все компендиумы.'}
          />
          {books.length === 0
            ? <Empty title="Компендиумов пока нет" hint="Начните с нуля — он появится здесь после публикации." />
            : (
              <div className="start__list">
                {books.map(item => (
                  <button key={item.id} type="button" className="start__item" onClick={() => void open(item)}>
                    <span className="start__item-name">{item.title}</span>
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
