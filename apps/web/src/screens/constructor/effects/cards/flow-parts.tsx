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
import { functionSpec } from '@vtt/engine';
import { useT } from '../../../../i18n/author.ts';

const quoted = (text: string): string => (text.includes('"') ? `'${text}'` : `"${text}"`);

const isFormula = (text: string): boolean => {
  if (text.startsWith('@')) return true;
  const call = /^([\p{L} ]+?)\s*\(/u.exec(text);
  return Boolean(call && functionSpec(call[1]!.trim()));
};

export function NoteField({ value, onChange, placeholder }: {
  value: unknown;
  onChange: (next: { expr: string } | null) => void;
  placeholder?: string;
}) {
  const t = useT('stepCards');
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
  return <Input value={draft ?? shown} placeholder={placeholder ?? t('note.placeholder')} onChange={setDraft} onBlur={commit} />;
}

export function StopStrip({ step, position, problem, edit, actions }: {
  step: Step;
  position: number;
  problem: string | null;
  edit: (change: (draft: Step) => void) => void;
  actions: ReactNode;
}) {
  const t = useT('stepCards');
  const note = (step as { note?: unknown }).note;
  return (
    <div className={`flow-stop${problem ? ' flow-stop--bad' : ''}`} title={t('stop.hint')}>
      <span className="flow-stop__mark" aria-hidden>■</span>
      <span className="flow-stop__word">{t('stop.word', { n: position })}</span>
      <span className="faint">{t('stop.log')}</span>
      <span className="flow-stop__note">
        <NoteField value={note} placeholder={t('stop.note')} onChange={next => edit(draft => {
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

export function HeadFrame({ word, bad = false, actions, children, guide }: {
  word: string;
  bad?: boolean;
  guide?: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`flow-head${bad ? ' flow-head--bad' : ''}`}>
      <span className="flow-head__word">{word}</span>
      <div className="flow-head__cond" {...(guide ? { 'data-guide': guide } : {})}>{children}</div>
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
  const t = useT('stepCards');
  const written = (step as { if?: { expr?: string } }).if?.expr;
  const bare = !required && written === undefined;
  return (
    <HeadFrame word={word} bad={Boolean(problem)} actions={actions} guide="if-condition">
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
          {...(context.tables ? { tables: context.tables } : {})}
          {...(context.sheets ? { sheets: context.sheets } : {})}
          {...(tail ? { tail } : {})}
          where={t('head.where', { word: word.toLowerCase() })}
          placeholder={t('head.placeholder')}
        />
      )}
      {problem ? <span className="field__error">{problem}</span> : null}
    </HeadFrame>
  );
}

const BY_FORMULA = ':formula';

export function OutcomePick({ quick, value, onPick, onFormula }: {
  quick: readonly QuickRef[];
  value: string;
  onPick: (expr: string) => void;
  onFormula: () => void;
}) {
  const t = useT('stepCards');
  const when = readGuard(value);
  const current = when ? writeGuard({ ref: when.ref, ...(when.not ? { not: true } : {}) }) : '';
  const own = (one: QuickRef) => writeGuard({ ref: one.ref, ...(when?.ref === one.ref && when.not ? { not: true } : {}) });
  return (
    <Select<string>
      value={current}
      options={[['', t('outcome.blank')],
        ...quick.map(one => [own(one), yesNo(one).join(' / ')] as const),
        [BY_FORMULA, t('outcome.formula')]]}
      onChange={next => { if (next === BY_FORMULA) onFormula(); else if (next) onPick(next); }}
    />
  );
}

export function StepHead({ position, words, word, open, onToggle, problem, actions, cond }: {
  position: number;
  words: string;
  word?: string;
  cond?: ReactNode;
  open: boolean;
  onToggle?: (() => void) | undefined;
  problem: string | null;
  actions: ReactNode;
}) {
  const t = useT('stepCards');
  return (
    <HeadFrame word={`${position} · ${word ?? t('head.if')}`} bad={Boolean(problem)} actions={actions}>
      {cond ? (
        <>
          {cond}
          <button type="button" className="step-fold" aria-expanded={open} title={open ? t('head.hide') : t('head.show')} onClick={onToggle}>
            {open ? '▾' : '▸'} {t('head.step')}
          </button>
        </>
      ) : <button type="button" className="step-fold flow-head__words" aria-expanded={open} title={open ? t('head.hide') : t('head.show')} onClick={onToggle}>
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

export function FlowActions({ onUp, onDown, onDelete, onKeep, extra, deleteLabel, upTitle, downTitle }: {
  onUp?: (() => void) | undefined;
  onDown?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  onKeep?: (() => void) | undefined;
  extra?: ReactNode;
  deleteLabel?: string;
  upTitle?: string | undefined;
  downTitle?: string | undefined;
}) {
  const t = useT('stepCards');
  const up = upTitle ?? t('group.up');
  const down = downTitle ?? t('group.down');
  return (
    <>
      {extra}
      {onUp || onDown ? (
        <>
          <Button size="sm" variant="ghost" title={up} disabled={!onUp} onClick={onUp}>↑</Button>
          <Button size="sm" variant="ghost" title={down} disabled={!onDown} onClick={onDown}>↓</Button>
        </>
      ) : null}
      {onDelete ? <DangerButton size="sm" onConfirm={onDelete} keep={onKeep ? { label: t('actions.keep'), run: onKeep } : undefined}>{deleteLabel ?? t('common:delete')}</DangerButton> : null}
    </>
  );
}
