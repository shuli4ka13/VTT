import { useState, type ReactNode } from 'react';
import type { System, Effect, Step } from '@vtt/schema';
import { Card, CardHead, Verdict, Button } from '../../../../ui/primitives.tsx';
import type { CardGroup } from '../../cards.ts';
import {
  checkReadback, changeReadback, numberReadback, type Segment,
} from '../../readback.ts';
import type { SlotContext, EarlierStep } from '../../slots.tsx';
import type { Problem } from '../../step-card.tsx';
import { CheckBody } from './check-body.tsx';
import { ChangeBody } from './change-body.tsx';
import { NumberBody } from './number-body.tsx';
import { ConditionFold, whenSegments, breakLine } from './condition-fold.tsx';
import { CARD_TITLES } from '../words.ts';


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
  edit, withNumber, onDelete, onMoveUp, onMoveDown, onAddParam,
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

  onAddParam?: (label: string, kind: string) => string;
}) {
  const context: SlotContext = { system, effect, earlier };
  const step = group.step as any;

  const [armed, setArmed] = useState(false);

  const actions = armed ? (
    <>
      <Button size="sm" variant="danger" onClick={onDelete}>убрать</Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>отмена</Button>
    </>
  ) : (
    <>
      <Button size="sm" variant="ghost" title="выше" disabled={!onMoveUp} onClick={onMoveUp}>↑</Button>
      <Button size="sm" variant="ghost" title="ниже" disabled={!onMoveDown} onClick={onMoveDown}>↓</Button>
      <Button size="sm" variant="ghost" title="убрать шаг" onClick={() => setArmed(true)}>×</Button>
    </>
  );

  if (group.kind === 'unknown') {
    return (
      <Card tone="bad">
        <CardHead title={`${position} · движок не знает типа «${group.step.type}»`}
          actions={actions} />
      </Card>
    );
  }

  const body = group.kind === 'check' ? checkReadback(group.step, system, effect)
    : group.kind === 'change' ? changeReadback(group.step, group.amount, system, effect)
      : numberReadback(group.step, system, effect);
  const segments = [...whenSegments(step, earlier), ...body];

  return (
    <>
      <Card tone={problem ? 'bad' : undefined}>
        <CardHead
          title={`${position} · ${CARD_TITLES[group.kind]}`}

          actions={actions}
        />
        {problem ? <Verdict tone="bad" action={problemAction}>{problem.text}</Verdict> : null}
        <Readback segments={segments} />
        {group.kind === 'check' ? <CheckBody step={step} context={context} edit={edit} system={system} /> : null}
        {group.kind === 'change' ? <ChangeBody group={group} context={context} edit={edit} withNumber={withNumber} system={system} onAddParam={onAddParam} /> : null}
        {group.kind === 'number'
          ? <NumberBody step={step} context={context} edit={edit} onAddParam={onAddParam} earlier={earlier} />
          : null}
        <ConditionFold group={group} earlier={earlier} edit={edit} />
      </Card>
      {breakLine(group)}
    </>
  );
}
