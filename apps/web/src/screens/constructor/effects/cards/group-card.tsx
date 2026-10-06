import type { SheetNames } from '../../../../ui/formula-chips.tsx';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { System, Effect, Step, ValueKind } from '@vtt/schema';
import { Card, CardHead, Verdict, Button, Chip, DangerButton, Select } from '../../../../ui/primitives.tsx';
import { KeyField } from '../../../../ui/key-field.tsx';
import { referenced } from '../../keys.ts';
import { useWorld } from '../../../../store/world.ts';
import type { CardGroup } from '../../cards.ts';
import type { Segment } from '../../readback.ts';
import { checkReadback, changeReadback, sendReadback, numberReadback } from '../../readback.ts';
import { namesOf } from '../../slots.tsx';
import type { SlotContext, EarlierStep } from '../../slots.tsx';
import type { Problem } from '../../step-card.tsx';
import { CheckBody } from './check-body.tsx';
import { ChangeBody } from './change-body.tsx';
import { NumberBody } from './number-body.tsx';
import { SeenBody } from './seen-body.tsx';
import { TableBody } from './table-body.tsx';
import { ConditionFold, breakLine } from './condition-fold.tsx';
import { titleOf } from '../words.ts';
import { STEP_WORDS } from '@vtt/engine/words/steps';
import { loopOf } from '@vtt/engine/engine/steps/each';


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
  edit, withNumber, onDelete, onMoveUp, onMoveDown, onAddParam, onOpenEffect, lane, onMoveLane, folded = false, onFold, sheets, onUnpair,
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
  onMoveLane?: (to: 'steps' | 'cost') => void;
  folded?: boolean;
  onFold?: () => void;
  sheets?: SheetNames;
  onUnpair?: () => void;
}) {
  const context: SlotContext = { system, effect, earlier, ...(sheets ? { sheets } : {}) };
  const step = group.step as any;

  const actions = (
    <>
      {onMoveLane && (lane === 'cost' || !folded) ? (
        <Chip
          active={lane === 'cost'}
          title={lane === 'cost'
            ? 'Шаг цены: идёт раньше всех шагов, один раз за действие; не хватило — действие не состоялось. Нажмите — вернуть в шаги.'
            : 'Обычный шаг. Нажмите — сделать шагом цены: ячейка, заряд, удача.'}
          onClick={() => onMoveLane(lane === 'cost' ? 'steps' : 'cost')}
        >цена</Chip>
      ) : null}
      <Button size="sm" variant="ghost" title="выше" disabled={!onMoveUp} onClick={onMoveUp}>↑</Button>
      <Button size="sm" variant="ghost" title="ниже" disabled={!onMoveDown} onClick={onMoveDown}>↓</Button>
      <DangerButton size="sm" onConfirm={onDelete}>Удалить</DangerButton>
    </>
  );

  const lists = (effect.params ?? []).filter(p => p.kind === 'sheet' && p.many).map(p => [p.key, p.label || p.key] as const);
  if (group.kind === 'split') {
    return (
      <div className="steps__split" title={STEP_WORDS.each.hint}>
        <span className="steps__split-title">{position} · Для каждого из</span>
        <Select<string> label="из какого списка" value={String(step.of ?? '')}
          options={[...(lists.some(([key]) => key === step.of) ? [] : [['', '— какого списка —'] as const]), ...lists]}
          onChange={next => edit(0, draft => { (draft as { of?: string }).of = next; })} />
        <span className="faint">один —</span>
        <span className="chips__chip"><span>{loopOf(effect.params, step)?.label ?? '?'}</span></span>
        <span className="step-fold__summary">шаги ниже — для каждого по очереди, выше — один раз</span>
        <span className="spacer" />
        {actions}
      </div>
    );
  }

  if (group.kind === 'unknown') {
    return (
      <Card tone="bad">
        <CardHead title={`${position} · движок не знает типа «${group.step.type}»`}
          actions={actions} />
      </Card>
    );
  }

  const title = `${position} · ${titleOf(group.kind, group.step, system)}`;
  const head = onFold ? (
    <button type="button" className="step-fold" aria-expanded={!folded} onClick={onFold}
      title={folded ? 'развернуть шаг' : 'свернуть шаг'}>
      <span className="step-fold__arrow" aria-hidden>{folded ? '▸' : '▾'}</span>{title}
    </button>
  ) : title;

  if (folded) {
    return (
      <>
        <Card tone={problem ? 'bad' : (group.kind as 'check' | 'change' | 'number' | 'table')}>
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
      <Card tone={problem ? 'bad' : (group.kind as 'check' | 'change' | 'number' | 'table')}>
        <CardHead
          title={head}
          actions={actions}
        />
        {problem ? <Verdict tone="bad" action={problemAction}>{problem.text}</Verdict> : null}
        {group.kind === 'check' ? <CheckBody step={step} roll={group.amount} context={context} edit={edit} system={system} {...(onUnpair ? { onUnpair } : {})} /> : null}
        {group.kind === 'seen' ? <SeenBody step={step} context={context} edit={edit} /> : null}
        {group.kind === 'change' ? <ChangeBody group={group} context={context} edit={edit} withNumber={withNumber} system={system} onAddParam={onAddParam} onOpenEffect={onOpenEffect} lane={lane} /> : null}
        {group.kind === 'number'
          ? <NumberBody step={step} context={context} edit={edit} onAddParam={onAddParam} />
          : null}
        {group.kind === 'table' ? <TableBody step={step} context={context} edit={edit} system={system} /> : null}
        <ConditionFold group={group} earlier={earlier} edit={edit} context={context} />
        {breakLine(group)}
        <StepName group={group} effect={effect} edit={edit} />
      </Card>
    </>
  );
}

function summaryOf(group: CardGroup, system: System, effect: Effect, names: Map<string, string>): string {
  const step = group.step;
  const segments = group.kind === 'check' ? checkReadback(step, group.amount, system, effect, names)
    : group.kind === 'number' ? numberReadback(step, system, effect, names)
    : group.kind === 'table' ? tableReadback(step as Record<string, unknown>, system)
      : group.kind === 'change'
        ? (step.type === 'emit' ? sendReadback(step, system, effect, names) : changeReadback(step, group.amount, system, effect, names))
        : [];
  return segments.map(part => ('text' in part ? part.text : part.hole)).join(' ').replace(/\s+([.,])/g, '$1');
}

function StepName({ group, effect, edit }: { group: CardGroup; effect: Effect; edit: (k: number, change: (draft: Step) => void) => void }) {
  const [open, setOpen] = useState(false);
  const id = group.step.id ? String(group.step.id) : '';
  if (!id && group.step.type !== 'apply') return null;
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

