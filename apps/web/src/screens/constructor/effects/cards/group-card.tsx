import type { SheetNames } from '../../../../ui/formula-chips.tsx';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { System, Effect, Step, ValueKind } from '@vtt/schema';
import { Card, CardHead, Verdict, Button, DangerButton, Select } from '../../../../ui/primitives.tsx';
import { KeyField } from '../../../../ui/key-field.tsx';
import { referenced } from '../../keys.ts';
import { useWorld } from '../../../../store/world.ts';
import type { CardGroup } from '../../cards.ts';
import type { Segment } from '../../readback.ts';
import { checkReadback, changeReadback, sendReadback, numberReadback, seenReadback, amountValueSegments } from '../../readback.ts';
import { namesOf } from '../../slots.tsx';
import type { SlotContext, EarlierStep } from '../../slots.tsx';
import type { Problem } from '../../step-card.tsx';
import { CheckBody } from './check-body.tsx';
import { ChangeBody } from './change-body.tsx';
import { NumberBody } from './number-body.tsx';
import { SeenBody } from './seen-body.tsx';
import { TableBody } from './table-body.tsx';
import { StopStrip, StepHead, FlowActions, UnwrapButton } from './flow-parts.tsx';
import { titleOf } from '../words.ts';
import { STEP_WORDS } from '@vtt/engine/words/steps';
import { loopOf } from '@vtt/engine/engine/steps/each';
import { rowTables, isRange } from '@vtt/engine/model/tables';


export function Readback({ segments }: { segments: Segment[] }) {
  return (
    <p className="readback">
      {segments.map((part, i) => {

        const prev = segments[i - 1];
        const glue = ('text' in part && /^[.,)]/.test(part.text))
          || (prev !== undefined && 'text' in prev && prev.text.endsWith('('));
        const lead = i === 0 || glue ? '' : ' ';
        return 'text' in part
          ? <span key={i}>{lead}{part.text}</span>
          : <span key={i}>{lead}<span className="readback__hole">{part.hole}</span></span>;
      })}
    </p>
  );
}

export function GroupCard({
  group, position, system, effect, earlier, problem, problemAction,
  edit: editStep, withNumber, onDelete, onMoveUp, onMoveDown, onAddParam, onOpenEffect, lane, upTitle, downTitle, folded = false, onFold, sheets, takenNames, onRename, onUnpair, onWrap, onIfByOutcome, onUnwrap, asIf = false, outcome = '', headCond,
}: {
  group: CardGroup;
  position: number;
  system: System;
  effect: Effect;
  earlier: EarlierStep[];
  problem: Problem | null;

  problemAction?: ReactNode;
  edit: (slotIndexInGroup: number, change: (draft: Step) => void) => void;

  withNumber?: (change: (amount: Step, apply: Step, id: string) => void) => void;
  onDelete: () => void;

  onMoveUp?: () => void;
  onMoveDown?: () => void;

  onAddParam?: (label: string, kind: ValueKind, want?: string) => string;
  onOpenEffect?: (id: string) => void;
  lane?: 'steps' | 'cost';
  upTitle?: string;
  downTitle?: string;
  folded?: boolean;
  onFold?: () => void;
  sheets?: SheetNames;
  onUnpair?: () => void;
  onWrap?: () => void;
  onIfByOutcome?: () => void;
  headCond?: ReactNode;
  onUnwrap?: () => void;
  asIf?: boolean;
  outcome?: string;
  takenNames?: readonly string[];
  onRename?: (from: string, to: string) => void;
}) {
  const context: SlotContext = { system, effect, earlier, ...(sheets ? { sheets } : {}) };
  const step = group.step as any;
  const edit: typeof editStep = (at, change) => editStep(at, draft => {
    change(draft);
    if (draft.type === 'roll') delete (draft as Record<string, unknown>).against;
  });

  const actions = (
    <>
      {onIfByOutcome && !folded ? <Button size="sm" variant="ghost" title="Поставить сразу после вызова «Если» по его итогу" onClick={onIfByOutcome}>+ если по итогу</Button> : null}
      {onWrap && !onIfByOutcome && !folded ? <Button size="sm" variant="ghost" title="Поставить этот шаг внутрь «Если»: выполняется только при условии" onClick={onWrap}>в «Если»</Button> : null}
      <Button size="sm" variant="ghost" title={upTitle ?? 'выше'} disabled={!onMoveUp} onClick={onMoveUp}>↑</Button>
      <Button size="sm" variant="ghost" title={downTitle ?? 'ниже'} disabled={!onMoveDown} onClick={onMoveDown}>↓</Button>
      <DangerButton size="sm" onConfirm={onDelete}>Удалить</DangerButton>
    </>
  );

  if (group.kind === 'split') {
    return <SplitStrip step={step} position={position} system={system} effect={effect} earlier={earlier} edit={edit} actions={actions} />;
  }

  if (group.kind === 'stop') {
    return <StopStrip step={group.step} position={position} problem={problem?.text ?? null} edit={change => edit(0, change)} actions={actions} />;
  }

  if (group.kind === 'unknown' || group.kind === 'flow') {
    return (
      <Card tone="bad">
        <CardHead title={`${position} · движок не знает типа «${group.step.type}»`}
          actions={actions} />
      </Card>
    );
  }

  const called = titleOf(group.kind, group.step, system, effect);
  const title = `${position} · ${called}`;

  const body = (
    <>
      {problem ? <Verdict tone="bad" action={problemAction}>{problem.text}</Verdict> : null}
      {group.kind === 'check' ? <CheckBody step={step} roll={group.amount} context={context} edit={edit} system={system} asIf={asIf} {...(onUnpair ? { onUnpair } : {})} /> : null}
      {group.kind === 'seen' ? <SeenBody step={step} context={context} edit={edit} /> : null}
      {group.kind === 'change' ? <ChangeBody group={group} context={context} edit={edit} withNumber={withNumber} system={system} onAddParam={onAddParam} onOpenEffect={onOpenEffect} lane={lane} /> : null}
      {group.kind === 'number'
        ? <NumberBody step={step} context={context} edit={edit} onAddParam={onAddParam}
          {...(takenNames ? { takenNames } : {})} {...(onRename ? { onRename } : {})} />
        : null}
      {group.kind === 'table' ? <TableBody step={step} context={context} edit={edit} system={system} /> : null}
      {group.kind === 'number' ? null : <StepName group={group} effect={effect} system={system} edit={edit} />}
    </>
  );

  if (asIf) {
    return (
      <>
        <StepHead
          position={position} words={`${called.includes('«') ? called : `«${called}»`} — ${outcome}`} open={!folded} onToggle={onFold} problem={problem?.text ?? null} {...(headCond ? { cond: headCond } : {})}
          actions={<FlowActions onUp={onMoveUp} onDown={onMoveDown} upTitle={upTitle} downTitle={downTitle} extra={onUnwrap ? <UnwrapButton onClick={onUnwrap} /> : null} onDelete={onDelete} />}
        />
        {folded ? null : <div className={`step-card flow-block__source flow-block__source--${group.kind}`}>{body}</div>}
      </>
    );
  }

  const head = onFold ? (
    <button type="button" className="step-fold" aria-expanded={!folded} onClick={onFold}
      title={folded ? 'развернуть шаг' : 'свернуть шаг'}>
      <span className="step-fold__arrow" aria-hidden>{folded ? '▸' : '▾'}</span>{title}
    </button>
  ) : title;

  if (folded) {
    return (
      <>
        <Card tone={problem ? 'bad' : (group.kind as 'check' | 'change' | 'number' | 'table')} className="step-card">
          <div className="step-fold__row">
            {head}
            <span className="step-fold__summary">{summaryOf(group, system, effect, namesOf(context))}</span>
            <span className="spacer" />
            {actions}
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <Card tone={problem ? 'bad' : (group.kind as 'check' | 'change' | 'number' | 'table')} className="step-card">
        <CardHead
          title={head}
          actions={actions}
        />
        {body}
      </Card>
    </>
  );
}

function summaryOf(group: CardGroup, system: System, effect: Effect, names: Map<string, string>): string {
  const step = group.step;
  const segments = group.kind === 'check' ? checkReadback(step, group.amount, system, effect, names)
    : group.kind === 'number' ? (step.id ? [{ text: `${String(step.id)} =` }, ...amountValueSegments(step, system, effect, names)] : numberReadback(step, system, effect, names))
    : group.kind === 'table' ? tableReadback(step as Record<string, unknown>, system)
    : group.kind === 'seen' ? seenReadback(step, system)
      : group.kind === 'change'
        ? (step.type === 'emit' ? sendReadback(step, system, effect, names) : changeReadback(step, group.amount, system, effect, names))
        : [];
  return segments.map(part => ('text' in part ? part.text : part.hole)).join(' ').replace(/\s+([.,])/g, '$1');
}

const TABLE_ROWS = 'строки:';

function SplitStrip({ step, position, system, effect, earlier, edit, actions }: {
  step: { of?: unknown; rows?: unknown; as?: unknown };
  position: number;
  system: System;
  effect: Effect;
  earlier: EarlierStep[];
  edit: (slotIndexInGroup: number, change: (draft: Step) => void) => void;
  actions: ReactNode;
}) {
  const lists = (effect.params ?? []).filter(p => p.kind === 'sheet' && p.many).map(p => [p.key, p.label || p.key] as const);
  const tables = rowTables(system).filter(([, table]) => !isRange(table) && (table.rows ?? []).length).map(([id, table]) => [`${TABLE_ROWS}${id}`, `строки «${table.label || id}»`] as const);
  const rows = typeof step.rows === 'string' ? step.rows : '';
  const value = rows ? `${TABLE_ROWS}${rows}` : String(step.of ?? '');
  const known = [...lists, ...tables].some(([key]) => key === value);
  const name = typeof step.as === 'string' ? step.as : '';
  const taken = [
    ...(effect.params ?? []).map(p => p.key),
    ...earlier.map(one => one.id),
  ].filter(one => one !== name);
  return (
    <div className="steps__split" title={STEP_WORDS.each.hint}>
      <span className="steps__split-title">{position} · Для каждого из</span>
      <Select<string> label="из какого списка" value={value}
        options={[...(known ? [] : [['', '— какого списка —'] as const]), ...lists, ...tables]}
        onChange={next => edit(0, draft => {
          const loop = draft as { of?: string; rows?: string; as?: string };
          if (next.startsWith(TABLE_ROWS)) {
            delete loop.of;
            loop.rows = next.slice(TABLE_ROWS.length);
          } else {
            delete loop.rows;
            delete loop.as;
            loop.of = next;
          }
        })} />
      {rows ? (
        <>
          <span className="faint">строка зовётся:</span>
          <KeyField value={name} taken={taken}
            locked={Boolean(name) && referenced(effect, name)}
            onChange={next => edit(0, draft => { (draft as { as?: string }).as = next; })} />
          <span className="step-fold__summary">шаги ниже — для каждой строки по очереди, выше — один раз</span>
        </>
      ) : (
        <>
          <span className="faint">каждый:</span>
          <span className="chips__chip"><span>{loopOf(effect.params, step)?.label ?? '?'}</span></span>
          <span className="step-fold__summary">шаги ниже — для каждого по очереди, выше — один раз</span>
        </>
      )}
      <span className="spacer" />
      {actions}
    </div>
  );
}

function StepName({ group, effect, system, edit }: { group: CardGroup; effect: Effect; system: System; edit: (k: number, change: (draft: Step) => void) => void }) {
  const [open, setOpen] = useState(false);
  const id = group.step.id ? String(group.step.id) : '';
  const calledId = group.step.type === 'emit' ? (group.step as { effect?: unknown }).effect : undefined;
  const gives = typeof calledId === 'string' && (system.effects[calledId]?.returns ?? []).length > 0;
  if (!id && group.step.type !== 'apply' && !gives) return null;
  if (!open) {
    return (
      <div className="inline inline--tight step-name">
        <Button size="sm" variant="ghost" title="как итог шага зовётся в формулах: @имя" onClick={() => setOpen(true)}>{id ? `имя в формулах: ${id}` : 'имя в формулах…'}</Button>
      </div>
    );
  }
  const st = useWorld.getState();
  const taken = [...(effect.steps ?? []), ...(effect.cost ?? [])].map(s => String(s.id ?? '')).filter(Boolean);
  const roll = group.amount?.id ? String(group.amount.id) : '';
  const rename = (next: string) => {
    const follows = Boolean(next) && group.kind === 'check' && roll === `${id}_бросок` && !taken.includes(`${next}_бросок`);
    edit(group.amount ? 1 : 0, draft => {
      if (next) draft.id = next; else delete draft.id;
      if (follows) (draft as { value?: unknown }).value = { expr: `@${next}_бросок` };
    });
    if (follows) edit(0, draft => { draft.id = `${next}_бросок`; });
  };
  return (
    <div className="inline inline--tight step-name">
      <span className="faint">имя в формулах</span>
      <KeyField optional value={id} locked={Boolean(id) && referenced({ s: st.system, c: st.compendium }, id, { steps: effect.steps ?? [], cost: effect.cost ?? [] })} taken={taken} onChange={rename} />
    </div>
  );
}

function tableReadback(step: Record<string, unknown>, system: System): Segment[] {
  const table = typeof step.table === 'string' ? system.tables?.[step.table] : undefined;
  const name = table ? `«${table.label || String(step.table)}»` : 'какая таблица?';
  const by = typeof step.dice === 'string' ? `бросок «${system.constants?.[step.dice]?.label ?? step.dice}»`
    : String((step.value as { expr?: unknown } | undefined)?.expr ?? '?');
  return [{ text: `Строка таблицы ${name} по ${by}.` }];
}

