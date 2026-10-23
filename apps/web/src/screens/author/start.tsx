import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorld, emptySystem, publicationOf } from '../../store/world.ts';
import { Button, Card, CardHead, Empty, Fold, Input, Verdict } from '../../ui/primitives.tsx';
import { listSystems, getSystem, createSystem } from '../../api/client.ts';
import { rememberVersion, markClean } from '../../store/autosave.ts';
import type { SystemSummary } from '@vtt/schema';

type Mode = 'edit' | 'copy' | 'blank' | null;

const when = (iso: string): string => {
  const at = new Date(iso);
  return `${at.toLocaleDateString('ru-RU')}, ${at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
};

export function copyTitle(title: string, taken: readonly string[]): string {
  const base = `${title.replace(/ — копия(?: \d+)?$/u, '')} — копия`;
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function Status({ status, behind }: { status: 'draft' | 'published'; behind?: boolean }) {
  return status === 'published'
    ? <span className="tag tag--done">{behind ? 'опубликована · есть правки' : 'опубликована'}</span>
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
      rememberVersion({ system: saved.updatedAt, compendium: undefined });
      replaceWorld({ system: named, compendium: { records: [] }, sheets: [] });
      setOrigin({
        mode: 'system', systemId: saved.id, systemTitle: name, systemMine: true, publication: 'draft',
        compendiumId: undefined, compendiumTitle: undefined, lesson: undefined,
      });
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

  const shown = mode === 'edit' ? systems.filter(item => item.mine !== false) : systems;
  const main = mode === 'copy' ? shown.filter(item => item.status === 'published') : shown;
  const drafts = mode === 'copy' ? shown.filter(item => item.status !== 'published') : [];

  return (
    <div className="start__scroll"><div className="start">
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
          <span className="role__hint">Пустая система: берёте готовые куски или заводите всё сами.</span>
        </button>
      </div>

      {mode === 'blank' ? (
        <Card>
          <CardHead title="Как назовём систему" sub="Имя можно поменять потом — оно нужно, чтобы система нашлась в списке." />
          <div className="gate__form">
            <Input value={title} onChange={setTitle}
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
          {shown.length === 0
            ? <Empty title="Систем пока нет" hint="Начните с нуля — она появится здесь сразу после создания." />
            : (
              <>
                <SystemList items={main} busy={busy} onOpen={item => void open(item)} />
                {drafts.length ? (
                  <Fold title="Ваши черновики" count={drafts.length}>
                    <SystemList items={drafts} busy={busy} onOpen={item => void open(item)} />
                  </Fold>
                ) : null}
              </>
            )}
        </Card>
      ) : null}
    </div></div>
  );
}

function SystemList({ items, busy, onOpen }: {
  items: SystemSummary[];
  busy: boolean;
  onOpen: (item: SystemSummary) => void;
}) {
  return (
    <div className="start__list">
      {items.map(item => (
        <button key={item.id} type="button" className="start__item" disabled={busy} onClick={() => onOpen(item)}>
          <span className="start__item-head">
            <span className="start__item-name">{item.title}</span>
            <Status status={item.status} behind={item.behind} />
          </span>
          <span className="start__item-meta">{item.mine ? '' : `${item.authorName} · `}{when(item.updatedAt)}</span>
        </button>
      ))}
    </div>
  );
}
