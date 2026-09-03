import { useState } from 'react';
import { NavLink } from 'react-router';
import { useWorld } from '../../store/world.ts';
import { useSession } from '../../store/session.ts';
import { useAutosave, rememberVersion } from '../../store/autosave.ts';
import { Button, Input } from '../../ui/primitives.tsx';
import { ApiError, publishCompendium } from '../../api/client.ts';

export function BookBar() {
  const origin = useWorld(s => s.origin);
  const setOrigin = useWorld(s => s.setOrigin);
  const name = useSession(s => s.name);
  const saving = useAutosave(s => s.state);

  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const publish = async () => {
    if (!origin.compendiumId) return;
    try {
      const saved = await publishCompendium(origin.compendiumId);
      rememberVersion({ compendium: saved.updatedAt });
      setNote({ text: 'компендиум опубликован — его можно брать в мир', bad: false });
    } catch (err) {
      const issues = err instanceof ApiError && err.issues.length ? ` (${err.issues[0]})` : '';
      setNote({ text: (err as Error).message + issues, bad: true });
    }
  };

  const saved = saving.kind === 'saving' ? 'сохраняем…'
    : saving.kind === 'saved' ? `сохранено в ${saving.at}`
      : saving.kind === 'failed' ? `не сохранилось: ${saving.why}`
        : origin.compendiumId ? 'изменений нет' : 'компендиум не создан';

  return <div className="worldbar">
    <span className="field__label">Компендиум</span>
    <div className="worldbar__name">
      <Input value={origin.compendiumTitle ?? ''}
        onChange={next => setOrigin({ compendiumTitle: next })} />
    </div>
    <span className={`worldbar__state${saving.kind === 'failed' ? ' field__error' : ''}`}>{saved}</span>
    <span className="worldbar__state">для системы «{origin.systemTitle ?? '—'}»</span>
    <NavLink className="topbar__link" to="/book/start">сменить</NavLink>

    <span className="spacer" />

    {note ? <span className={`worldbar__note ${note.bad ? 'field__error' : 'muted'}`}>{note.text}</span> : null}
    <span className="muted">{name}</span>
    <Button size="sm" variant="primary" onClick={() => void publish()}
      disabled={!origin.compendiumId}>Опубликовать компендиум</Button>
  </div>;
}
