import { useState } from 'react';
import { useWorld, freeId } from '../../../store/world.ts';
import { STEP } from '../../../words.ts';
import { Button, Verdict } from '../../../ui/primitives.tsx';
import { problemOf } from '../step-card.tsx';
import { groupSteps, moveGroup, removeSteps, BRICKS } from '../cards.ts';
import { GroupCard } from './cards/group-card.tsx';
import { findDonorBlock, copyDonorBlock } from '../donors.tsx';
import type { System, Effect } from '@vtt/schema';

export function Chain({ effect, system, edit }: {
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
}) {
  const editSystem = useWorld(s => s.editSystem);
  const [removed, setRemoved] = useState<string | null>(null);

  const addParam = (label: string, kind: string): string => {
    let key = '';
    edit(draft => {
      draft.params ??= [];
      key = freeId(draft.params.map(p => p.key), 'из_записи');
      draft.params.push({ key, label, kind });
    });
    return key;
  };

  const steps = effect.steps ?? [];

  const earlierOf = (index: number) =>
    steps.slice(0, index)
      .filter(step => step.id)
      .map(step => ({ id: String(step.id), type: step.type }));

  const cards = groupSteps(steps);
  const problems = steps.map((step, index) => problemOf(step, system, effect, earlierOf(index)));

  const broken = cards.filter(card => card.indices.some(i => problems[i])).length;

  return (
    <>
      <div className="inline">
        <span className="screen-title" style={{ fontSize: 'var(--fs-5)' }}>Цепочка шагов</span>
        <span className="spacer" />
        {broken
          ? <Verdict tone="bad">карточек со сломанными ссылками: {broken}</Verdict>
          : steps.length
            ? <Verdict tone="ok">эффект верный · карточек {cards.length}</Verdict>
            : <Verdict tone="warn">шагов ещё нет — эффект ничего не делает</Verdict>}
      </div>

      {removed ? <Verdict tone="warn" action={<Button size="sm" variant="ghost" onClick={() => setRemoved(null)}>ясно</Button>}>{removed}</Verdict> : null}

      {cards.map((group, at) => {
        const problem = group.indices.map(i => problems[i]).find(Boolean) ?? null;

        const donorFix = problem?.missingField ? findDonorBlock(problem.missingField) : null;

        return (
          <GroupCard
            key={group.indices[0]}
            group={group}
            position={at + 1}
            system={system}
            effect={effect}
            earlier={earlierOf(group.indices[0]!)}
            problem={problem}
            problemAction={donorFix ? (
              <Button size="sm" onClick={() => copyDonorBlock(editSystem, donorFix.donor, donorFix.group)}>
                {`взять блок «${donorFix.group}» из «${donorFix.donor.name}»`}
              </Button>
            ) : undefined}
            onAddParam={addParam}
            edit={(k, change) => edit(draft => {
              const index = group.indices[k] ?? group.indices[0]!;
              change(draft.steps![index]!);
            })}

            withNumber={change => edit(draft => {
              const steps = draft.steps ?? (draft.steps = []);
              const applyAt = group.indices[group.indices.length - 1]!;
              let amountAt = group.amount ? group.indices[0]! : -1;
              if (amountAt < 0) {
                const taken = steps.map(step => step.id).filter(Boolean) as string[];
                steps.splice(applyAt, 0, {
                  id: freeId(taken, 'n'), type: 'amount', source: 'roll',
                } as never);
                amountAt = applyAt;
              }
              const amount = steps[amountAt]!;
              change(amount, steps[amountAt + 1]!, String(amount.id));
            })}
            onDelete={() => {
              const removal = removeSteps(steps, group.indices);
              edit(draft => { draft.steps = removal.steps; });
              setRemoved(removal.cleared.length
                ? `${STEP.one} убран; ссылки на него очищены: ${removal.cleared.map(c => `${STEP.one} ${c.step + 1} · ${c.slot}`).join(', ')}`
                : null);
            }}
            onMoveUp={at === 0 ? undefined : () => edit(draft => {
              draft.steps = moveGroup(draft.steps ?? [], at, -1);
            })}
            onMoveDown={at === cards.length - 1 ? undefined : () => edit(draft => {
              draft.steps = moveGroup(draft.steps ?? [], at, 1);
            })}
          />
        );
      })}

      <div className="inline inline--tight">
        {BRICKS.map(b => (
          <Button key={b.key} size="sm" title={b.hint}
            onClick={() => edit(draft => {
              const taken = (draft.steps ?? []).map(s => s.id).filter(Boolean) as string[];
              (draft.steps ??= []).push(...b.make(system, taken));
            })}>
            {b.label}
          </Button>
        ))}
      </div>
    </>
  );
}
