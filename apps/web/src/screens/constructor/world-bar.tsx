import { useState } from 'react';
import { NavLink } from 'react-router';
import { useWorld } from '../../store/world.ts';
import { useSession } from '../../store/session.ts';
import { useAutosave, rememberVersion } from '../../store/autosave.ts';
import { Button, Input } from '../../ui/primitives.tsx';
import { ApiError, publishSystem, publishCompendium, publishWorld } from '../../api/client.ts';

export function WorldBar() {
  const system = useWorld(s => s.system);
  const sheets = useWorld(s => s.sheets);
  const origin = useWorld(s => s.origin);
  const editSystem = useWorld(s => s.editSystem);
  const name = useSession(s => s.name);
  const saving = useAutosave(s => s.state);

  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const fail = (err: unknown) => {
    const issues = err instanceof ApiError && err.issues.length ? ` (${err.issues[0]})` : '';
    setNote({ text: (err as Error).message + issues, bad: true });
  };

  const publish = async () => {
    if (!origin.systemId) return;
    try {
      const system = await publishSystem(origin.systemId);
      rememberVersion({ system: system.updatedAt });
      if (origin.compendiumId) {
        const book = await publishCompendium(origin.compendiumId);
        rememberVersion({ compendium: book.updatedAt });
      }
      setNote({ text: 'опубликовано — партия увидит эту версию', bad: false });
    } catch (err) { fail(err); }
  };

  const makeWorld = async () => {
    if (!origin.systemId) return;
    try {
      const books = origin.compendiumId ? [origin.compendiumId] : [];
      await publishWorld(system.name ?? 'Без имени', origin.systemId, books, sheets);
      setNote({ text: `мир создан · компендиумов: ${books.length}`, bad: false });
    } catch (err) { fail(err); }
  };

  const saved = saving.kind === 'saving' ? 'сохраняем…'
    : saving.kind === 'saved' ? `сохранено в ${saving.at}`
      : saving.kind === 'failed' ? `не сохранилось: ${saving.why}`
        : origin.systemId ? 'изменений нет' : 'система не создана';

  return <div className="worldbar">
    <div className="worldbar__name">
      <Input value={system.name ?? ''} onChange={next => editSystem(draft => { draft.name = next; })} />
    </div>
    <span className={`worldbar__state${saving.kind === 'failed' ? ' field__error' : ''}`}>{saved}</span>
    <NavLink className="topbar__link" to="/author/start">сменить систему</NavLink>
    <NavLink className="topbar__link" to="/author/compendium/start">компендиум…</NavLink>

    <span className="spacer" />

    {note ? <span className={`worldbar__note ${note.bad ? 'field__error' : 'muted'}`}>{note.text}</span> : null}
    <span className="muted">{name}</span>
    <Button size="sm" onClick={() => void publish()} disabled={!origin.systemId}>Опубликовать</Button>
    <Button size="sm" variant="primary" onClick={() => void makeWorld()} disabled={!origin.systemId}>Создать мир</Button>
  </div>;
}
