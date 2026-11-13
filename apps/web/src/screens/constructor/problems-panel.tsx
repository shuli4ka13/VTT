import { useEffect } from 'react';
import { create } from 'zustand';
import { useWorld } from '../../store/world.ts';
import { Button, Verdict, Empty } from '../../ui/primitives.tsx';
import { useProblems, whereLabel, pickFor } from './problems.ts';
import { plural } from '../../ui/plural.ts';

interface PanelState { open: boolean; set: (open: boolean) => void }

export const problemsWord = (errors: number, warnings: number): string => {
  if (errors + warnings === 0) return 'Проблем нет';
  const parts = [
    errors ? `${errors} ${plural(errors, 'ошибка', 'ошибки', 'ошибок')}` : '',
    warnings ? `${warnings} ${plural(warnings, 'замечание', 'замечания', 'замечаний')}` : '',
  ].filter(Boolean);
  return `Проблемы: ${parts.join(', ')}`;
};

export const useProblemsPanel = create<PanelState>()(set => ({ open: false, set: open => set({ open }) }));

export function ProblemsButton() {
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
        title={errors ? 'с ошибками система не публикуется' : 'предупреждения публиковать не мешают'}
      >
        {problemsWord(errors, warnings)}
      </Button>
      {open ? (
        <div className="problems" role="dialog" aria-label="Проблемы системы">
          {problems.length === 0
            ? <Empty title="Проблем нет" hint="Все ссылки на месте, названия заполнены, эффекты подключены." />
            : problems.map((problem, index) => (
              <Verdict
                key={index}
                tone={problem.level === 'error' ? 'bad' : 'warn'}
                action={
                  <Button size="sm" onClick={() => { pick(pickFor(problem.where, system)); setOpen(false); }}>Открыть</Button>
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
