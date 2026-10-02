import { useState } from 'react';
import { useWorld } from '../../store/world.ts';
import { Button, Verdict, Empty } from '../../ui/primitives.tsx';
import { useProblems, whereLabel, pickFor } from './problems.ts';

export function ProblemsButton() {
  const problems = useProblems();
  const system = useWorld(s => s.system);
  const pick = useWorld(s => s.pick);
  const [open, setOpen] = useState(false);
  const errors = problems.filter(p => p.level === 'error').length;

  return (
    <>
      <Button
        size="sm"
        variant={errors ? 'danger' : undefined}
        onClick={() => setOpen(value => !value)}
        title={errors ? 'с ошибками система не публикуется' : 'предупреждения публиковать не мешают'}
      >
        Проблемы ({problems.length})
      </Button>
      {open ? (
        <div className="problems" role="dialog" aria-label="Проблемы системы">
          {problems.length === 0
            ? <Empty title="Проблем нет" hint="Все ссылки на месте, у каждого срабатывающего эффекта есть слушатель." />
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
