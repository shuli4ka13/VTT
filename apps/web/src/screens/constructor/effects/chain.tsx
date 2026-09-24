import { useEffect, useRef, useState } from 'react';
import { useWorld, freeId } from '../../../store/world.ts';
import { STEP } from '../../../words.ts';
import { CARD_TITLES } from './words.ts';
import { Button, Select, Verdict } from '../../../ui/primitives.tsx';
import { problemOf } from '../step-card.tsx';
import { groupSteps, moveGroup, removeSteps, BRICKS } from '../cards.ts';
import { costsOf, newCost, payStep } from '../factory.ts';
import { GroupCard } from './cards/group-card.tsx';
import { useOpened } from '../../../store/opened.ts';
import { findDonorBlock, copyDonorBlock } from '../donors.tsx';
import type { System, Effect, Step } from '@vtt/schema';

export type Lane = 'receiver' | 'sender';

export function Chain({ effect, system, edit, title = 'Цепочка шагов', empty = 'шагов ещё нет — эффект ничего не делает', lane = 'receiver', onMoveLane }: {
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
  title?: string;
  empty?: string;
  lane?: Lane;
  onMoveLane?: (indices: number[], to: Lane) => void;
}) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);
  const onOpenEffect = (id: string) => pick({ activeEffectId: id });
  const [removed, setRemoved] = useState<{ text: string; before: Step[] } | null>(null);

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

  const opened = useOpened(st => st.opened);
  const toggleFold = useOpened(st => st.toggle);
  const setOpen = useOpened(st => st.setOpen);
  const foldKey = (group: (typeof cards)[number]) =>
    `step|${effect.label ?? ''}|${lane}|${String(group.step.id ?? group.indices[0])}`;
  const keys = cards.map(foldKey);
  const signature = keys.join('\n');
  const name = effect.label ?? '';
  const seen = useRef<{ name: string; keys: string[] } | null>(null);
  useEffect(() => {
    const now = signature ? signature.split('\n') : [];
    const before = seen.current;
    seen.current = { name, keys: now };
    if (!before || before.name !== name) return;
    const fresh = now.filter(key => !before.keys.includes(key));
    if (fresh.length) setOpen(fresh, true);
  }, [name, signature, setOpen]);

  return (
    <>
      <div className="inline">
        <span className="screen-title" style={{ fontSize: 'var(--fs-5)' }}>{title}</span>
        <span className="spacer" />
        {cards.length > 1 ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(keys, false)}>свернуть все</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(keys, true)}>развернуть все</Button>
          </>
        ) : null}
        {broken
          ? <Verdict tone="bad">{STEP.manyGen} со сломанными ссылками: {broken}</Verdict>
          : steps.length
            ? <Verdict tone="ok">эффект верный · {STEP.manyGen} {cards.length}</Verdict>
            : <Verdict tone="warn">{empty}</Verdict>}
      </div>

      {removed ? (
        <Verdict
          tone="warn"
          action={(
            <>
              <Button size="sm" onClick={() => { const before = removed.before; edit(draft => { draft.steps = before; }); setRemoved(null); }}>
                вернуть {STEP.one}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRemoved(null)}>ясно</Button>
            </>
          )}
        >
          {removed.text}
        </Verdict>
      ) : null}

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
            lane={lane}
            folded={!opened[foldKey(group)]}
            onFold={() => toggleFold(foldKey(group))}
            onMoveLane={onMoveLane ? to => onMoveLane(group.indices, to) : undefined}
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
              const before = structuredClone(steps);
              const removal = removeSteps(steps, group.indices);
              edit(draft => { draft.steps = removal.steps; });
              setRemoved({
                before,
                text: removal.cleared.length
                  ? `Убран ${STEP.one} ${at + 1}; ссылки на него очищены: ${removal.cleared.map(c => `${STEP.one} ${c.step + 1} · ${c.slot}`).join(', ')}`
                  : `Убран ${STEP.one} ${at + 1}${cardTitle(cards, group.indices[0]!) ? ` · ${cardTitle(cards, group.indices[0]!)}` : ''}`,
              });
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
        {lane === 'sender' ? (
          <CostPick system={system} onPick={id => edit(draft => {
            const taken = (draft.steps ?? []).map(s => String(s.id ?? ''));
            (draft.steps ??= []).unshift(payStep(id, taken));
          })} />
        ) : null}
      </div>
    </>
  );
}

const NEW_COST = ':новая';

export function CostPick({ system, onPick }: { system: System; onPick: (id: string) => void }) {
  const editSystem = useWorld(s => s.editSystem);
  return (
    <span className="add-cost">
      <Select<string>
        value=""
        title="Чего стоит эффект: эффект из блока «Стоимость» зовётся первым шагом; не хватило — эффект не состоится"
        options={[['', '+ стоимость'],
          ...costsOf(system).map(([id, cost]) => [id, cost.label || id] as const),
          [NEW_COST, '+ новая стоимость…']]}
        onChange={pick => {
          if (!pick) return;
          if (pick !== NEW_COST) { onPick(pick); return; }
          const made = newCost(system);
          editSystem(draft => { draft.effects[made.key] = made.value; });
          onPick(made.key);
        }}
      />
    </span>
  );
}

const cardTitle = (cards: ReturnType<typeof groupSteps>, index: number): string | undefined => {
  const card = cards.find(c => c.indices.includes(index));
  return card ? CARD_TITLES[card.kind] : undefined;
};
