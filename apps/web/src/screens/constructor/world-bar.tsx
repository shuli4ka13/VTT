import { useState } from 'react';
import { NavLink } from 'react-router';
import { useWorld } from '../../store/world.ts';
import { useSession } from '../../store/session.ts';
import { useAutosave, rememberVersion, settle, saveLabel, markClean } from '../../store/autosave.ts';
import { Button, Input } from '../../ui/primitives.tsx';
import { ApiError, publishSystem } from '../../api/client.ts';
import { ProblemsButton, useProblemsPanel } from './problems-panel.tsx';
import { GuideButton } from '../../guide/guide-card.tsx';
import { pathWords } from './problems.ts';
import { Tabs } from '../../ui/layout.tsx';
import { FormulaBar } from '../../ui/formula-bar.tsx';
import { useLocale } from '../../store/locale.ts';
import { useFormulaBar } from '../../store/formula-bar.ts';
import { TABS } from '../../words.ts';
import { Trans, langName, useT } from '../../i18n/author.ts';

export const TAB_LIST = [
  { key: 'sheet' as const, label: TABS.sheet },
  { key: 'dictionaries' as const, label: TABS.rules },
  { key: 'effects' as const, label: TABS.effects },
  { key: 'records' as const, label: TABS.records },
];

export function SystemBar() {
  const system = useWorld(s => s.system);
  const origin = useWorld(s => s.origin);
  const editSystem = useWorld(s => s.editSystem);
  const name = useSession(s => s.name);
  const saving = useAutosave(s => s.state);
  const tab = useWorld(s => s.activeTab);
  const pick = useWorld(s => s.pick);
  const lang = useLocale(s => s.lang);
  const setLang = useLocale(s => s.setLang);
  const setOrigin = useWorld(s => s.setOrigin);
  const t = useT('constructor');

  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const fail = (err: unknown) => {
    const issues = err instanceof ApiError && err.issues.length ? ` (${pathWords(err.issues[0]!, system)})` : '';
    setNote({ text: (err as Error).message + issues, bad: true });
  };

  const publish = async () => {
    if (!origin.systemId) return;
    if (!await settle()) {
      setNote({ text: t('publish.notSaved'), bad: true });
      return;
    }
    try {
      const saved = await publishSystem(origin.systemId);
      rememberVersion({ system: saved.updatedAt });
      markClean();
      setOrigin({ publication: 'live' });
      setNote(null);
    } catch (err) {
      if (err instanceof ApiError && err.message.startsWith(t('publish.refused'))) {
        setNote({ text: t('publish.problems'), bad: true });
        useProblemsPanel.getState().set(true);
      } else fail(err);
    }
  };

  const saved = saveLabel(saving, origin.systemId ? t('bar.noChanges') : t('bar.notCreated'));
  const details = saving.kind === 'failed' && saving.issues.length ? saving.issues.map(issue => pathWords(issue, system)).join('\n') : undefined;

  return <header className="appbar">
    <div className="appbar__row">
      <NavLink className="topbar__brand" to="/" title={t('bar.brandTitle')}><Trans i18nKey="constructor:bar.brand" components={{ em: <em /> }} /></NavLink>
      <span className="appbar__sep" aria-hidden />
      <div className="worldbar__name">
        <Input value={system.name ?? ''} onChange={next => editSystem(draft => { draft.name = next; })} />
      </div>
      <span className={`worldbar__state${saving.kind === 'failed' ? ' field__error' : ''}`} title={details}>{saved}</span>
      <NavLink className="topbar__link" to="/author/start">{t('bar.switch')}</NavLink>
      <span className="appbar__sep" aria-hidden />
      <Tabs value={tab} options={TAB_LIST} onChange={next => { useFormulaBar.getState().commit(); pick({ activeTab: next }); }} />

      <span className="spacer" />

      {origin.systemId && !origin.lesson ? <span
        className={`worldbar__publication${origin.publication === 'behind' ? ' worldbar__publication--behind' : ''}`}
        title={origin.publication === 'behind' ? t('publication.behindTitle') : undefined}
      >{t(`publication.${origin.publication ?? 'draft'}`)}</span> : null}
      {note ? <span className={`worldbar__note ${note.bad ? 'field__error' : 'muted'}`} title={note.text}>{note.text}</span> : null}
      <span className="muted">{name}</span>
      <button type="button" className="worldbar__lang" title={t('bar.langTitle')}
        onClick={() => { useFormulaBar.getState().commit(); setLang(lang === 'ru' ? 'en' : 'ru'); }}>{t('bar.langButton', { name: langName(lang) })}</button>
      <GuideButton />
      <span data-guide="problems"><ProblemsButton /></span>
      <Button size="sm" variant="primary" onClick={() => void publish()}
        disabled={!origin.systemId}>{t('bar.publish')}</Button>
    </div>
    <FormulaBar />
  </header>;
}
