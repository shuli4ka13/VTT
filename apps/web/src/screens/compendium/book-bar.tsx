import { useState } from 'react';
import { NavLink } from 'react-router';
import { useWorld } from '../../store/world.ts';
import { useSession } from '../../store/session.ts';
import { useAutosave, rememberVersion, settle, saveLabel } from '../../store/autosave.ts';
import { Button, Input } from '../../ui/primitives.tsx';
import { ApiError, publishCompendium } from '../../api/client.ts';
import { useT } from '../../i18n/author.ts';

export function BookBar() {
  const t = useT('book');
  const origin = useWorld(s => s.origin);
  const setOrigin = useWorld(s => s.setOrigin);
  const name = useSession(s => s.name);
  const saving = useAutosave(s => s.state);

  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const publish = async () => {
    if (!origin.compendiumId) return;
    if (!await settle()) {
      setNote({ text: t('bar.notPublished'), bad: true });
      return;
    }
    try {
      const saved = await publishCompendium(origin.compendiumId);
      rememberVersion({ compendium: saved.updatedAt });
      setNote({ text: t('bar.published'), bad: false });
    } catch (err) {
      const issues = err instanceof ApiError && err.issues.length ? ` (${err.issues[0]})` : '';
      setNote({ text: (err as Error).message + issues, bad: true });
    }
  };

  const saved = saveLabel(saving, origin.compendiumId ? t('bar.idle') : t('bar.notCreated'));
  const details = saving.kind === 'failed' && saving.issues.length ? saving.issues.join('\n') : undefined;

  return <div className="worldbar">
    <span className="field__label">{t('bar.title')}</span>
    <div className="worldbar__name">
      <Input value={origin.compendiumTitle ?? ''}
        onChange={next => setOrigin({ compendiumTitle: next })} />
    </div>
    <span className={`worldbar__state${saving.kind === 'failed' ? ' field__error' : ''}`} title={details}>{saved}</span>
    <span className="worldbar__state">{t('bar.forSystem', { name: origin.systemTitle ?? '—' })}</span>
    <NavLink className="topbar__link" to="/book/start">{t('bar.change')}</NavLink>

    <span className="spacer" />

    {note ? <span className={`worldbar__note ${note.bad ? 'field__error' : 'muted'}`}>{note.text}</span> : null}
    <span className="muted">{name}</span>
    <Button size="sm" variant="primary" onClick={() => void publish()}
      disabled={!origin.compendiumId}>{t('bar.publish')}</Button>
  </div>;
}
