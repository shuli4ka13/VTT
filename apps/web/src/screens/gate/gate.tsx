import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../../store/session.ts';
import { Button, Input, Verdict } from '../../ui/primitives.tsx';
import { Trans, useT } from '../../i18n/index.ts';

export function GateScreen() {
  const name = useSession(s => s.name);
  const signed = useSession(s => s.signed);
  const enter = useSession(s => s.enter);
  const leave = useSession(s => s.leave);
  const navigate = useNavigate();
  const t = useT('gate');

  const [draft, setDraft] = useState(name);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setTrouble(null);
    try {
      await enter(draft);
    } catch (err) {
      setTrouble((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="roles">
      <div className="roles__eyebrow">{t('eyebrow')}</div>
      <h1 className="roles__title"><Trans i18nKey="gate:title" components={{ em: <em /> }} /></h1>

      {signed ? (
        <>
          <p className="roles__lead">
            <Trans i18nKey="gate:signedIn" values={{ name }} components={{ b: <b /> }} />
          </p>

          <div className="roles__grid">
            <button type="button" className="role" onClick={() => navigate('/author/start')}>
              <span className="role__mark" />
              <span className="role__tag">{t('role.system.tag')}</span>
              <span className="role__name">{t('role.system.name')}</span>
              <span className="role__hint">{t('role.system.hint')}</span>
            </button>

            <button type="button" className="role" onClick={() => navigate('/book/start')}>
              <span className="role__mark" />
              <span className="role__tag">{t('role.book.tag')}</span>
              <span className="role__name">{t('role.book.name')}</span>
              <span className="role__hint">{t('role.book.hint')}</span>
            </button>

            <button type="button" className="role" onClick={() => navigate('/play/table')}>
              <span className="role__mark" />
              <span className="role__tag">{t('role.play.tag')}</span>
              <span className="role__name">{t('role.play.name')}</span>
              <span className="role__hint">{t('role.play.hint')}</span>
            </button>
          </div>

          <Button size="sm" variant="ghost" onClick={leave}>{t('switchName')}</Button>
        </>
      ) : (
        <>
          <p className="roles__lead">{t('introduce')}</p>

          {trouble ? <Verdict tone="bad">{trouble}</Verdict> : null}

          <div className="gate__form">
            <Input
              value={draft}
              onChange={setDraft}
              placeholder={t('namePlaceholder')}
              onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
            />
            <Button variant="primary" onClick={() => void submit()} disabled={busy}>
              {busy ? t('entering') : t('enter')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
