import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorld, emptySystem, publicationOf } from '../../store/world.ts';
import { Button, DangerButton, Card, CardHead, Empty, Fold, Input, Segmented, Verdict } from '../../ui/primitives.tsx';
import { RowsTable } from '../../ui/layout.tsx';
import { stampOf } from '../../ui/stamp.ts';
import { listSystems, getSystem, createSystem, deleteSystem } from '../../api/client.ts';
import { rememberVersion, markClean } from '../../store/autosave.ts';
import type { SystemSummary } from '@vtt/schema';

type Mode = 'edit' | 'copy' | 'blank' | null;

type Order = 'time' | 'title' | 'author';

const ORDERS = [
  { key: 'time', label: 'по времени' },
  { key: 'title', label: 'по названию' },
  { key: 'author', label: 'по автору' },
] as const;

const byText = (x: string, y: string): number => x.localeCompare(y, 'ru');

export function sortSystems(items: readonly SystemSummary[], order: Order): SystemSummary[] {
  return [...items].sort((x, y) =>
    (order === 'author' ? byText(x.authorName, y.authorName) : 0)
    || (order === 'time' ? y.updatedAt.localeCompare(x.updatedAt) : 0)
    || byText(x.title, y.title));
}

export const stateOf = (status: 'draft' | 'published', behind?: boolean): string =>
  status === 'published' ? (behind ? 'опубликована · есть правки' : 'опубликована') : 'черновик';

export function copyTitle(title: string, taken: readonly string[]): string {
  const base = `${title.replace(/ — копия(?: \d+)?$/u, '')} — копия`;
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
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
            sub={mode === 'copy' ? 'Копия берёт всё целиком, и чужое тоже. Нужны только куски — «Начать с нуля» и «Готовое из образцов».' : undefined}
            actions={<Segmented value={order} options={ORDERS} onChange={setOrder} />}
          />
          {shown.length === 0
            ? <Empty title="Систем пока нет" hint="Начните с нуля — она появится здесь сразу после создания." />
            : (
              <>
                <SystemList items={sortSystems(main, order)} busy={busy} act={mode === 'copy' ? 'Снять копию' : 'Открыть'} onOpen={item => void open(item)}
                  onRemove={mode === 'edit' ? remove : undefined} />
                {drafts.length ? (
                  <Fold title="Ваши черновики" count={drafts.length}>
                    <SystemList items={sortSystems(drafts, order)} busy={busy} act="Снять копию" onOpen={item => void open(item)} />
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
  return (
    <RowsTable
      columns={[
        { head: 'Система', width: 'minmax(0, 2fr)' },
        { head: 'Состояние', width: 'minmax(0, 1.5fr)', minor: true },
        { head: 'Автор', width: 'minmax(0, 1fr)', minor: true },
        { head: 'Изменена', width: '132px', minor: true },
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
            {onRemove && item.mine ? <DangerButton size="sm" onConfirm={() => onRemove(item)}>Удалить</DangerButton> : null}
          </>,
        ],
      }))}
    />
  );
}
