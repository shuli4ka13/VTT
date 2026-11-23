import { STEP_WORDS, loopOf, rowTables, isRange, stepSaid } from '@vtt/engine';
import type { NameAt } from '@vtt/engine';
import type { SheetNames } from '../../../../ui/formula-chips.tsx';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { System, Effect, Step, ValueKind } from '@vtt/schema';
import { Card, CardHead, Verdict, Button, DangerButton, Select } from '../../../../ui/primitives.tsx';
import { applyName, loopNames, namedSteps, stepNameTrouble } from '../../keys.ts';
import { NameField, STEP_KEYS, LOOP_KEYS } from './step-name.tsx';
import type { CardGroup } from '../../cards.ts';
import type { Segment } from '../../readback.ts';
import { checkReadback, changeReadback, sendReadback, numberReadback, rollReadback, seenReadback, askReadback, amountValueSegments } from '../../readback.ts';
import { namesOf } from '../../slots.tsx';
import type { SlotContext, EarlierStep } from '../../slots.tsx';
import type { Problem } from '../../step-card.tsx';
import { CheckBody } from './check-body.tsx';
import { ChangeBody } from './change-body.tsx';
import { NumberBody } from './number-body.tsx';
import { RollBody } from './roll-body.tsx';
import { SeenBody } from './seen-body.tsx';
import { TableBody } from './table-body.tsx';
import { AskBody } from './ask-body.tsx';
import { StopStrip, StepHead, FlowActions } from './flow-parts.tsx';
import { ResultChips } from './result-chips.tsx';
import { titleOf } from '../words.ts';
import { useT, t as say } from '../../../../i18n/author.ts';


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
  edit: editStep, withNumber, onDelete, onMoveUp, onMoveDown, onAddParam, onOpenEffect, lane, upTitle, downTitle, folded = false, onFold, sheets, names, tables, scope, takenNames, ifBy, byOutput, activeOutput, onUnwrap, asIf = false, outcome = '', headCond, headBy,
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
  names?: ReadonlyMap<string, string>;
  tables?: ReadonlyMap<string, string>;
  scope?: readonly NameAt[];
  ifBy?: { label: string; run: () => void }[];
  byOutput?: Record<string, () => void>;
  activeOutput?: string;
  headBy?: string;
  headCond?: ReactNode;
  onUnwrap?: () => void;
  asIf?: boolean;
  outcome?: string;
  takenNames?: readonly string[];
}) {
  const t = useT('stepCards');
  const context: SlotContext = { system, effect, earlier, ...(sheets ? { sheets } : {}), ...(names ? { names } : {}), ...(tables ? { tables } : {}), ...(scope ? { scope } : {}) };
  const step = group.step as any;
  const edit: typeof editStep = (at, change) => editStep(at, draft => {
    change(draft);
    if (draft.type === 'roll') delete (draft as Record<string, unknown>).against;
  });

  const IF_BY = t('group.byOutcome.hint');
  const ifByControl = !ifBy?.length || folded ? null
    : ifBy.length === 1 ? <Button size="sm" variant="ghost" title={IF_BY} onClick={ifBy[0]!.run}>{t('group.byOutcome.add')}</Button>
      : <Select<string> value="" title={IF_BY} label={t('group.byOutcome.label')}
        options={[['', t('group.byOutcome.add')], ...ifBy.map((one, k) => [String(k + 1), one.label] as const)]}
        onChange={pick => { if (pick) ifBy[Number(pick) - 1]!.run(); }} />;
  const actions = (
    <>
      {ifByControl}
      <Button size="sm" variant="ghost" title={upTitle ?? t('group.up')} disabled={!onMoveUp} onClick={onMoveUp}>↑</Button>
      <Button size="sm" variant="ghost" title={downTitle ?? t('group.down')} disabled={!onMoveDown} onClick={onMoveDown}>↓</Button>
      <DangerButton size="sm" onConfirm={onDelete}>{t('common:delete')}</DangerButton>
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
        <CardHead title={t('group.unknownType', { n: position, type: group.step.type })}
          actions={actions} />
      </Card>
    );
  }

  const called = titleOf(group.kind, group.step, system, effect, names);
  const title = `${position} · ${called}`;

  const body = (
    <>
      {problem ? <Verdict tone="bad" action={problemAction}>{problem.text}</Verdict> : null}
      {group.kind === 'check' ? <CheckBody step={step} context={context} edit={edit} system={system} asIf={asIf} /> : null}
      {group.kind === 'roll' ? <RollBody step={step} context={context} edit={edit} {...(takenNames ? { takenNames } : {})} /> : null}
      {group.kind === 'seen' ? <SeenBody step={step} context={context} edit={edit} /> : null}
      {group.kind === 'change' ? <ChangeBody group={group} context={context} edit={edit} withNumber={withNumber} system={system} onAddParam={onAddParam} onOpenEffect={onOpenEffect} lane={lane} /> : null}
      {group.kind === 'number'
        ? <NumberBody step={step} context={context} edit={edit} onAddParam={onAddParam}
          {...(takenNames ? { takenNames } : {})} />
        : null}
      {group.kind === 'table' ? <TableBody step={step} context={context} edit={edit} system={system} /> : null}
      {group.kind === 'ask' ? <AskBody step={step} context={context} edit={edit} system={system} /> : null}
      {group.kind === 'number' || group.kind === 'roll' ? null : <StepName group={group} effect={effect} system={system} edit={edit} branches={byOutput} active={activeOutput} />}
    </>
  );

  if (asIf) {
    return (
      <>
        <StepHead
          position={position} word={called.replace(/^.*«(.+)».*$/, '$1')} words={headBy ? t('group.asIf.by', { by: headBy }) : step.id ? t('group.asIf.named', { name: stepSaid(step), outcome }) : t('group.asIf.plain', { outcome })} open={!folded} onToggle={onFold} problem={problem?.text ?? null}
          {...(headCond ? { cond: <><span className="flow-head__by">{step.id ? t('group.asIf.leadNamed', { name: stepSaid(step) }) : t('group.asIf.leadPlain')}</span>{headCond}</> } : {})}
          actions={<FlowActions onUp={onMoveUp} onDown={onMoveDown} upTitle={upTitle} downTitle={downTitle} onDelete={onDelete} onKeep={onUnwrap} />}
        />
        {folded ? null : <div className={`step-card flow-block__source flow-block__source--${group.kind}`}>{body}</div>}
      </>
    );
  }

  const head = onFold ? (
    <button type="button" className="step-fold" aria-expanded={!folded} onClick={onFold}
      title={folded ? t('group.fold.expand') : t('group.fold.collapse')}>
      <span className="step-fold__arrow" aria-hidden>{folded ? '▸' : '▾'}</span>{title}
    </button>
  ) : title;

  if (folded) {
    return (
      <>
        <Card tone={problem ? 'bad' : toneOf(group.kind)} className="step-card">
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
      <Card tone={problem ? 'bad' : toneOf(group.kind)} className="step-card" label={t('group.card.label', { name: called })}>
        <CardHead
          title={head}
          actions={actions}
        />
        {body}
      </Card>
    </>
  );
}

const toneOf = (kind: string): 'check' | 'change' | 'number' | 'table' => (kind === 'roll' ? 'number' : kind === 'ask' ? 'table' : kind as 'check' | 'change' | 'number' | 'table');

function summaryOf(group: CardGroup, system: System, effect: Effect, names: Map<string, string>): string {
  const step = group.step;
  const segments = group.kind === 'check' ? checkReadback(step, system, effect, names)
    : group.kind === 'roll' ? rollReadback(step, system, effect, names)
    : group.kind === 'number' ? (step.id ? [{ text: `${stepSaid(step)} =` }, ...amountValueSegments(step, system, effect, names)] : numberReadback(step, system, effect, names))
    : group.kind === 'table' ? tableReadback(step as Record<string, unknown>, system)
    : group.kind === 'ask' ? askReadback(step, effect)
    : group.kind === 'seen' ? seenReadback(step, system)
      : group.kind === 'change'
        ? (step.type === 'emit' ? sendReadback(step, system, effect, names) : changeReadback(step, group.amount, system, effect, names))
        : [];
  return segments.map(part => ('text' in part ? part.text : part.hole)).join(' ').replace(/\s+([.,])/g, '$1');
}

const TABLE_ROWS = 'строки:';

function SplitStrip({ step, position, system, effect, earlier, edit, actions }: {
  step: { of?: unknown; rows?: unknown; as?: unknown; asLabel?: unknown };
  position: number;
  system: System;
  effect: Effect;
  earlier: EarlierStep[];
  edit: (slotIndexInGroup: number, change: (draft: Step) => void) => void;
  actions: ReactNode;
}) {
  const t = useT('stepCards');
  const lists = (effect.params ?? []).filter(p => p.kind === 'sheet' && p.many).map(p => [p.key, p.label || p.key] as const);
  const tables = rowTables(system).filter(([, table]) => !isRange(table) && (table.rows ?? []).length).map(([id, table]) => [`${TABLE_ROWS}${id}`, t('split.rowsOf', { name: table.label || id })] as const);
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
      <span className="steps__split-title">{t('split.title', { n: position })}</span>
      <Select<string> label={t('split.list.label')} value={value}
        options={[...(known ? [] : [['', t('split.list.blank')] as const]), ...lists, ...tables]}
        onChange={next => edit(0, draft => {
          const loop = draft as { of?: string; rows?: string; as?: string; asLabel?: string };
          if (next.startsWith(TABLE_ROWS)) {
            delete loop.of;
            loop.rows = next.slice(TABLE_ROWS.length);
          } else {
            delete loop.rows;
            delete loop.as;
            delete loop.asLabel;
            loop.of = next;
          }
        })} />
      {rows ? (
        <>
          <span className="faint">{t('split.rowName')}</span>
          <NameField shown={name ? stepSaid({ id: name, label: step.asLabel }) : ''}
            check={typed => stepNameTrouble(typed, { id: name, label: step.asLabel }, [...namedSteps(effect), ...loopNames(effect).filter(one => one.id !== name)])}
            onCommit={typed => edit(0, draft => applyName(draft as unknown as Record<string, unknown>, LOOP_KEYS, typed, taken))} />
          <span className="step-fold__summary">{t('split.rowsNote')}</span>
        </>
      ) : (
        <>
          <span className="faint">{t('split.each')}</span>
          <span className="chips__chip"><span>{loopOf(effect.params, step)?.label ?? '?'}</span></span>
          <span className="step-fold__summary">{t('split.eachNote')}</span>
        </>
      )}
      <span className="spacer" />
      {actions}
    </div>
  );
}

function StepName({ group, effect, system, edit, branches, active }: { group: CardGroup; effect: Effect; system: System; edit: (k: number, change: (draft: Step) => void) => void; branches?: Record<string, () => void> | undefined; active?: string | undefined }) {
  const t = useT('stepCards');
  const [open, setOpen] = useState(false);
  const id = group.step.id ? String(group.step.id) : '';
  const calledId = group.step.type === 'emit' ? (group.step as { effect?: unknown }).effect : undefined;
  const gives = typeof calledId === 'string' && (system.effects[calledId]?.returns ?? []).length > 0;
  if (!id && group.step.type !== 'apply' && !gives) return null;
  const keys = [...(effect.steps ?? []), ...(effect.cost ?? [])].map(s => String(s.id ?? '')).filter(Boolean).concat((effect.params ?? []).map(p => p.key));
  const others = [...namedSteps(effect).filter(one => one.id !== id), ...loopNames(effect)];
  const at = group.amount ? 1 : 0;
  const said = id ? stepSaid(group.step) : '';
  const nameField = (
    <NameField optional shown={said}
      check={typed => stepNameTrouble(typed, group.step, others)}
      onCommit={typed => edit(at, draft => applyName(draft as unknown as Record<string, unknown>, STEP_KEYS, typed, keys))} />
  );
  if (gives) {
    const field = open
      ? <span className="result-row__name-field" data-guide="step-name" ref={el => { if (el && !el.contains(document.activeElement)) el.querySelector('input')?.focus(); }} onBlur={() => setOpen(false)}>{nameField}</span>
      : undefined;
    return (
      <div className="inline inline--tight step-name">
        <ResultChips name={said} outputs={system.effects[String(calledId)]?.returns ?? []} system={system} {...(branches ? { branches } : {})} active={active}
          onName={() => setOpen(true)} nameSlot={field} />
      </div>
    );
  }
  if (!open) {
    return (
      <div className="inline inline--tight step-name">
        <Button size="sm" variant="ghost" title={t('name.hint')} onClick={() => setOpen(true)}>{id ? t('name.named', { name: said }) : t('name.add')}</Button>
      </div>
    );
  }
  return (
    <div className="inline inline--tight step-name">
      <span className="faint">{t('name.label')}</span>
      {nameField}
    </div>
  );
}

function tableReadback(step: Record<string, unknown>, system: System): Segment[] {
  const table = typeof step.table === 'string' ? system.tables?.[step.table] : undefined;
  const name = table ? say('stepCards:group.tableNamed', { name: table.label || String(step.table) }) : say('stepCards:group.tableWhich');
  const by = typeof step.dice === 'string' ? say('stepCards:group.tableByDice', { name: system.constants?.[step.dice]?.label ?? step.dice })
    : String((step.value as { expr?: unknown } | undefined)?.expr ?? '?');
  return [{ text: say('stepCards:group.tableRow', { name, by }) }];
}

