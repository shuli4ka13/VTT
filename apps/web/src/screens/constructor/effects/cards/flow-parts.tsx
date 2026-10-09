import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Step } from '@vtt/schema';
import { Button, DangerButton, Input } from '../../../../ui/primitives.tsx';
import { ConditionField } from '../../condition-field.tsx';
import { namesOf } from '../../slots.tsx';
import type { SlotContext, EarlierStep } from '../../slots.tsx';
import { quickOf } from './condition-fold.tsx';

const quoted = (text: string): string => (text.includes('"') ? `'${text}'` : `"${text}"`);

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
    if (text.startsWith('@') || text.includes('(')) { onChange({ expr: text }); return; }
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

export function FlowHead({ word, step, context, earlier, required, edit, actions, problem }: {
  word: string;
  step: Step;
  context: SlotContext;
  earlier: EarlierStep[];
  required: boolean;
  edit: (change: (draft: Step) => void) => void;
  actions: ReactNode;
  problem: string | null;
}) {
  const written = (step as { if?: { expr?: string } }).if?.expr;
  const bare = !required && written === undefined;
  return (
    <div className={`flow-head${problem ? ' flow-head--bad' : ''}`}>
      <span className="flow-head__word">{word}</span>
      {bare ? null : (
        <ConditionField
          bare required
          value={written || undefined}
          onChange={expr => edit(draft => {
            const d = draft as { if?: { expr: string } };
            d.if = { expr: expr ?? '' };
          })}
          system={context.system}
          quick={quickOf(context, earlier)}
          names={namesOf(context)}
          {...(context.sheets ? { sheets: context.sheets } : {})}
          where={`${word.toLowerCase()} · условие`}
          placeholder="например: @попадание.natural >= 19"
        />
      )}
      {problem ? <span className="field__error">{problem}</span> : null}
      <span className="spacer" />
      {actions}
    </div>
  );
}

export function FlowActions({ onUp, onDown, onDelete, extra, deleteLabel = 'Удалить' }: {
  onUp?: () => void;
  onDown?: () => void;
  onDelete?: () => void;
  extra?: ReactNode;
  deleteLabel?: string;
}) {
  return (
    <>
      {extra}
      {onUp || onDown ? (
        <>
          <Button size="sm" variant="ghost" title="выше" disabled={!onUp} onClick={onUp}>↑</Button>
          <Button size="sm" variant="ghost" title="ниже" disabled={!onDown} onClick={onDown}>↓</Button>
        </>
      ) : null}
      {onDelete ? <DangerButton size="sm" onConfirm={onDelete}>{deleteLabel}</DangerButton> : null}
    </>
  );
}
