import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useWorld, freeId } from '../../../store/world.ts';
import { STEP } from '../../../words.ts';
import { loopOf } from '@vtt/engine/engine/steps/each';
import { titleOf } from './words.ts';
import { Button, Select, Verdict } from '../../../ui/primitives.tsx';
import { problemOf } from '../step-card.tsx';
import { groupSteps, moveGroup, moveSpan, blockSpan, removeSteps, armEnd, wrapInBranch, addArm, unwrapBlock, BRICKS, SEEN_BRICKS } from '../cards.ts';
import { armsOf, sees, endOf, inBlock } from '@vtt/engine/model/flow';
import { FlowHead, FlowActions } from './cards/flow-parts.tsx';
import { costsOf, newCost } from '../factory.ts';
import { COST_BLOCK } from '@vtt/engine/words/glossary';
import { GroupCard } from './cards/group-card.tsx';
import { sheetsAt } from './names.ts';
import type { Place } from '@vtt/engine/model/names-at';
import { useOpened } from '../../../store/opened.ts';
import { findDonorBlock, copyDonorBlock } from '../donors.tsx';
import type { System, Effect, Step, ValueKind } from '@vtt/schema';

export type Lane = 'steps' | 'cost';

export function Chain({ id, placeAt, effect, system, edit, title = 'Шаги', empty = 'шагов ещё нет — эффект ничего не делает', lane = 'steps', onMoveLane, bare = false, startAt = 0, lead, onAddCost, onRoll = false }: {
  id: string;
  placeAt: (index: number) => Place;
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
  title?: string;
  empty?: string;
  lane?: Lane;
  onMoveLane?: (indices: number[], to: Lane) => void;
  bare?: boolean;
  startAt?: number;
  lead?: ReactNode;
  onAddCost?: (id: string) => void;
  onRoll?: boolean;
}) {
  const pick = useWorld(s => s.pick);
  const onOpenEffect = (id: string) => pick({ activeEffectId: id });
  const [removed, setRemoved] = useState<{ text: string; before: Step[]; after: string } | null>(null);

  const addParam = (label: string, kind: ValueKind, want?: string): string => {
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

  const numbers = new Map<number, number>();
  cards.forEach((card, g) => { if (card.kind !== 'flow') numbers.set(g, numbers.size + 1); });
  const numberOf = (g: number) => numbers.get(g) ?? 0;
  const cardAt = (index: number) => numberOf(cards.findIndex(card => card.indices.includes(index)));
  const arms = armsOf(steps);

  const earlierOf = (index: number) =>
    steps.slice(0, index)
      .map((step, at) => ({ step, at }))
      .filter(({ at }) => sees(arms, at, index))
      .filter(({ step }) => step.id || (step.type === 'each' && loopOf(effect.params, step as { of?: unknown })))
      .map(({ step, at }) => ({
        id: String(step.type === 'each' ? loopOf(effect.params, step as { of?: unknown })?.key : step.id), type: step.type, at: startAt + cardAt(at), title: cardTitle(cards, at, system),
      }));

  const problems = steps.map((step, index) => problemOf(step, system, effect, earlierOf(index)));

  const broken = cards.filter(card => card.indices.some(i => problems[i])).length;
  const real = numbers.size;

  const opened = useOpened(st => st.opened);
  const toggleFold = useOpened(st => st.toggle);
  const setOpen = useOpened(st => st.setOpen);
  const foldKey = (group: (typeof cards)[number]) =>
    `step|${effect.label ?? ''}|${lane}|${String(group.step.id ?? group.indices[0])}`;
  const keys = cards.filter(card => card.kind !== 'flow').map(foldKey);
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

  const cardOf = (group: (typeof cards)[number], g: number) => {
    const at = numberOf(g) - 1;
    const problem = group.indices.map(i => problems[i]).find(Boolean) ?? null;

    const donorFix = problem?.missingField ? findDonorBlock(problem.missingField) : null;

    return (
      <GroupCard
        key={group.indices[0]}
        group={group}
        position={startAt + at + 1}
        system={system}
        effect={effect}
        earlier={[
          ...earlierOf(group.indices[0]!),
          ...(group.amount?.id
            ? [{ id: String(group.amount.id), type: 'roll', at: 0, title: 'здесь же' }]
            : []),
        ]}
        problem={problem}
        sheets={sheetsAt(system, id, placeAt(group.indices[0]!))}
        lane={lane}
        folded={!opened[foldKey(group)]}
        onFold={() => toggleFold(foldKey(group))}
        onMoveLane={onMoveLane && !inBlock(arms, group.indices[0]!) ? to => onMoveLane(group.indices, to) : undefined}
        {...(group.kind === 'check' && group.amount ? { onUnpair: () => edit(draft => { draft.steps = (draft.steps ?? []).filter((_, i) => i !== group.indices[0]); }) } : {})}
        problemAction={donorFix ? (
          <Button size="sm" onClick={() => copyDonorBlock(donorFix.donor, donorFix.group)}>
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
              id: freeId(taken, 'n'), type: 'roll',
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
          const where = (c: { step: number; slot: string }) => `${STEP.one} ${c.step + 1} · ${c.slot.replace(/ \(формула\)$/, '')}`;
          const cleared = removal.cleared.filter(c => !c.slot.endsWith('(формула)'));
          const left = removal.cleared.filter(c => c.slot.endsWith('(формула)'));
          const title = cardTitle(cards, group.indices[0]!, system);
          setRemoved({
            before,
            after: JSON.stringify(removal.steps),
            text: [
              `Убран ${STEP.one} ${at + 1}${title ? ` · ${title}` : ''}`,
              cleared.length ? `ссылки на него очищены: ${cleared.map(where).join(', ')}` : '',
              left.length ? `остались в формулах — поправьте: ${left.map(where).join(', ')}` : '',
            ].filter(Boolean).join('; '),
          });
        }}
        onMoveUp={g === 0 ? undefined : () => edit(draft => {
          draft.steps = moveGroup(draft.steps ?? [], g, -1);
        })}
        onMoveDown={g === cards.length - 1 ? undefined : () => edit(draft => {
          draft.steps = moveGroup(draft.steps ?? [], g, 1);
        })}
        {...(group.kind !== 'split' && group.kind !== 'stop' ? { onWrap: () => edit(draft => {
          draft.steps = wrapInBranch(draft.steps ?? [], group.indices[0]!, group.indices[group.indices.length - 1]!);
        }) } : {})}
      />
    );
  };

  const groupAt = (index: number) => cards.findIndex(card => card.indices[0] === index);

  const contextAt = (index: number) => ({
    system, effect, earlier: earlierOf(index),
    ...(sheetsAt(system, id, placeAt(index)) ? { sheets: sheetsAt(system, id, placeAt(index)) } : {}),
  });

  const armAdd = (head: number) => (
    <Select<string>
      value=""
      title="Добавить шаг в эту ветку"
      options={[['', '+ шаг'], ...[...BRICKS, ...(onRoll ? SEEN_BRICKS : [])].filter(b => b.key !== 'each').map(b => [b.key, b.label.replace(/^\+ /, '')] as const)]}
      onChange={key => {
        const brick = [...BRICKS, ...SEEN_BRICKS].find(b => b.key === key);
        if (!brick) return;
        edit(draft => {
          const list = draft.steps ?? (draft.steps = []);
          const taken = list.map(s => s.id).filter(Boolean) as string[];
          const held = HELD_PARTS.has(placeAt(0).part);
          list.splice(armEnd(list, head), 0, ...brick.make(system, taken, draft).map(step => (held ? byHolder(step) : step)));
        });
      }}
    />
  );

  const block = (open: number): { node: ReactNode; next: number } => {
    const end = endOf(steps, open);
    const heads = [open, ...steps.flatMap((step, index) => (index > open && index < end && step.type === 'orElse' && arms[index]?.length === (arms[open]?.length ?? 0) + 1 && arms[index]?.[arms[index]!.length - 1]?.open === open ? [index] : []))];
    const bareElse = heads.slice(1).some(head => (steps[head] as { if?: unknown }).if === undefined);
    const problem = (index: number) => problems[index]?.text ?? null;
    const node = (
      <div className="flow-block" key={`block:${open}`}>
        {heads.map((head, k) => {
          const stop = k + 1 < heads.length ? heads[k + 1]! : end;
          const first = groupAt(head + 1);
          const last = groupAt(stop);
          const conditioned = k === 0 || (steps[head] as { if?: unknown }).if !== undefined;
          const word = k === 0 ? 'Если' : conditioned ? 'Иначе, если' : 'Иначе';
          return (
            <div className="flow-block__part" key={head}>
              <FlowHead
                word={word} step={steps[head]!} context={contextAt(head)} earlier={earlierOf(head)}
                required={conditioned} problem={problem(head)}
                edit={change => edit(draft => { change(draft.steps![head]!); })}
                actions={k === 0 ? (
                  <FlowActions
                    onUp={() => edit(draft => { draft.steps = moveSpan(draft.steps ?? [], blockSpan(draft.steps ?? [], open), -1, true); })}
                    onDown={() => edit(draft => { draft.steps = moveSpan(draft.steps ?? [], blockSpan(draft.steps ?? [], open), 1, true); })}
                    extra={heads.length === 1 ? (
                      <Button size="sm" variant="ghost" title="Убрать «Если», шаги остаются" onClick={() => edit(draft => { draft.steps = unwrapBlock(draft.steps ?? [], open); })}>снять «Если»</Button>
                    ) : null}
                    onDelete={() => edit(draft => { const list = draft.steps ?? []; draft.steps = removeSteps(list, span(open, endOf(list, open))).steps; })}
                  />
                ) : (
                  <FlowActions onDelete={() => edit(draft => { const list = draft.steps ?? []; draft.steps = removeSteps(list, span(head, armEnd(list, head) - 1)).steps; })} deleteLabel="убрать ветку" />
                )}
              />
              <div className="flow-block__arm">
                {first >= 0 && last > first ? render(first, last) : <span className="faint">пусто — добавьте шаг</span>}
                <div className="flow-block__add">{armAdd(head)}</div>
              </div>
            </div>
          );
        })}
        <div className="flow-block__foot">
          <Button size="sm" variant="ghost" onClick={() => edit(draft => { draft.steps = addArm(draft.steps ?? [], open, true); })}>+ иначе, если</Button>
          {bareElse ? null : <Button size="sm" variant="ghost" onClick={() => edit(draft => { draft.steps = addArm(draft.steps ?? [], open, false); })}>+ иначе</Button>}
        </div>
      </div>
    );
    return { node, next: groupAt(end) + 1 };
  };

  function render(from: number, to: number): ReactNode[] {
    const out: ReactNode[] = [];
    for (let g = from; g < to;) {
      const group = cards[g]!;
      if (group.kind === 'flow' && group.step.type === 'branch') {
        const made = block(group.indices[0]!);
        out.push(made.node);
        g = made.next > g ? made.next : g + 1;
        continue;
      }
      if (group.kind === 'flow') { g++; continue; }
      if (group.kind === 'split') {
        out.push(cardOf(group, g));
        out.push(<div className="steps__each" key={`each:${g}`}>{render(g + 1, to)}</div>);
        break;
      }
      out.push(cardOf(group, g));
      g++;
    }
    return out;
  }

  const list = <>{render(0, cards.length)}</>;

  return (
    <>
      {bare ? null : <div className="inline">
        <span className="screen-title" style={{ fontSize: 'var(--fs-5)' }}>{title}</span>
        <span className="spacer" />
        {real > 1 ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(keys, false)}>свернуть все</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(keys, true)}>развернуть все</Button>
          </>
        ) : null}
        {broken
          ? <Verdict tone="bad">{STEP.manyGen} со сломанными ссылками: {broken}</Verdict>
          : steps.length || startAt
            ? <Verdict tone="ok">эффект верный · {STEP.manyGen} {real + startAt}</Verdict>
            : <Verdict tone="warn">{empty}</Verdict>}
      </div>}
      {removed && removed.after === JSON.stringify(steps) ? (
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

      {bare ? list : <div className="steps">{lead}{list}</div>}

      {bare ? null : <div className="inline inline--tight">
        {[...BRICKS, ...(onRoll ? SEEN_BRICKS : [])].map(b => (
          <Button key={b.key} size="sm" title={b.hint}
            onClick={() => edit(draft => {
              const taken = (draft.steps ?? []).map(s => s.id).filter(Boolean) as string[];
              const held = HELD_PARTS.has(placeAt(0).part);
              (draft.steps ??= []).push(...b.make(system, taken, draft).map(step => (held ? byHolder(step) : step)));
            })}>
            {b.label}
          </Button>
        ))}
        {onAddCost ? <CostPick system={system} except={id} onPick={onAddCost} /> : null}
      </div>}
    </>
  );
}

const NEW_COST = ':новая';

export function CostPick({ system, except, onPick }: { system: System; except?: string; onPick: (id: string) => void }) {
  const editSystem = useWorld(s => s.editSystem);
  return (
    <span className="add-cost">
      <Select<string>
        value=""
        title="Чего стоит эффект: эффект из блока «Стоимость» зовётся первым шагом; не хватило — эффект не состоится"
        options={[['', '+ стоимость'],
          ...costsOf(system).map(([id, cost]) => [id, cost.label || id] as const),
          ...Object.entries(system.effects ?? {})
            .filter(([key, other]) => key !== except && other.group !== COST_BLOCK && (other.activation ?? 'manual') !== 'passive')
            .map(([id, other]) => [id, `${other.label || id} — другой эффект`] as const),
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

const cardTitle = (cards: ReturnType<typeof groupSteps>, index: number, system: System): string | undefined => {
  const card = cards.find(c => c.indices.includes(index));
  if (!card) return undefined;
  const own = card.indices.length > 1 && card.amount && card.indices[0] === index ? card.amount : card.step;
  if (own.type === 'roll' && (own as { by?: unknown }).by !== undefined) {
    const tags = (((own as { tags?: unknown[] }).tags) ?? []).filter((tag): tag is string => typeof tag === 'string');
    return tags.length ? `Бросок «${tags.join(', ')}»` : 'Бросок';
  }
  return titleOf(card.kind, card.step, system);
};

const span = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, k) => from + k);

const HELD_PARTS = new Set(['handler', 'handler-cost', 'attach', 'detach']);

const byHolder = (step: Step): Step => {
  const by = (step as { by?: { expr?: string } }).by;
  return by?.expr === '@действующий' ? { ...step, by: { expr: '@носитель' } } as Step : step;
};

