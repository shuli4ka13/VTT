import { withRole } from './roles.ts';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld, freeId } from '../../../store/world.ts';
import { renameStep, stepIdsOf } from '../keys.ts';
import { STEP } from '../../../words.ts';
import { loopOf, loopParam } from '@vtt/engine/engine/steps/each';
import { cardTitle, titleOf } from './words.ts';
import { Button, CardHead, Select, Verdict } from '../../../ui/primitives.tsx';
import { problemOf } from '../step-card.tsx';
import type { StepOutput } from '../slots.tsx';
import { outcomeRefs } from '../slots.tsx';
import { groupSteps, moveGroup, moveSpan, blockSpan, removeSteps, armEnd, wrapInBranch, addArm, unwrapBlock, BRICKS, SEEN_BRICKS } from '../cards.ts';
import { armsOf, sees, endOf } from '@vtt/engine/model/flow';
import { FlowHead, FlowActions, ArmLabel, UnwrapButton, OutcomePick } from './cards/flow-parts.tsx';
import { outcomeWords } from '@vtt/engine/engine/roll-tags';
import { newCost } from '../factory.ts';
import { GroupCard } from './cards/group-card.tsx';
import { sheetsAt, placeNamesAt } from './names.ts';
import { filledStep } from './call-args.ts';
import { namesAt } from '@vtt/engine/model/names-at';
import type { Place } from '@vtt/engine/model/names-at';
import { useOpened } from '../../../store/opened.ts';
import { findDonorBlock, copyDonorBlock } from '../donors.tsx';
import type { System, Effect, Step, ValueKind, Compendium } from '@vtt/schema';

export type Lane = 'steps' | 'cost';

const CALL_PREFIX = 'call:';

const ABOVE_PAY = 'над чертой «Плата»: выполняется сначала и один раз';
const BELOW_PAY = 'под черту «Плата»: в шаги';

export const bricksOf = (system: System, except: string, compendium: Compendium | null = null): [string, Effect][] =>
  withRole(system, compendium, 'step', except);

const callStep = (system: System, caller: Effect, key: string, earlier: readonly Step[]): Step =>
  filledStep(system, caller, { type: 'emit', effect: key }, earlier) as unknown as Step;

export function Chain({ id, placeAt, effect, system, edit, title = 'Шаги', empty = 'шагов ещё нет — эффект ничего не делает', lane = 'steps', onEdgeUp, onEdgeDown, bare = false, lined = false, startAt = 0, lead, onAddCost, onRoll = false }: {
  id: string;
  placeAt: (index: number) => Place;
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
  title?: string;
  empty?: string;
  lane?: Lane;
  onEdgeUp?: (indices: number[]) => void;
  onEdgeDown?: (indices: number[]) => void;
  bare?: boolean;
  lined?: boolean;
  startAt?: number;
  lead?: ReactNode;
  onAddCost?: (id: string) => void;
  onRoll?: boolean;
}) {
  const pick = useWorld(s => s.pick);
  const compendium = useWorld(s => s.compendium);
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
  const takenStepNames = (): string[] => {
    const whole = useWorld.getState().system.effects[id] ?? effect;
    return [...stepIdsOf(whole), ...(whole.params ?? []).map(p => p.key)];
  };

  const cards = groupSteps(steps);

  const numbers = new Map<number, number>();
  cards.forEach((card, g) => { if (card.kind !== 'flow') numbers.set(g, numbers.size + 1); });
  const numberOf = (g: number) => numbers.get(g) ?? 0;
  const arms = armsOf(steps);

  const earlierOf = (index: number) =>
    steps.slice(0, index)
      .map((step, at) => ({ step, at }))
      .filter(({ at }) => sees(arms, at, index))
      .filter(({ step }) => step.id || (step.type === 'each' && (loopOf(effect.params, step as { of?: unknown }) || loopParam(step as never))))
      .map(({ step, at }) => {
        const row = step.type === 'each' ? loopParam(step as never) : null;
        const loop = step.type === 'each' ? loopOf(effect.params, step as { of?: unknown }) : null;
        const called = step.type === 'each' ? row?.label ?? loop?.label : cardTitle(cards, at, system, effect);
        return {
          id: String(step.type === 'each' ? row?.key ?? loop?.key : step.id), type: step.type,
          ...(called ? { title: called } : {}),
          ...(row?.from ? { table: row.from } : {}),
          ...(returnsOf(system, step).length ? { outputs: returnsOf(system, step) } : {}),
        };
      });

  const visible = useMemo(() => namesAt(system, id, placeAt(0)).filter(one => one.group !== 'step' && one.group !== 'loop'), [system, id, JSON.stringify(placeAt(0))]);
  const problems = steps.map((step, index) => problemOf(step, system, effect, earlierOf(index), visible));

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

  const cardOf = (group: (typeof cards)[number], g: number, whole?: [number, number], fused?: { outcome: string; unwrap?: () => void; cond?: ReactNode }) => {
    const asIf = Boolean(fused);
    const at = numberOf(g) - 1;
    const range = whole ? span(whole[0], whole[1]) : group.indices;
    const problem = group.indices.map(i => problems[i]).find(Boolean) ?? null;

    const donorFix = problem?.missingField ? findDonorBlock(problem.missingField) : null;

    const calledKey = group.step.type === 'emit' ? (group.step as { effect?: unknown }).effect : undefined;
    const flag = typeof calledKey === 'string' ? (system.effects?.[calledKey]?.returns ?? []).find(one => one.kind === 'boolean') : undefined;
    const ifByOutcome = flag && !asIf && typeof calledKey === 'string' ? () => edit(draft => {
      const list = draft.steps ?? [];
      const step = list[group.indices[0]!] as Step & { id?: string };
      if (!step.id) step.id = freeId([...stepIdsOf(draft), ...(draft.params ?? []).map(p => p.key)], calledKey);
      const at = group.indices[group.indices.length - 1]! + 1;
      list.splice(at, 0, { type: 'branch', if: { expr: `@${step.id}.${flag.key}` } } as unknown as Step, { type: 'end' } as unknown as Step);
    }) : undefined;

    return (
      <GroupCard
        key={group.indices[0]}
        group={group}
        asIf={asIf}
        {...(fused ? { outcome: fused.outcome } : {})}
        {...(fused?.unwrap ? { onUnwrap: fused.unwrap } : {})}
        {...(fused?.cond ? { headCond: fused.cond } : {})}
        {...(ifByOutcome ? { onIfByOutcome: ifByOutcome } : {})}
        position={startAt + at + 1}
        system={system}
        effect={effect}
        earlier={[
          ...earlierOf(group.indices[0]!),
          ...(group.amount?.id
            ? [{ id: String(group.amount.id), type: 'roll' }]
            : []),
        ]}
        problem={problem}
        sheets={sheetsAt(system, id, placeAt(group.indices[0]!))}
        names={placeNamesAt(system, id, placeAt(group.indices[0]!))}
        lane={lane}
        folded={!opened[foldKey(group)]}
        onFold={() => toggleFold(foldKey(group))}
        {...(group.kind === 'check' && group.amount ? { onUnpair: () => edit(draft => { draft.steps = (draft.steps ?? []).filter((_, i) => i !== group.indices[0]); }) } : {})}
        problemAction={donorFix ? (
          <Button size="sm" onClick={() => copyDonorBlock(donorFix.donor, donorFix.group)}>
            {`взять блок «${donorFix.group}» из «${donorFix.donor.name}»`}
          </Button>
        ) : undefined}
        onAddParam={addParam}
        takenNames={takenStepNames()}
        onRename={(from, to) => useWorld.getState().editEffect(id, draft => renameStep(draft, from, to))}
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
              id: freeId(taken, 'число'), type: 'roll',
            } as never);
            amountAt = applyAt;
          }
          const amount = steps[amountAt]!;
          change(amount, steps[amountAt + 1]!, String(amount.id));
        })}
        onDelete={() => {
          const before = structuredClone(steps);
          const removal = removeSteps(steps, range);
          edit(draft => { draft.steps = removal.steps; });
          const kept = groupSteps(removal.steps);
          const where = (c: { step: number; slot: string }) => `${cardTitle(kept, c.step, system, effect) ?? STEP.one} · ${c.slot.replace(/ \(формула\)$/, '')}`;
          const cleared = removal.cleared.filter(c => !c.slot.endsWith('(формула)'));
          const left = removal.cleared.filter(c => c.slot.endsWith('(формула)'));
          const gone = titleOf(group.kind, group.step, system, effect);
          setRemoved({
            before,
            after: JSON.stringify(removal.steps),
            text: [
              `Убран ${STEP.one}: ${gone}`,
              cleared.length ? `ссылки на него очищены: ${cleared.map(where).join(', ')}` : '',
              left.length ? `остались в формулах — поправьте: ${left.map(where).join(', ')}` : '',
            ].filter(Boolean).join('; '),
          });
        }}
        onMoveUp={g === 0
          ? (onEdgeUp && group.kind !== 'split' ? () => onEdgeUp(range) : undefined)
          : () => edit(draft => {
            draft.steps = whole ? moveSpan(draft.steps ?? [], whole, -1, true) : moveGroup(draft.steps ?? [], g, -1);
          })}
        onMoveDown={(whole ? whole[1] : group.indices[group.indices.length - 1]!) === steps.length - 1
          ? (onEdgeDown ? () => onEdgeDown(range) : undefined)
          : () => edit(draft => {
            draft.steps = whole ? moveSpan(draft.steps ?? [], whole, 1, true) : moveGroup(draft.steps ?? [], g, 1);
          })}
        upTitle={g === 0 && onEdgeUp ? ABOVE_PAY : undefined}
        downTitle={onEdgeDown && (whole ? whole[1] : group.indices[group.indices.length - 1]!) === steps.length - 1 ? BELOW_PAY : undefined}
        {...(group.kind !== 'split' && group.kind !== 'stop' && !asIf ? { onWrap: () => edit(draft => {
          draft.steps = wrapInBranch(draft.steps ?? [], range[0]!, range[range.length - 1]!);
        }) } : {})}
      />
    );
  };

  const outcomeOf = (group: (typeof cards)[number], head: Step): { yes: string; no: string; negated: boolean } | null => {
    const cond = String((head as { if?: { expr?: unknown } }).if?.expr ?? '').replace(/\s+/g, '');
    const negated = cond.startsWith('не(') && cond.endsWith(')');
    const ref = negated ? cond.slice(3, -1) : cond;
    const id = String(group.step.id);
    if (group.kind === 'check' && ref === `@${id}.success`) {
      const roll = group.amount ?? steps.find(one => one.id && `@${one.id}` === String((group.step as { value?: { expr?: unknown } }).value?.expr ?? '').trim());
      const tags = (((roll as { tags?: unknown[] } | undefined)?.tags) ?? []).filter((tag): tag is string => typeof tag === 'string');
      const words = outcomeWords(system, tags);
      return { yes: words.success, no: words.fail, negated };
    }
    const called = (group.step as { effect?: unknown }).effect;
    if (group.step.type === 'emit' && typeof called === 'string' && ref.startsWith(`@${id}.`)) {
      const key = ref.slice(id.length + 2);
      const column = (system.effects?.[called]?.returns ?? []).find(one => one.key === key && one.kind === 'boolean') as { label?: string; no?: string } | undefined;
      if (column) return { yes: column.label ?? key, no: column.no ?? `не ${column.label ?? key}`, negated };
    }
    return null;
  };

  const groupAt = (index: number) => cards.findIndex(card => card.indices[0] === index);

  const contextAt = (index: number) => ({
    system, effect, earlier: earlierOf(index),
    ...(sheetsAt(system, id, placeAt(index)) ? { sheets: sheetsAt(system, id, placeAt(index)) } : {}),
    names: placeNamesAt(system, id, placeAt(index)),
  });

  const armAdd = (head: number) => (
    <Select<string>
      value=""
      title="Добавить шаг в эту ветку"
      options={[['', '+ шаг'],
        ...bricksOf(system, id, compendium).map(([key, one]) => [`${CALL_PREFIX}${key}`, one.label || key] as const),
        ...[...BRICKS, ...(onRoll ? SEEN_BRICKS : [])].filter(b => b.key !== 'each').map(b => [b.key, b.label.replace(/^\+ /, '')] as const)]}
      onChange={key => {
        const called = key.startsWith(CALL_PREFIX) ? key.slice(CALL_PREFIX.length) : null;
        const brick = [...BRICKS, ...SEEN_BRICKS].find(b => b.key === key);
        if (!brick && !called) return;
        edit(draft => {
          const list = draft.steps ?? (draft.steps = []);
          const taken = list.map(s => s.id).filter(Boolean) as string[];
          const at = armEnd(list, head);
          const made = called ? [callStep(system, draft, called, list.slice(0, at))] : brick!.make(system, taken, draft, sheetsAt(system, id, placeAt(at)));
          list.splice(at, 0, ...made);
        });
      }}
    />
  );

  const block = (open: number, fused?: { group: (typeof cards)[number]; g: number; yes: string; no: string; negated: boolean }): { node: ReactNode; next: number } => {
    const end = endOf(steps, open);
    const heads = [open, ...steps.flatMap((step, index) => (index > open && index < end && step.type === 'orElse' && arms[index]?.length === (arms[open]?.length ?? 0) + 1 && arms[index]?.[arms[index]!.length - 1]?.open === open ? [index] : []))];
    const bareElse = heads.slice(1).some(head => (steps[head] as { if?: unknown }).if === undefined);
    const problem = (index: number) => problems[index]?.text ?? null;
    const inside = cards.filter(card => card.indices[0]! > open && card.indices[0]! < end);
    const guard = !fused && heads.length === 1 && inside.length === 1 && inside[0]!.kind === 'stop';
    const outcomes = fused ? { first: fused.negated ? fused.no : fused.yes, other: fused.negated ? fused.yes : fused.no } : null;
    const dropArm = (head: number) => () => edit(draft => { const list = draft.steps ?? []; draft.steps = removeSteps(list, span(head, armEnd(list, head) - 1)).steps; });
    const callPick = fused && fused.group.step.type === 'emit' ? (() => {
      const called = String((fused.group.step as { effect?: unknown }).effect ?? '');
      const callee = system.effects?.[called];
      const quick = outcomeRefs([{ id: String(fused.group.step.id), type: 'emit', ...(callee?.label ? { title: callee.label } : {}), outputs: returnsOf(system, fused.group.step) }])
        .filter(one => one.kind === 'boolean')
        .map(one => ({ ref: one.ref, label: one.label, kind: 'boolean' as const, ...(one.no ? { no: one.no } : {}) }));
      const written = String((steps[open] as { if?: { expr?: unknown } }).if?.expr ?? '');
      const refId = `@${fused.group.step.id}.`;
      return (
        <OutcomePick
          quick={quick} value={written}
          onPick={expr => edit(draft => { (draft.steps![open] as { if?: { expr: string } }).if = { expr }; })}
          onFormula={() => edit(draft => {
            const head = draft.steps![open] as { if?: { expr: string } };
            const text = String(head.if?.expr ?? '').trim();
            const bare = text.startsWith('не(') && text.endsWith(')') ? text.slice(3, -1) : text;
            head.if = { expr: `${bare.startsWith(refId) ? bare : text} == ${text.startsWith('не(') ? 'нет' : 'да'}` };
          })}
        />
      );
    })() : undefined;
    const unwrap = heads.length === 1 ? () => edit(draft => { draft.steps = unwrapBlock(draft.steps ?? [], open); }) : undefined;
    const node = (
      <div className={`flow-block${guard ? ' flow-block--guard' : ''}${fused ? ' flow-block--check' : ''}`} key={`block:${open}`}>
        {heads.map((head, k) => {
          const stop = k + 1 < heads.length ? heads[k + 1]! : end;
          const first = groupAt(head + 1);
          const last = groupAt(stop);
          const conditioned = k === 0 || (steps[head] as { if?: unknown }).if !== undefined;
          const label = conditioned ? (k === 0 && outcomes ? `${outcomes.first}:` : 'тогда:') : outcomes ? `${outcomes.other}:` : 'иначе:';
          const armActions = <FlowActions onDelete={dropArm(head)} deleteLabel="убрать ветку" />;
          return (
            <div className="flow-block__part" key={head}>
              {k === 0 && fused && outcomes
                ? cardOf(fused.group, fused.g, [fused.group.indices[0]!, end], { outcome: outcomes.first, ...(unwrap ? { unwrap } : {}), ...(callPick ? { cond: callPick } : {}) })
                : conditioned ? <FlowHead
                  word={k === 0 ? 'Если' : 'Иначе, если'} step={steps[head]!} context={contextAt(head)} earlier={earlierOf(head)}
                  required problem={problem(head)} {...(guard && k === 0 ? { tail: 'стоп' } : {})}
                  edit={change => edit(draft => { change(draft.steps![head]!); })}
                  actions={k === 0 ? (
                    <FlowActions
                      onUp={open === 0
                        ? (onEdgeUp ? () => onEdgeUp(span(open, end)) : undefined)
                        : () => edit(draft => { draft.steps = moveSpan(draft.steps ?? [], blockSpan(draft.steps ?? [], open), -1, true); })}
                      onDown={end === steps.length - 1
                        ? (onEdgeDown ? () => onEdgeDown(span(open, end)) : undefined)
                        : () => edit(draft => { draft.steps = moveSpan(draft.steps ?? [], blockSpan(draft.steps ?? [], open), 1, true); })}
                      upTitle={open === 0 && onEdgeUp ? ABOVE_PAY : undefined}
                      downTitle={end === steps.length - 1 && onEdgeDown ? BELOW_PAY : undefined}
                      extra={unwrap ? <UnwrapButton onClick={unwrap} /> : null}
                      onDelete={() => edit(draft => { const list = draft.steps ?? []; draft.steps = removeSteps(list, span(open, endOf(list, open))).steps; })}
                    />
                  ) : armActions}
                /> : <ArmLabel word={label} actions={armActions} />}
              <div className="flow-block__arm">
                {conditioned ? <span className="flow-block__then">{label}</span> : null}
                {first >= 0 && last > first ? render(first, last) : <span className="faint">пусто — добавьте шаг</span>}
                <div className="flow-block__add">{armAdd(head)}</div>
              </div>
            </div>
          );
        })}
        <div className="flow-block__foot">
          <Button size="sm" variant="ghost" onClick={() => edit(draft => { draft.steps = addArm(draft.steps ?? [], open, true); })}>+ иначе, если</Button>
          {bareElse ? null : <Button size="sm" variant="ghost" onClick={() => edit(draft => { draft.steps = addArm(draft.steps ?? [], open, false); })}>{outcomes ? `+ ${outcomes.other}` : '+ иначе'}</Button>}
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
      const next = cards[g + 1];
      const verdict = group.step.id && next?.kind === 'flow' && next.step.type === 'branch' ? outcomeOf(group, next.step) : null;
      if (verdict) {
        const made = block(next!.indices[0]!, { group, g, ...verdict });
        out.push(made.node);
        g = made.next > g ? made.next : g + 2;
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

  const summary = (
    <>
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
    </>
  );

  const run = (
    <>
      {bare ? null : lined
        ? <div className="inline"><span className="chain-run__label">{title}</span><span className="spacer" />{summary}</div>
        : <CardHead title={title} actions={summary} />}
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
    </>
  );

  return (
    <>
      {lined && !bare ? <div className="chain-run">{run}</div> : run}

      {bare ? null : <div className="bricks">
        {bricksOf(system, id, compendium).length ? (
          <div className="bricks__row">
            <span className="bricks__title">Шаги для других</span>
            {bricksOf(system, id, compendium).map(([key, one]) => (
              <Button key={key} size="sm" title={one.description || `вызвать «${one.label || key}»`}
                onClick={() => edit(draft => {
                  const made = callStep(system, draft, key, draft.steps ?? []);
                  (draft.steps ??= []).push(made);
                })}>
                {one.label || key}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="bricks__row bricks__row--plain">
        <span className="bricks__title">Шаг</span>
        {[...BRICKS, ...(onRoll ? SEEN_BRICKS : [])].map(b => (
          <Button key={b.key} size="sm" title={b.hint}
            onClick={() => edit(draft => {
              const taken = (draft.steps ?? []).map(s => s.id).filter(Boolean) as string[];
              const at = (draft.steps ?? []).length;
              (draft.steps ??= []).push(...b.make(system, taken, draft, sheetsAt(system, id, placeAt(at))));
            })}>
            {b.label}
          </Button>
        ))}
        {onAddCost ? <CostPick system={system} except={id} onPick={onAddCost} /> : null}
        </div>
      </div>}
    </>
  );
}

export function PayDivider({ system, except, onAdd }: { system: System; except?: string; onAdd?: (id: string) => void }) {
  return (
    <div className="pay-divider" title="Плата: шаги выше выполняются сначала, один раз за действие, даже если целей несколько. Не хватило — действие не состоялось, ничего не изменилось.">
      <span className="pay-divider__word">Плата</span>
      <span className="pay-divider__hint">выше — сначала и один раз</span>
      {onAdd ? <CostPick system={system} except={except} onPick={onAdd} /> : null}
    </div>
  );
}

const NEW_COST = ':новая';

export function CostPick({ system, except, onPick }: { system: System; except?: string; onPick: (id: string) => void }) {
  const editSystem = useWorld(s => s.editSystem);
  const compendium = useWorld(s => s.compendium);
  return (
    <span className="add-cost">
      <Select<string>
        value=""
        title="Чего стоит эффект: выбранный эффект зовётся первым шагом; не хватило — эффект не состоится"
        options={[['', '+ плата'],
          ...withRole(system, compendium, 'pay', except).map(([id, cost]) => [id, cost.label || id] as const),
          ...withRole(system, compendium, 'step', except).map(([id, other]) => [id, other.label || id] as const),
          ...withRole(system, compendium, 'button', except).map(([id, other]) => [id, other.label || id] as const),
          [NEW_COST, '+ новая плата…']]}
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

const span = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, k) => from + k);

const returnsOf = (system: System, step: Step): StepOutput[] => {
  const called = (step as { effect?: unknown }).effect;
  if (step.type !== 'emit' || typeof called !== 'string') return [];
  return (system.effects?.[called]?.returns ?? []).map(column => ({
    path: `.${column.key}`, label: column.label ?? column.key,
    ...(column.kind ? { kind: String(column.kind) } : {}),
    ...(column.no ? { no: column.no } : {}),
  }));
};

