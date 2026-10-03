import { useEffect, useState } from 'react';
import { Button, Card, CardHead, Empty, Input, Verdict } from '../../ui/primitives.tsx';
import { listSystems, listCompendiums, publishWorld } from '../../api/client.ts';
import type { CompendiumSummary, SystemSummary } from '@vtt/schema';

export function BuildWorld({ onBuilt }: { onBuilt: () => void }) {
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
        title="Собрать мир"
        sub="Мир — это система плюс выбранные компендиумы. Из него потом делается стол."
      />

      {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}
      {done ? <Verdict tone="ok">Мир «{done}» собран — он в списке ниже.</Verdict> : null}

      {system === null ? (
        systems.length === 0
          ? <Empty title="Опубликованных систем нет" hint="Мир собирается из опубликованной системы — сперва её должен кто-то опубликовать." />
          : (
            <div className="stack stack--tight">
              <span className="field__label">Из какой системы</span>
              <div className="rooms">
              {systems.map(item => (
                <button key={item.id} type="button" className="room room--system" onClick={() => { setSystem(item); setTitle(item.title); }}>
                  <span className="room__name">{item.title}</span>
                  <span className="room__meta">{item.authorName}</span>
                </button>
              ))}
              </div>
            </div>
          )
      ) : (
        <div className="stack">
          <Verdict tone="ok" action={
            <Button size="sm" variant="ghost" onClick={() => { setSystem(null); setBooks([]); setChosen([]); }}>
              другая система
            </Button>
          }>
            Система: <b>{system.title}</b>
          </Verdict>

          <div className="stack stack--tight">
            <span className="field__label">Какие компендиумы взять</span>
            {books.length === 0
              ? <span className="faint">
                  Опубликованных компендиумов для этой системы нет — мир соберётся без вещей.
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
                    <span className="faint"> · {book.authorName} · записей: {book.itemCount}</span>
                  </span>
                </label>
              ))}
          </div>

          <div className="gate__form">
            <Input value={title} onChange={setTitle} placeholder="название мира" />
            <Button variant="primary" disabled={busy} onClick={() => void build()}>
              {busy ? 'собираем…' : 'Собрать мир'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
