import { useEffect, useState } from 'react';
import { Button, Card, CardHead, Empty, Input, Verdict } from '../../ui/primitives.tsx';
import { RowsTable } from '../../ui/layout.tsx';
import { listSystems, listCompendiums, publishWorld } from '../../api/client.ts';
import type { CompendiumSummary, SystemSummary } from '@vtt/schema';
import { Trans, useT } from '../../i18n/play.ts';

export function BuildWorld({ onBuilt }: { onBuilt: () => void }) {
  const t = useT('play');
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [system, setSystem] = useState<SystemSummary | null>(null);
  const [books, setBooks] = useState<CompendiumSummary[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    listSystems()
      .then(all => setSystems(all.filter(item => item.status === 'published')))
      .catch(err => setTrouble((err as Error).message));
  }, []);

  useEffect(() => {
    if (!system) return;
    listCompendiums(system.id)
      .then(all => setBooks(all.filter(item => item.status === 'published')))
      .catch(err => setTrouble((err as Error).message));
  }, [system]);

  const build = async () => {
    if (!system) return;
    setBusy(true);
    setTrouble(null);
    try {
      await publishWorld(title.trim() || system.title, system.id, chosen, []);
      setDone(title.trim() || system.title);
      setSystem(null);
      setChosen([]);
      onBuilt();
    } catch (err) {
      setTrouble((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHead
        title={t('build.title')}
        sub={t('build.sub')}
      />

      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}
      {done ? <Verdict tone="ok">{t('build.built', { name: done })}</Verdict> : null}

      {system === null ? (
        systems.length === 0
          ? <Empty title={t('build.noSystems.title')} hint={t('build.noSystems.hint')} />
          : (
            <div className="stack stack--tight">
              <span className="field__label">{t('build.fromSystem')}</span>
              <RowsTable
                columns={[
                  { head: t('col.system'), width: 'minmax(0, 2fr)' },
                  { head: t('col.author'), width: 'minmax(0, 1fr)' },
                ]}
                rows={[...systems].sort((x, y) => x.title.localeCompare(y.title, 'ru')).map(item => ({
                  key: item.id,
                  onOpen: () => { setSystem(item); setTitle(item.title); },
                  cells: [item.title, item.authorName],
                }))}
              />
            </div>
          )
      ) : (
        <div className="stack">
          <Verdict tone="ok" action={
            <Button size="sm" variant="ghost" onClick={() => { setSystem(null); setBooks([]); setChosen([]); }}>
              {t('build.otherSystem')}
            </Button>
          }>
            <Trans i18nKey="play:build.system" values={{ title: system.title }} components={{ b: <b /> }} />
          </Verdict>

          <div className="stack stack--tight">
            <span className="field__label">{t('build.books')}</span>
            {books.length === 0
              ? <span className="faint">
                  {t('build.noBooks')}
                </span>
              : books.map(book => (
                <label key={book.id} className="inline">
                  <input
                    type="checkbox"
                    checked={chosen.includes(book.id)}
                    onChange={e => setChosen(ids =>
                      e.target.checked ? [...ids, book.id] : ids.filter(id => id !== book.id))}
                  />
                  <span className="spacer">
                    {book.title}
                    <span className="faint">{t('build.bookMeta', { author: book.authorName, n: book.itemCount })}</span>
                  </span>
                </label>
              ))}
          </div>

          <div className="gate__form">
            <Input value={title} onChange={setTitle} placeholder={t('build.namePlaceholder')} />
            <Button variant="primary" disabled={busy} onClick={() => void build()}>
              {busy ? t('build.busy') : t('build.submit')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
