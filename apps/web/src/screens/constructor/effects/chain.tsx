import { useState } from 'react';
import { useWorld, freeId } from '../../../store/world.ts';
import { STEP } from '../../../words.ts';
import { CARD_TITLES } from './words.ts';
import { Button, Verdict } from '../../../ui/primitives.tsx';
import { problemOf } from '../step-card.tsx';
import { groupSteps, moveGroup, removeSteps, BRICKS } from '../cards.ts';
import { GroupCard } from './cards/group-card.tsx';
import { findDonorBlock, copyDonorBlock } from '../donors.tsx';
import type { System, Effect } from '@vtt/schema';

export function Chain({ effect, system, edit, title = 'Цепочка шагов', empty = 'шагов ещё нет — эффект ничего не делает' }: {
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
  title?: string;
  empty?: string;
}) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const onOpenEffect = (id: string) => pick({ activeEffectId: id });
  const [removed, setRemoved] = useState<string | null>(null);

  const addParam = (label: string, kind: string, want?: string): string => {
    let key = '';
    edit(draft => {
      draft.params ??= [];
      const taken = draft.params.map(p => p.key);
      key = want && !taken.includes(want) ? want : freeId(taken, 'из_записи');
      draft.params.push({ key, label, kind });
    });
    return key;
  };

  const steps = effect.steps ?? [];

  const cards = groupSteps(steps);

  const cardAt = (index: number) => cards.findIndex(card => card.indices.includes(index)) + 1;

  const earlierOf = (index: number) =>
    steps.slice(0, index)
      .map((step, at) => ({ step, at }))
      .filter(({ step }) => step.id)
      .map(({ step, at }) => ({
        id: String(step.id), type: step.type, at: cardAt(at), title: cardTitle(cards, at),
      }));

  const problems = steps.map((step, index) => problemOf(step, system, effect, earlierOf(index)));

  const broken = cards.filter(card => card.indices.some(i => problems[i])).length;

  return (
    <>
      <div className="inline">
        <span className="screen-title" style={{ fontSize: 'var(--fs-5)' }}>{title}</span>
        <span className="spacer" />
        {broken
          ? <Verdict tone="bad">{STEP.manyGen} со сломанными ссылками: {broken}</Verdict>
          : steps.length
            ? <Verdict tone="ok">эффект верный · {STEP.manyGen} {cards.length}</Verdict>
            : <Verdict tone="warn">{empty}</Verdict>}
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
            earlier={[
              ...earlierOf(group.indices[0]!),
              ...(group.amount?.id
                ? [{ id: String(group.amount.id), type: 'amount', at: 0, title: 'здесь же' }]
                : []),
            ]}
            problem={problem}
            problemAction={donorFix ? (
              <Button size="sm" onClick={() => copyDonorBlock(editSystem, donorFix.donor, donorFix.group)}>
                {`взять блок «${donorFix.group}» из «${donorFix.donor.name}»`}
              </Button>
            ) : undefined}
            onAddParam={addParam}
            onOpenEffect={onOpenEffect}
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

const cardTitle = (cards: ReturnType<typeof groupSteps>, index: number): string | undefined => {
  const card = cards.find(c => c.indices.includes(index));
  return card ? CARD_TITLES[card.kind] : undefined;
};
