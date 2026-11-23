import { compile, printFormula, operandText, NOT, degreeWords as tableWords, listOf, choiceTableOf, fieldOf, activationOf, loopOf, loopParam, loopsAt, splitsTargets, armsOf, sees, endOf, outcomeWords, namesAt, blockLabel, stepSaid, labelBlock, COST_BLOCK, COST_BLOCK_LABEL } from '@vtt/engine';
import type { NamePlace as Place } from '@vtt/engine';
import { withRole } from './roles.ts';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld, freeId } from '../../../store/world.ts';
import { stepIdsOf } from '../keys.ts';
import { STEP } from '../../../words.ts';
import { cardTitle, titleOf } from './words.ts';
import { Button, CardHead, Select, Verdict } from '../../../ui/primitives.tsx';
import { problemOf } from '../step-card.tsx';
import type { StepOutput } from '../slots.tsx';
import { outcomeRefs, fieldedOf } from '../slots.tsx';
import { groupSteps, moveGroup, moveSpan, blockSpan, removeSteps, armEnd, addArm, unwrapBlock, BRICKS, SEEN_BRICKS } from '../cards.ts';
import type { Removal } from '../cards.ts';
import { FlowHead, FlowActions, ArmLabel, OutcomePick, HeadFrame } from './cards/flow-parts.tsx';
import { newCost, saidId } from '../factory.ts';
import { GroupCard } from './cards/group-card.tsx';
import { sheetsAt, placeNamesAt, placeTablesAt } from './names.ts';
import { filledStep } from './call-args.ts';
import { useOpened } from '../../../store/opened.ts';
import { findDonorBlock, copyDonorBlock } from '../donors.tsx';
import type { System, Effect, Step, ValueKind } from '@vtt/schema';

export type Lane = 'steps' | 'cost';

const CALL_PREFIX = 'call:';

const ABOVE_PAY = 'над чертой «Плата»: выполняется сначала и один раз';
const BELOW_PAY = 'под черту «Плата»: в шаги';

export const callableOf = (system: System, except: string): [string, Effect, string | undefined][] =>
  Object.entries(system.effects ?? {})
    .filter(([key, one]) => key !== except && activationOf(one) !== 'passive')
    .map(([key, one]) => [key, one, one.group || undefined] as [string, Effect, string | undefined])
    .sort((a, b) => (a[2] ?? '').localeCompare(b[2] ?? '', 'ru') || (a[1].label || a[0]).localeCompare(b[1].label || b[0], 'ru'));

const callOptions = (system: System, except: string): (readonly [string, string] | readonly [string, string, string])[] =>
  callableOf(system, except).map(([key, one, group]) => (group ? [`${CALL_PREFIX}${key}`, one.label || key, group] as const : [`${CALL_PREFIX}${key}`, one.label || key] as const));

const callStep = (system: System, caller: Effect, key: string, earlier: readonly Step[]): Step =>
  filledStep(system, caller, { type: 'emit', effect: key }, earlier) as unknown as Step;

function negationOf(text: string): { negated: boolean; inner: string } {
  try {
    const ast = compile(text).ast;
    return ast.kind === 'Unary' && ast.op === NOT ? { negated: true, inner: printFormula(ast.operand) } : { negated: false, inner: printFormula(ast) };
  } catch { return { negated: false, inner: text.trim() }; }
}

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
      .filter(({ step }) => step.id || (loopsAt(step) && (loopOf(effect.params, step as { of?: unknown }) || loopParam(step as never))))
      .map(({ step, at }) => {
        const row = loopsAt(step) ? loopParam(step as never) : null;
        const loop = loopsAt(step) ? loopOf(effect.params, step as { of?: unknown }) : null;
        const called = loopsAt(step) ? row?.label ?? loop?.label : cardTitle(cards, at, system, effect);
        return {
          id: String(loopsAt(step) ? row?.key ?? loop?.key : step.id), ...(!loopsAt(step) && step.label ? { label: step.label } : {}), type: step.type, ...fieldedOf(system, effect.params ?? [], step),
          ...(splitsTargets(step) ? { splits: true } : {}),
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
  const seen = useRef<{ name: string; keys: string[]; shapes: { key: string; shape: string }[] } | null>(null);
  const shapes = cards.filter(card => card.kind !== 'flow').map(card => ({ key: foldKey(card), shape: JSON.stringify(card.step) }));
  useEffect(() => {
    const now = signature ? signature.split('\n') : [];
    const before = seen.current;
    seen.current = { name, keys: now, shapes };
    if (!before || before.name !== name || before.keys.join('\n') === signature) return;
    const state = useOpened.getState().opened;
    const queue = new Map<string, string[]>();
    for (const { key, shape } of before.shapes) queue.set(shape, [...(queue.get(shape) ?? []), key]);
    const lit: string[] = [];
    const dim: string[] = [];
    const added: string[] = [];
    for (const { key, shape } of shapes) {
      const was = queue.get(shape)?.shift();
      if (was === undefined) { added.push(key); continue; }
      if (was === key) continue;
      (state[was] ? lit : dim).push(key);
      if (!now.includes(was)) dim.push(was);
    }
    const grew = shapes.length > before.shapes.length;
    const fresh = added.filter(key => grew || !before.keys.includes(key));
    if (dim.length) setOpen(dim, false);
    if (lit.length) setOpen(lit, true);
    if (fresh.length) setOpen(fresh, true);
  });

  type Option = { value: unknown; label: string };
  type Cases = { ref: string; options: Option[]; title: string; group?: (typeof cards)[number]; g?: number };
  const caseAt = (head: Step | undefined): { ref: string; value: unknown } | null => {
    try {
      const ast = compile(String((head as { if?: { expr?: unknown } } | undefined)?.if?.expr ?? '')).ast;
      return ast.kind === 'Binary' && ast.op === '==' && ast.left.kind === 'Ref' && (ast.right.kind === 'Text' || ast.right.kind === 'Number')
        ? { ref: ast.left.tag, value: ast.right.value } : null;
    } catch { return null; }
  };
  const literalOf = (value: unknown): string => (typeof value === 'number' ? String(value) : JSON.stringify(String(value)));
  const same = (a: unknown, b: unknown): boolean => String(a) === String(b);
  const tableOptions = (table: string | undefined): Option[] => (listOf(system, table) ?? []).map(row => ({ value: row.value, label: row.label }));
  const choiceReturnOf = (step: Step | undefined, key?: string) => {
    const called = step?.type === 'emit' ? (step as { effect?: unknown }).effect : undefined;
    return typeof called === 'string'
      ? (system.effects?.[called]?.returns ?? []).find(one => one.kind === 'choice' && one.from && !one.many && (key === undefined || one.key === key))
      : undefined;
  };
  const degreeWords = (sys: typeof system, degrees: unknown): string[] =>
    (Array.isArray(degrees) ? [...new Set(degrees.map(one => String((one as { label?: unknown }).label ?? '')).filter(Boolean))] : tableWords(sys, (degrees as { table?: string } | undefined)?.table));
  const saidOf = (key: string): string => stepSaid(steps.find(step => step.id === key) ?? { id: key });
  const sourceOf = (ref: string, open: number): { options: Option[]; title: string } | null => {
    if (ref.endsWith('.degree')) {
      const id = ref.slice(0, -'.degree'.length);
      const check = steps.find(step => step.type === 'check' && step.id === id);
      const words = check ? degreeWords(system, (check as { degrees?: unknown }).degrees) : [];
      return words.length ? { options: words.map(value => ({ value, label: value })), title: `ступени «${saidOf(id)}»` } : null;
    }
    const param = (effect.params ?? []).find(one => one.key === ref && one.kind === 'choice' && one.from && !one.many);
    if (param) {
      const options = tableOptions(param.from);
      return options.length ? { options, title: `«${param.label ?? param.key}»` } : null;
    }
    const dot = ref.indexOf('.');
    const choice = dot > 0 ? choiceReturnOf(steps.find(step => step.type === 'emit' && step.id === ref.slice(0, dot)), ref.slice(dot + 1)) : undefined;
    if (choice) {
      const options = tableOptions(choice.from);
      return options.length ? { options, title: `«${choice.label ?? choice.key}» (${saidOf(ref.slice(0, dot))})` } : null;
    }
    const sheets = sheetsAt(system, id, placeAt(open));
    if (dot > 0 && sheets.has(ref.slice(0, dot))) {
      const field = fieldOf(system, ref.slice(dot + 1));
      const options = tableOptions(choiceTableOf(field));
      return field && options.length ? { options, title: `«${field.label}» (${sheets.get(ref.slice(0, dot))})` } : null;
    }
    return null;
  };
  const headsOf = (open: number): number[] => {
    const end = endOf(steps, open);
    return [open, ...steps.flatMap((step, index) => (index > open && index < end && step.type === 'orElse' && arms[index]?.length === (arms[open]?.length ?? 0) + 1 && arms[index]?.[arms[index]!.length - 1]?.open === open ? [index] : []))];
  };
  const casesAt = (open: number): Cases | null => {
    const conditioned = headsOf(open).filter(head => (steps[head] as { if?: unknown }).if !== undefined);
    const first = caseAt(steps[conditioned[0]!]);
    if (!first || !conditioned.every(head => caseAt(steps[head])?.ref === first.ref)) return null;
    const source = sourceOf(first.ref, open);
    return source ? { ref: first.ref, ...source } : null;
  };
  const degreesOf = (group: (typeof cards)[number]): string[] =>
    (group.kind === 'check' ? degreeWords(system, (group.step as { degrees?: unknown }).degrees) : []);
  const casesOf = (group: (typeof cards)[number], open: number): Cases | null => {
    const found = group.step.id && (degreesOf(group).length || choiceReturnOf(group.step)) ? casesAt(open) : null;
    const own = `${String(group.step.id)}.`;
    return found && (found.ref === `${own}degree` || (found.ref.startsWith(own) && choiceReturnOf(group.step, found.ref.slice(own.length)))) ? found : null;
  };

  const checkWords = (group: (typeof cards)[number]) => {
    const roll = steps.find(one => one.id && `@${one.id}` === String((group.step as { value?: { expr?: unknown } }).value?.expr ?? '').trim());
    const tags = (((roll as { tags?: unknown[] } | undefined)?.tags) ?? []).filter((tag): tag is string => typeof tag === 'string');
    return outcomeWords(system, tags);
  };

  const cardOf = (group: (typeof cards)[number], g: number, whole?: [number, number], fused?: { outcome: string; unwrap?: () => void; cond?: ReactNode; by?: string }) => {
    const asIf = Boolean(fused);
    const at = numberOf(g) - 1;
    const range = whole ? span(whole[0], whole[1]) : group.indices;
    const problem = group.indices.map(i => problems[i]).find(Boolean) ?? null;

    const donorFix = problem?.missingField ? findDonorBlock(problem.missingField) : null;

    const calledKey = group.step.type === 'emit' ? (group.step as { effect?: unknown }).effect : undefined;
    const own = steps.indexOf(group.step);
    const after = (base: string, make: (id: string) => Step[]) => () => edit(draft => {
      const list = draft.steps ?? [];
      const step = list[own] as Step & { id?: string };
      if (!step.id) {
        const named = saidId([...stepIdsOf(draft), ...(draft.params ?? []).map(p => p.key)], (system.effects?.[base]?.label ?? base).toLowerCase());
        step.id = named.id;
        if (named.label) (step as { label?: string }).label = named.label;
      }
      list.splice(group.indices[group.indices.length - 1]! + 1, 0, ...make(String(step.id)), { type: 'end' } as unknown as Step);
    });
    const branch = (expr: string): Step => ({ type: 'branch', if: { expr } }) as unknown as Step;
    const arms = (ref: string, values: readonly unknown[]): Step[] =>
      values.map((value, k) => ({ type: k ? 'orElse' : 'branch', if: { expr: `@${ref} == ${literalOf(value)}` } }) as unknown as Step);
    const returns = typeof calledKey === 'string' ? system.effects?.[calledKey]?.returns ?? [] : [];
    const degrees = asIf ? [] : degreesOf(group);
    const words = group.kind === 'check' && !asIf ? checkWords(group) : null;
    const ifBy: { label: string; run: () => void }[] = fused ? [] : [
      ...(words ? [{ label: `${words.success} / ${words.fail}`, run: after('проверка', id => [branch(`@${id}.success`)]) }] : []),
      ...(degrees.length ? [{ label: `ступени: ${degrees.join(' · ')}`, run: after('проверка', id => arms(`${id}.degree`, degrees)) }] : []),
    ];
    const byOutput: Record<string, () => void> = fused ? {} : Object.fromEntries(returns.flatMap((one): [string, () => void][] => {
      if (one.kind === 'boolean') return [[one.key, after(String(calledKey), id => [branch(`@${id}.${one.key}`)])]];
      const options = one.kind === 'choice' && one.from && !one.many ? tableOptions(one.from) : [];
      const flags = options.length ? (system.tables?.[one.from!]?.columns ?? []).filter(column => column.kind === 'boolean') : [];
      return [
        ...(options.length ? [[one.key, after(String(calledKey), id => arms(`${id}.${one.key}`, options.map(option => option.value)))] as [string, () => void]] : []),
        ...flags.map(column => [`${one.key}.${column.key}`, after(String(calledKey), id => [branch(`@${id}.${one.key}.${column.key}`)])] as [string, () => void]),
      ];
    }));
    const glued = fused && group.step.id ? steps[group.indices[group.indices.length - 1]! + 1] : undefined;
    const activeOutput = glued ? new RegExp(`@${String(group.step.id)}\\.([\\p{L}\\p{N}_]+(?:\\.[\\p{L}\\p{N}_]+)?)`, 'u').exec(String((glued as { if?: { expr?: unknown } }).if?.expr ?? ''))?.[1] : undefined;

    return (
      <GroupCard
        key={group.indices[0]}
        group={group}
        asIf={asIf}
        {...(fused ? { outcome: fused.outcome } : {})}
        {...(fused?.unwrap ? { onUnwrap: fused.unwrap } : {})}
        {...(fused?.cond ? { headCond: fused.cond } : {})}
        {...(fused?.by ? { headBy: fused.by } : {})}
        {...(ifBy.length ? { ifBy } : {})}
        {...(Object.keys(byOutput).length ? { byOutput } : {})}
        {...(activeOutput ? { activeOutput } : {})}
        position={startAt + at + 1}
        system={system}
        effect={effect}
        earlier={[
          ...earlierOf(group.indices[0]!),
        ]}
        problem={problem}
        sheets={sheetsAt(system, id, placeAt(group.indices[0]!))}
        names={placeNamesAt(system, id, placeAt(group.indices[0]!))}
        tables={placeTablesAt(system, id, placeAt(group.indices[0]!))}
        scope={namesAt(system, id, placeAt(group.indices[0]!))}
        lane={lane}
        folded={!opened[foldKey(group)]}
        onFold={() => toggleFold(foldKey(group))}
        problemAction={donorFix ? (
          <Button size="sm" onClick={() => copyDonorBlock(donorFix.donor, donorFix.group)}>
            {`взять блок «${blockLabel(donorFix.donor, donorFix.group)}» из «${donorFix.donor.name}»`}
          </Button>
        ) : undefined}
        onAddParam={addParam}
        takenNames={takenStepNames()}
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
              ...saidId(taken, 'число'), type: 'roll',
            } as never);
            amountAt = applyAt;
          }
          const amount = steps[amountAt]!;
          change(amount, steps[amountAt + 1]!, String(amount.id));
        })}
        onDelete={() => {
          let before: Step[] = steps;
          let removal: Removal = { steps, cleared: [] };
          edit(draft => {
            before = structuredClone(draft.steps ?? []);
            removal = removeSteps(draft.steps ?? [], range);
            draft.steps = removal.steps;
          });
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
      />
    );
  };

  const outcomeOf = (group: (typeof cards)[number], head: Step): { yes: string; no: string; negated: boolean } | null => {
    const { negated, inner: ref } = negationOf(String((head as { if?: { expr?: unknown } }).if?.expr ?? ''));
    const id = String(group.step.id);
    if (group.kind === 'check' && ref === `@${id}.success`) {
      const words = checkWords(group);
      return { yes: words.success, no: words.fail, negated };
    }
    const called = (group.step as { effect?: unknown }).effect;
    if (group.step.type === 'emit' && typeof called === 'string' && ref.startsWith(`@${id}.`)) {
      const key = ref.slice(id.length + 2);
      const column = (system.effects?.[called]?.returns ?? []).find(one => one.key === key && one.kind === 'boolean') as { label?: string; no?: string } | undefined;
      if (column) return { yes: column.label ?? key, no: column.no ?? `не ${column.label ?? key}`, negated };
      const [head, flag] = key.split('.');
      const choice = flag ? (system.effects?.[called]?.returns ?? []).find(one => one.key === head && one.kind === 'choice' && one.from && !one.many) : undefined;
      const table = choice?.from ? system.tables?.[choice.from] : undefined;
      if (table && (table.columns ?? []).some(one => one.key === flag && one.kind === 'boolean')) {
        const side = (wanted: boolean) => (table.rows ?? []).filter(row => Boolean((row.cells as Record<string, unknown> | undefined)?.[flag!]) === wanted).map(row => row.label || String(row.value)).join(' · ');
        return { yes: side(true), no: side(false), negated };
      }
    }
    return null;
  };

  const groupAt = (index: number) => cards.findIndex(card => card.indices[0] === index);

  const contextAt = (index: number) => ({
    system, effect, earlier: earlierOf(index),
    ...(sheetsAt(system, id, placeAt(index)) ? { sheets: sheetsAt(system, id, placeAt(index)) } : {}),
    names: placeNamesAt(system, id, placeAt(index)),
    tables: placeTablesAt(system, id, placeAt(index)),
    scope: namesAt(system, id, placeAt(index)),
  });

  const armAdd = (head: number) => (
    <Select<string>
      value=""
      title="Добавить шаг в эту ветку"
      options={[['', '+ шаг'],
        ...callOptions(system, id),
        ...[...BRICKS, ...(onRoll ? SEEN_BRICKS : [])].filter(b => !loopsAt({ type: b.key })).map(b => [b.key, b.label.replace(/^\+ /, '')] as const)]}
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

  const block = (open: number, fused?: { group: (typeof cards)[number]; g: number; yes: string; no: string; negated: boolean }, cases?: Cases): { node: ReactNode; next: number } => {
    const end = endOf(steps, open);
    const heads = headsOf(open);
    const caseOf = (head: number): string => {
      const found = caseAt(steps[head]);
      return cases?.options.find(option => same(option.value, found?.value))?.label ?? String(found?.value ?? 'иначе');
    };
    const bareElse = heads.slice(1).some(head => (steps[head] as { if?: unknown }).if === undefined);
    const problem = (index: number) => problems[index]?.text ?? null;
    const inside = cards.filter(card => card.indices[0]! > open && card.indices[0]! < end);
    const guard = !fused && heads.length === 1 && inside.length === 1 && inside[0]!.kind === 'stop';
    const outcomes = fused ? { first: fused.negated ? fused.no : fused.yes, other: fused.negated ? fused.yes : fused.no } : null;
    const dropArm = (head: number) => () => edit(draft => { const list = draft.steps ?? []; draft.steps = removeSteps(list, span(head, armEnd(list, head) - 1)).steps; });
    const callPick = fused && fused.group.step.type === 'emit' ? (() => {
      const called = String((fused.group.step as { effect?: unknown }).effect ?? '');
      const callee = system.effects?.[called];
      const quick = outcomeRefs([{ id: String(fused.group.step.id), ...(fused.group.step.label ? { label: fused.group.step.label } : {}), type: 'emit', ...(callee?.label ? { title: callee.label } : {}), outputs: returnsOf(system, fused.group.step) }])
        .filter(one => one.kind === 'boolean')
        .map(one => {
          const bare = (text: string) => text.slice(text.indexOf(' — ') + 3);
          return { ref: one.ref, label: bare(one.label), kind: 'boolean' as const, ...(one.no ? { no: bare(one.no) } : {}) };
        });
      if (!quick.length) return undefined;
      const written = String((steps[open] as { if?: { expr?: unknown } }).if?.expr ?? '');
      const refId = `@${fused.group.step.id}.`;
      return (
        <OutcomePick
          quick={quick} value={written}
          onPick={expr => edit(draft => { (draft.steps![open] as { if?: { expr: string } }).if = { expr }; })}
          onFormula={() => edit(draft => {
            const head = draft.steps![open] as { if?: { expr: string } };
            const text = String(head.if?.expr ?? '').trim();
            const { negated, inner } = negationOf(text);
            head.if = { expr: `${operandText(inner.startsWith(refId) ? inner : text, '==')} == ${negated ? 'false' : 'true'}` };
          })}
        />
      );
    })() : undefined;
    const unwrap = heads.length === 1 && inside.length ? () => edit(draft => { draft.steps = unwrapBlock(draft.steps ?? [], open); }) : undefined;
    const headActions = (
      <FlowActions
        onUp={open === 0
          ? (onEdgeUp ? () => onEdgeUp(span(open, end)) : undefined)
          : () => edit(draft => { draft.steps = moveSpan(draft.steps ?? [], blockSpan(draft.steps ?? [], open), -1, true); })}
        onDown={end === steps.length - 1
          ? (onEdgeDown ? () => onEdgeDown(span(open, end)) : undefined)
          : () => edit(draft => { draft.steps = moveSpan(draft.steps ?? [], blockSpan(draft.steps ?? [], open), 1, true); })}
        upTitle={open === 0 && onEdgeUp ? ABOVE_PAY : undefined}
        downTitle={end === steps.length - 1 && onEdgeDown ? BELOW_PAY : undefined}
        onKeep={unwrap}
        onDelete={() => edit(draft => { const list = draft.steps ?? []; draft.steps = removeSteps(list, span(open, endOf(list, open))).steps; })}
      />
    );
    const node = (
      <div className={`flow-block${guard ? ' flow-block--guard' : ''}${fused ? ' flow-block--check' : ''}`} key={`block:${open}`}>
        {heads.map((head, k) => {
          const stop = k + 1 < heads.length ? heads[k + 1]! : end;
          const first = groupAt(head + 1);
          const last = groupAt(stop);
          const conditioned = k === 0 || (steps[head] as { if?: unknown }).if !== undefined;
          const label = cases ? (conditioned ? `${caseOf(head)}:` : 'иначе:')
            : conditioned ? (k === 0 && outcomes ? `${outcomes.first}:` : 'тогда:') : outcomes ? `${outcomes.other}:` : 'иначе:';
          const armActions = <FlowActions onDelete={dropArm(head)} deleteLabel="убрать ветку" />;
          return (
            <div className="flow-block__part" key={head}>
              {k === 0 && fused && outcomes
                ? cardOf(fused.group, fused.g, [fused.group.indices[0]!, end], { outcome: `${outcomes.first} / ${outcomes.other}`, ...(unwrap ? { unwrap } : {}), ...(callPick ? { cond: callPick } : {}) })
                : k === 0 && cases ? (cases.group && cases.g !== undefined
                  ? cardOf(cases.group, cases.g, [cases.group.indices[0]!, end], { outcome: caseOf(open), by: cases.title })
                  : <HeadFrame word="По" actions={headActions}><span className="flow-head__words">{cases.title}</span></HeadFrame>)
                : cases ? <ArmLabel word={label} actions={armActions} />
                : conditioned ? <FlowHead
                  word={k === 0 ? 'Если' : 'Иначе, если'} step={steps[head]!} context={contextAt(head)} earlier={earlierOf(head)}
                  required problem={problem(head)} {...(guard && k === 0 ? { tail: 'стоп' } : {})}
                  edit={change => edit(draft => { change(draft.steps![head]!); })}
                  actions={k === 0 ? headActions : armActions}
                /> : <ArmLabel word={label} actions={armActions} />}
              <div className="flow-block__arm">
                {conditioned && !(cases && k > 0) ? <span className="flow-block__then">{label}</span> : null}
                {first >= 0 && last > first ? render(first, last) : <span className="faint">пусто — добавьте шаг</span>}
                <div className="flow-block__add">{armAdd(head)}</div>
              </div>
            </div>
          );
        })}
        <div className="flow-block__foot">
          {cases ? cases.options.filter(option => !heads.some(head => same(caseAt(steps[head])?.value, option.value))).map(option => (
            <Button key={String(option.value)} size="sm" variant="ghost" onClick={() => edit(draft => { draft.steps = addArm(draft.steps ?? [], open, true, `@${cases.ref} == ${literalOf(option.value)}`); })}>+ {option.label}</Button>
          )) : <Button size="sm" variant="ghost" onClick={() => edit(draft => { draft.steps = addArm(draft.steps ?? [], open, true); })}>+ иначе, если</Button>}
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
        const loose = casesAt(group.indices[0]!);
        const made = block(group.indices[0]!, undefined, loose ?? undefined);
        out.push(made.node);
        g = made.next > g ? made.next : g + 1;
        continue;
      }
      const next = cards[g + 1];
      const cases = group.step.id && next?.kind === 'flow' && next.step.type === 'branch' ? casesOf(group, next.indices[0]!) : null;
      if (cases) {
        const made = block(next!.indices[0]!, undefined, { group, g, ...cases });
        out.push(made.node);
        g = made.next > g ? made.next : g + 2;
        continue;
      }
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
        <Select<string>
          value=""
          title="Вызвать другой эффект системы шагом: он выполнится здесь"
          options={[['', '+ эффект'], ...callOptions(system, id)]}
          onChange={key => {
            if (!key.startsWith(CALL_PREFIX)) return;
            const called = key.slice(CALL_PREFIX.length);
            edit(draft => {
              const made = callStep(system, draft, called, draft.steps ?? []);
              (draft.steps ??= []).push(made);
            });
          }}
        />
        {onAddCost ? <CostPick system={system} except={id} onPick={onAddCost} /> : null}
        </div>
      </div>}
    </>
  );
}

export function PayDivider({ system, except, onAdd }: { system: System; except?: string; onAdd?: (id: string) => void }) {
  return (
    <div className="pay-divider" title="Плата: шаги выше выполняются сначала. Не хватило — действие не состоится, ничего не изменится.">
      <span className="pay-divider__word">Плата</span>
      <span className="pay-divider__hint">не хватило — действие не состоится</span>
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
          editSystem(draft => { draft.effects[made.key] = made.value; if (blockLabel(draft, COST_BLOCK) === COST_BLOCK) labelBlock(draft, COST_BLOCK, COST_BLOCK_LABEL); });
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

