import { useEffect } from 'react';
import { create } from 'zustand';
import { useWorld } from '../../store/world.ts';
import { Button, Verdict, Empty } from '../../ui/primitives.tsx';
import { useProblems, whereLabel, pickFor } from './problems.ts';
import { useT, t } from '../../i18n/author.ts';

interface PanelState { open: boolean; set: (open: boolean) => void }

export const problemsWord = (errors: number, warnings: number): string => {
  if (errors + warnings === 0) return t('fields:problems.none');
  const parts = [
    errors ? t('fields:problems.errors', { count: errors }) : '',
    warnings ? t('fields:problems.warnings', { count: warnings }) : '',
  ].filter(Boolean);
  return t('fields:problems.head', { list: parts.join(', ') });
};

export const useProblemsPanel = create<PanelState>()(set => ({ open: false, set: open => set({ open }) }));

export function ProblemsButton() {
  const t = useT('fields');
  const problems = useProblems();
  const system = useWorld(s => s.system);
  const pick = useWorld(s => s.pick);
  const open = useProblemsPanel(s => s.open);
  const setOpen = useProblemsPanel(s => s.set);
  useEffect(() => () => setOpen(false), [setOpen]);
  const errors = problems.filter(p => p.level === 'error').length;
  const warnings = problems.length - errors;

  return (
    <>
      <Button
        size="sm"
        variant={errors ? 'danger' : undefined}
        onClick={() => setOpen(!open)}
        title={errors ? t('problems.errorsTip') : t('problems.warningsTip')}
      >
        {problemsWord(errors, warnings)}
      </Button>
      {open ? (
        <div className="problems" role="dialog" aria-label={t('problems.dialog')}>
          {problems.length === 0
            ? <Empty title={t('problems.none')} hint={t('problems.noneHint')} />
            : problems.map((problem, index) => (
              <Verdict
                key={index}
                tone={problem.level === 'error' ? 'bad' : 'warn'}
                action={
                  <Button size="sm" onClick={() => { pick(pickFor(problem.where, system)); setOpen(false); }}>{t('problems.open')}</Button>
                }
              >
                <b>{whereLabel(problem.where, system)}</b> — {problem.text}
              </Verdict>
            ))}
        </div>
      ) : null}
    </>
  );
}
