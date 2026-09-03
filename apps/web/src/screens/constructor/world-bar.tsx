import { useState } from 'react';
import { NavLink } from 'react-router';
import { useWorld } from '../../store/world.ts';
import { useSession } from '../../store/session.ts';
import { useAutosave, rememberVersion } from '../../store/autosave.ts';
import { Button, Input } from '../../ui/primitives.tsx';
import { ApiError, publishSystem } from '../../api/client.ts';

export function SystemBar() {
  const system = useWorld(s => s.system);
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
      const saved = await publishSystem(origin.systemId);
      rememberVersion({ system: saved.updatedAt });
      setNote({ text: 'система опубликована — партия увидит эту версию', bad: false });
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

    <span className="spacer" />

    {note ? <span className={`worldbar__note ${note.bad ? 'field__error' : 'muted'}`}>{note.text}</span> : null}
    <span className="muted">{name}</span>
    <Button size="sm" variant="primary" onClick={() => void publish()}
      disabled={!origin.systemId}>Опубликовать систему</Button>
  </div>;
}
