import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Step } from '@vtt/schema';
import { Button, DangerButton, Input } from '../../../../ui/primitives.tsx';
import { ConditionField } from '../../condition-field.tsx';
import { namesOf } from '../../slots.tsx';
import type { SlotContext, EarlierStep } from '../../slots.tsx';
import { quickOf } from './condition-fold.tsx';
import { Select } from '../../../../ui/primitives.tsx';
import { readGuard, writeGuard } from '../../guard-expr.ts';
import { yesNo } from '../../condition-field.tsx';
import type { QuickRef } from '../../condition-field.tsx';
import { functionSpec } from '@vtt/engine/formula';

const quoted = (text: string): string => (text.includes('"') ? `'${text}'` : `"${text}"`);

const isFormula = (text: string): boolean => {
  if (text.startsWith('@')) return true;
  const call = /^([\p{L} ]+?)\s*\(/u.exec(text);
  return Boolean(call && functionSpec(call[1]!.trim()));
};

export function NoteField({ value, onChange, placeholder = 'например: не хватает ячейки' }: {
  value: unknown;
  onChange: (next: { expr: string } | null) => void;
  placeholder?: string;
}) {
  const expr = value && typeof value === 'object' ? String((value as { expr?: unknown }).expr ?? '') : '';
  const literal = /^(["'])(.*)\1$/su.exec(expr.trim());
  const shown = literal ? literal[2]! : expr;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (!text) { onChange(null); return; }
    if (text === shown.trim()) return;
    if (isFormula(text)) { onChange({ expr: text }); return; }
    if (text.includes('"') && text.includes("'")) { onChange({ expr: quoted(text.replace(/"/g, '«').replace(/'/g, '»')) }); return; }
    onChange({ expr: quoted(text) });
  };
  return <Input value={draft ?? shown} placeholder={placeholder} onChange={setDraft} onBlur={commit} />;
}

export function StopStrip({ step, position, problem, edit, actions }: {
  step: Step;
  position: number;
  problem: string | null;
  edit: (change: (draft: Step) => void) => void;
  actions: ReactNode;
}) {
  const note = (step as { note?: unknown }).note;
  return (
    <div className={`flow-stop${problem ? ' flow-stop--bad' : ''}`} title="Дальше не идём. До «Для каждого из» и в цене — действие не состоялось; в теле — стоп для этой цели.">
      <span className="flow-stop__mark" aria-hidden>■</span>
      <span className="flow-stop__word">{position} · Стоп</span>
      <span className="faint">в журнал:</span>
      <span className="flow-stop__note">
        <NoteField value={note} placeholder="«стоп»" onChange={next => edit(draft => {
          const d = draft as { note?: unknown };
          if (next) d.note = next; else delete d.note;
        })} />
      </span>
      {problem ? <span className="field__error">{problem}</span> : null}
      <span className="spacer" />
      {actions}
    </div>
  );
}

export function HeadFrame({ word, bad = false, actions, children }: {
  word: string;
  bad?: boolean;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`flow-head${bad ? ' flow-head--bad' : ''}`}>
      <span className="flow-head__word">{word}</span>
      <div className="flow-head__cond">{children}</div>
      <div className="flow-head__actions">{actions}</div>
    </div>
  );
}

export function FlowHead({ word, step, context, earlier, required, edit, actions, problem, tail }: {
  word: string;
  step: Step;
  context: SlotContext;
  earlier: EarlierStep[];
  required: boolean;
  edit: (change: (draft: Step) => void) => void;
  actions: ReactNode;
  problem: string | null;
  tail?: string;
}) {
  const written = (step as { if?: { expr?: string } }).if?.expr;
  const bare = !required && written === undefined;
  return (
    <HeadFrame word={word} bad={Boolean(problem)} actions={actions}>
      {bare ? null : (
        <ConditionField
          bare required spoken={!problem}
          value={written || undefined}
          onChange={expr => edit(draft => {
            const d = draft as { if?: { expr: string } };
            d.if = { expr: expr ?? '' };
          })}
          system={context.system}
          quick={quickOf(context, earlier)}
          names={namesOf(context)}
          {...(context.sheets ? { sheets: context.sheets } : {})}
          {...(tail ? { tail } : {})}
          where={`${word.toLowerCase()} · условие`}
          placeholder="например: @шаг.natural >= 19"
        />
      )}
      {problem ? <span className="field__error">{problem}</span> : null}
    </HeadFrame>
  );
}

const BY_FORMULA = ':формула';

export function OutcomePick({ quick, value, onPick, onFormula }: {
  quick: readonly QuickRef[];
  value: string;
  onPick: (expr: string) => void;
  onFormula: () => void;
}) {
  const when = readGuard(value);
  const current = when ? writeGuard({ ref: when.ref, ...(when.not ? { not: true } : {}) }) : '';
  const own = (one: QuickRef) => writeGuard({ ref: one.ref, ...(when?.ref === one.ref && when.not ? { not: true } : {}) });
  return (
    <Select<string>
      value={current}
      options={[['', '— что проверяем —'],
        ...quick.map(one => [own(one), yesNo(one).join(' / ')] as const),
        [BY_FORMULA, 'формулой…']]}
      onChange={next => { if (next === BY_FORMULA) onFormula(); else if (next) onPick(next); }}
    />
  );
}

export function StepHead({ position, words, word = 'Если', open, onToggle, problem, actions, cond }: {
  position: number;
  words: string;
  word?: string;
  cond?: ReactNode;
  open: boolean;
  onToggle?: (() => void) | undefined;
  problem: string | null;
  actions: ReactNode;
}) {
  return (
    <HeadFrame word={`${position} · ${word}`} bad={Boolean(problem)} actions={actions}>
      {cond ? (
        <>
          {cond}
          <button type="button" className="step-fold" aria-expanded={open} title={open ? 'свернуть поля шага' : 'показать поля шага'} onClick={onToggle}>
            {open ? '▾' : '▸'} шаг
          </button>
        </>
      ) : <button type="button" className="step-fold flow-head__words" aria-expanded={open} title={open ? 'свернуть поля шага' : 'показать поля шага'} onClick={onToggle}>
        {words}
      </button>}
      {problem && !open ? <span className="field__error">{problem}</span> : null}
    </HeadFrame>
  );
}

export function ArmLabel({ word, actions }: { word: string; actions: ReactNode }) {
  return (
    <div className="flow-head flow-head--label">
      <span className="flow-head__word">{word}</span>
      <span className="spacer" />
      {actions}
    </div>
  );
}

export const KEEP_STEPS = 'только развилку — шаги останутся';

export function FlowActions({ onUp, onDown, onDelete, onKeep, extra, deleteLabel = 'Удалить', upTitle = 'выше', downTitle = 'ниже' }: {
  onUp?: (() => void) | undefined;
  onDown?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  onKeep?: (() => void) | undefined;
  extra?: ReactNode;
  deleteLabel?: string;
  upTitle?: string | undefined;
  downTitle?: string | undefined;
}) {
  return (
    <>
      {extra}
      {onUp || onDown ? (
        <>
          <Button size="sm" variant="ghost" title={upTitle} disabled={!onUp} onClick={onUp}>↑</Button>
          <Button size="sm" variant="ghost" title={downTitle} disabled={!onDown} onClick={onDown}>↓</Button>
        </>
      ) : null}
      {onDelete ? <DangerButton size="sm" onConfirm={onDelete} keep={onKeep ? { label: KEEP_STEPS, run: onKeep } : undefined}>{deleteLabel}</DangerButton> : null}
    </>
  );
}
