import { useState } from 'react';
import { NavLink } from 'react-router';
import { useWorld } from '../../store/world.ts';
import { useSession } from '../../store/session.ts';
import { useAutosave, rememberVersion, settle, saveLabel } from '../../store/autosave.ts';
import { Button, Input } from '../../ui/primitives.tsx';
import { ApiError, publishSystem } from '../../api/client.ts';
import { ProblemsButton, useProblemsPanel } from './problems-panel.tsx';
import { GuideButton } from '../../guide/guide-card.tsx';
import { pathWords } from './problems.ts';
import { Tabs } from '../../ui/layout.tsx';
import { FormulaBar } from '../../ui/formula-bar.tsx';
import { useFormulaBar } from '../../store/formula-bar.ts';
import { TABS } from '../../words.ts';

export const TAB_LIST = [
  { key: 'sheet' as const, label: TABS.sheet },
  { key: 'dictionaries' as const, label: TABS.rules },
  { key: 'effects' as const, label: TABS.effects },
  { key: 'records' as const, label: TABS.records },
];

const REFUSED = 'система не готова к публикации';

const PUBLICATION = {
  draft: 'черновик',
  live: 'опубликована',
  behind: 'правки не опубликованы',
};

export function SystemBar() {
  const system = useWorld(s => s.system);
  const origin = useWorld(s => s.origin);
  const editSystem = useWorld(s => s.editSystem);
  const name = useSession(s => s.name);
  const saving = useAutosave(s => s.state);
  const tab = useWorld(s => s.activeTab);
  const pick = useWorld(s => s.pick);
  const setOrigin = useWorld(s => s.setOrigin);

  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const fail = (err: unknown) => {
    const issues = err instanceof ApiError && err.issues.length ? ` (${pathWords(err.issues[0]!, system)})` : '';
    setNote({ text: (err as Error).message + issues, bad: true });
  };

  const publish = async () => {
    if (!origin.systemId) return;
    if (!await settle()) {
      setNote({ text: 'публиковать нечего: последние правки не сохранились — причина слева', bad: true });
      return;
    }
    try {
      const saved = await publishSystem(origin.systemId);
      rememberVersion({ system: saved.updatedAt });
      setOrigin({ publication: 'live' });
      setNote(null);
    } catch (err) {
      if (err instanceof ApiError && err.message.startsWith(REFUSED)) {
        setNote({ text: 'не опубликовано — ошибки в «Проблемах»', bad: true });
        useProblemsPanel.getState().set(true);
      } else fail(err);
    }
  };

  const saved = saveLabel(saving, origin.systemId ? 'изменений нет' : 'система не создана');
  const details = saving.kind === 'failed' && saving.issues.length ? saving.issues.map(issue => pathWords(issue, system)).join('\n') : undefined;

  return <header className="appbar">
    <div className="appbar__row">
      <NavLink className="topbar__brand" to="/" title="сменить роль"><em>VTT</em> система</NavLink>
      <span className="appbar__sep" aria-hidden />
      <div className="worldbar__name">
        <Input value={system.name ?? ''} onChange={next => editSystem(draft => { draft.name = next; })} />
      </div>
      <span className={`worldbar__state${saving.kind === 'failed' ? ' field__error' : ''}`} title={details}>{saved}</span>
      <NavLink className="topbar__link" to="/author/start">сменить</NavLink>
      <span className="appbar__sep" aria-hidden />
      <Tabs value={tab} options={TAB_LIST} onChange={next => { useFormulaBar.getState().commit(); pick({ activeTab: next }); }} />

      <span className="spacer" />

      {origin.systemId && !origin.lesson ? <span
        className={`worldbar__publication${origin.publication === 'behind' ? ' worldbar__publication--behind' : ''}`}
        title={origin.publication === 'behind' ? 'за столом видят прежнюю версию — нажмите «Опубликовать»' : undefined}
      >{PUBLICATION[origin.publication ?? 'draft']}</span> : null}
      {note ? <span className={`worldbar__note ${note.bad ? 'field__error' : 'muted'}`} title={note.text}>{note.text}</span> : null}
      <span className="muted">{name}</span>
      <GuideButton />
      <span data-guide="problems"><ProblemsButton /></span>
      <Button size="sm" variant="primary" onClick={() => void publish()}
        disabled={!origin.systemId}>Опубликовать</Button>
    </div>
    <FormulaBar />
  </header>;
}
