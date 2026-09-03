import { useState } from 'react';
import { NavLink } from 'react-router';
import { useWorld, takeRestoreProblem } from '../../store/world.ts';
import { useSession } from '../../store/session.ts';
import { Button, Input } from '../../ui/primitives.tsx';
import { ApiError, publishSystem, publishCompendium, publishWorld } from '../../api/client.ts';

export function WorldBar() {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const sheets = useWorld(s => s.sheets);
  const origin = useWorld(s => s.origin);
  const editSystem = useWorld(s => s.editSystem);
  const setOrigin = useWorld(s => s.setOrigin);
  const name = useSession(s => s.name);

  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(() => {
    const problem = takeRestoreProblem();
    return problem ? { text: `черновик не открылся (${problem})`, bad: true } : null;
  });

  const fail = (err: unknown) => {
    const issues = err instanceof ApiError && err.issues.length ? ` (${err.issues[0]})` : '';
    setNote({ text: (err as Error).message + issues, bad: true });
  };

  const saveSystem = async () => {
    try {
      const saved = await publishSystem(system.name ?? 'Без имени', system);
      setOrigin({ kind: 'edit', systemId: saved.id, systemTitle: system.name ?? 'Без имени' });
      setNote({ text: 'система опубликована', bad: false });
    } catch (err) { fail(err); }
  };

  const saveBook = async () => {
    if (!origin.systemId) return setNote({ text: 'сначала опубликуйте систему', bad: true });
    try {
      const title = origin.compendiumTitle ?? `Компендиум · ${system.name}`;
      const saved = await publishCompendium(title, origin.systemId, compendium);
      setOrigin({ compendiumId: saved.id, compendiumTitle: title });
      setNote({ text: 'компендиум опубликован', bad: false });
    } catch (err) { fail(err); }
  };

  const saveWorld = async () => {
    if (!origin.systemId) return setNote({ text: 'сначала опубликуйте систему', bad: true });
    try {
      const books = origin.compendiumId ? [origin.compendiumId] : [];
      await publishWorld(system.name ?? 'Без имени', origin.systemId, books, sheets);
      setNote({ text: `мир опубликован · компендиумов: ${books.length}`, bad: false });
    } catch (err) { fail(err); }
  };

  const state = origin.kind === 'edit' && origin.systemId
    ? `правим опубликованную «${origin.systemTitle}»`
    : origin.kind === 'copy'
      ? `копия «${origin.systemTitle}» — ещё не опубликована`
      : 'новая система — ещё не опубликована';

  return <div className="worldbar">
    <span className="field__label">Черновик</span>
    <div className="worldbar__name">
      <Input value={system.name ?? ''} onChange={next => editSystem(draft => { draft.name = next; })} />
    </div>
    <span className="worldbar__state">{state}</span>
    <NavLink className="topbar__link" to="/author/start">сменить</NavLink>
    <NavLink className="topbar__link" to="/author/compendium/start">компендиум…</NavLink>

    <span className="spacer" />

    {note ? <span className={`worldbar__note ${note.bad ? 'field__error' : 'muted'}`}>{note.text}</span> : null}
    <span className="muted">{name}</span>
    <Button size="sm" onClick={() => void saveSystem()}>Опубликовать систему</Button>
    <Button size="sm" onClick={() => void saveBook()} disabled={!origin.systemId}>Опубликовать компендиум</Button>
    <Button size="sm" variant="primary" onClick={() => void saveWorld()} disabled={!origin.systemId}>Создать мир</Button>
  </div>;
}
