import { tagWords } from '@vtt/engine/engine/roll-tags';
import { parseRollFormula, formatRollFormula } from '../../roll-formula.ts';
import { RollerPick, RollTags, setRoller } from './roll-line.tsx';
import { useMemo, useState } from 'react';
import type { Step, ValueKind } from '@vtt/schema';
import { Button, Input } from '../../../../ui/primitives.tsx';
import { stepNameTrouble, keyOf } from '../../keys.ts';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { asOneFormula, findRoll } from '@vtt/engine/model/amounts';
import { namesOf } from '../../slots.tsx';
import { inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { hasField } from '@vtt/engine/model/sheet-columns';

type Loose = Record<string, unknown>;

const loose = (draft: unknown): Loose => draft as Loose;

const COMPLEX = 'у сложной формулы кости ничьи — сначала выберите «просто кости»';

const textOf = (step: Loose): string =>
  [step.fixed, step.bonus]
    .map(part => (part as { expr?: unknown } | undefined)?.expr)
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' + ');

const looksLikeRoll = (text: string): boolean => {
  const found = findRoll(text);
  if (!found) return text.includes('кинуть(');
  return found.before.trim() === '' && /^\s*([+-]|$)/.test(found.after);
};

const asRoll = (it: Loose, parsed: { die?: unknown; count?: unknown; bonus?: unknown }): void => {
  delete it.fixed;
  it.die = parsed.die;
  if (parsed.count) it.count = parsed.count; else delete it.count;
  if (parsed.bonus) it.bonus = parsed.bonus; else delete it.bonus;
};

export function NumberBody({ step, context, edit, onAddParam, takenNames, onRename }: {
  step: Step;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: ValueKind, want?: string) => string;
  takenNames?: readonly string[];
  onRename?: (from: string, to: string) => void;
}) {
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameTrouble, setNameTrouble] = useState<string | null>(null);
  const current = typeof (step as { id?: unknown }).id === 'string' ? (step as { id: string }).id : '';
  const [draft, setDraft] = useState<string | null>(null);
  const read = loose(step);
  const owned = Boolean(read.by);
  const [trouble, setTrouble] = useState<string | null>(null);
  const stored = owned
    ? (read.die !== undefined ? formatRollFormula(read) : textOf(read))
    : textOf(read) || (asOneFormula(step) ?? '');
  const shown = draft ?? stored;
  const names = useMemo(() => namesOf(context), [context]);
  const pickable = owned || !('error' in parseRollFormula(stored, context.system));

  const unknown = [...new Set([...shown.matchAll(/@([\p{L}\p{N}_.]+)/gu)].map(m => m[1]!))]
    .filter(name => !name.includes('.'))
    .filter(name => !names.has(name) && !hasField(context.system, name) && !tagWords(context.system).has(name));

  const commit = (typed: string) => {
    if (typed.trim() === stored.trim()) { setDraft(null); setTrouble(null); return; }
    if (owned) {
      const parsed = parseRollFormula(typed, context.system);
      if ('error' in parsed) { setTrouble(typed.trim() && !looksLikeRoll(typed) ? COMPLEX : parsed.error); return; }
      edit(0, target => asRoll(loose(target), parsed));
      setDraft(null);
      setTrouble(null);
      return;
    }
    edit(0, target => {
      const it = loose(target);
      delete it.die;
      delete it.bonus;
      delete it.count;
      if (typed.trim()) it.fixed = { expr: typed };
      else delete it.fixed;
    });
    setDraft(null);
  };

  const pick = (next: string) => {
    const pending = !next && draft !== null && draft.trim() !== stored.trim() ? draft : null;
    setTrouble(null);
    if (pending !== null) setDraft(null);
    edit(0, target => {
      const it = loose(target);
      const wasOwned = Boolean(it.by);
      setRoller(it, next);
      if (!next) {
        if (pending !== null) {
          delete it.die;
          delete it.count;
          delete it.bonus;
          if (pending.trim()) it.fixed = { expr: pending }; else delete it.fixed;
          return;
        }
        if (it.die === undefined || it.fixed !== undefined) return;
        const text = formatRollFormula(it);
        delete it.die;
        delete it.count;
        delete it.bonus;
        it.fixed = { expr: text };
        return;
      }
      const expr = (it.fixed as { expr?: unknown } | undefined)?.expr;
      if (wasOwned || typeof expr !== 'string') return;
      const parsed = parseRollFormula(expr, context.system);
      if (!('error' in parsed)) asRoll(it, parsed);
    });
  };

  const taken = takenNames ?? [
    ...context.earlier.map(one => one.id),
    ...(context.effect.params ?? []).map(p => p.key),
  ];

  const commitName = () => {
    if (nameDraft === null) return;
    const typed = nameDraft;
    const trouble = stepNameTrouble(typed, current, taken.filter(one => one !== current));
    if (trouble) { setNameTrouble(trouble); return; }
    const next = keyOf(typed);
    setNameDraft(null);
    setNameTrouble(null);
    if (next === current) return;
    if (onRename) onRename(current, next);
    else edit(0, target => { target.id = next; });
  };

  const formula = (
    <FormulaField
      value={shown}
      system={context.system}
      where="число · сколько"
      extraNames={names}
      {...(context.sheets ? { sheets: context.sheets } : {})}
      badges={inputBadges(context)}
      placeholder="наберите @ и выберите название"
      invalid={Boolean(trouble)}
      onChange={next => { setTrouble(null); setDraft(next); }}
      onCommit={commit}
      onCancel={() => { setTrouble(null); setDraft(null); }}
    />
  );

  return (
    <>
      <div className="inline inline--tight number-line">
        <Input
          mono
          value={nameDraft ?? current}
          placeholder="имя"
          invalid={Boolean(nameTrouble)}
          onChange={next => { setNameTrouble(null); setNameDraft(next); }}
          onBlur={commitName}
          onKeyDown={event => {
            if (event.key === 'Enter') commitName();
            if (event.key === 'Escape') { setNameDraft(null); setNameTrouble(null); }
          }}
        />
        <span className="number-line__eq">=</span>
        <div data-field="Формула" className={`number-line__formula${pickable ? ' roll-formula' : ''}`}>
          {pickable ? <RollerPick by={read.by} context={context} onPick={pick} /> : null}
          {formula}
        </div>
      </div>
      {nameTrouble ? <span className="field__error">{nameTrouble}</span> : null}
      {trouble ? <span className="field__error">{trouble}</span> : null}

      {onAddParam ? unknown.map(name => (
        <Button
          key={name} size="sm" variant="ghost"
          onClick={() => { onAddParam(name, 'number', name); }}
        >{`взять «${name}» из записи`}</Button>
      )) : null}

      {owned ? <RollTags roll={read} system={context.system} onRoll={change => edit(0, draft => change(loose(draft)))} /> : null}
    </>
  );
}
