import { tagWords } from '@vtt/engine/engine/roll-tags';
import { parseRollFormula, formatRollFormula } from '../../roll-formula.ts';
import { RollLine } from './roll-line.tsx';
import { useMemo, useState } from 'react';
import type { Step, ValueKind } from '@vtt/schema';
import { Button, Input } from '../../../../ui/primitives.tsx';
import { stepNameTrouble, keyOf } from '../../keys.ts';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { asOneFormula } from '@vtt/engine/model/amounts';
import { namesOf } from '../../slots.tsx';
import { inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { hasField } from '@vtt/engine/model/sheet-columns';

type Loose = Record<string, unknown>;

const loose = (draft: unknown): Loose => draft as Loose;

const textOf = (step: Loose): string =>
  [step.fixed, step.bonus]
    .map(part => (part as { expr?: unknown } | undefined)?.expr)
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' + ');

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
  const line = draft ?? (owned ? formatRollFormula(read) : textOf(read) ?? '');
  const shown = line || (draft === null && !owned ? asOneFormula(step) ?? '' : '');
  const names = useMemo(() => namesOf(context), [context]);

  const unknown = [...new Set([...shown.matchAll(/@([\p{L}\p{N}_.]+)/gu)].map(m => m[1]!))]
    .filter(name => !name.includes('.'))
    .filter(name => !names.has(name) && !hasField(context.system, name) && !tagWords(context.system).has(name));

  const commit = (typed: string) => {
    if (owned) {
      if (typed.trim() === formatRollFormula(read)) { setDraft(null); setTrouble(null); return; }
      const parsed = parseRollFormula(typed, context.system);
      if ('error' in parsed) { setTrouble(parsed.error); return; }
      edit(0, target => {
        const it = loose(target);
        delete it.fixed;
        it.die = parsed.die;
        if (parsed.count) it.count = parsed.count; else delete it.count;
        if (parsed.bonus) it.bonus = parsed.bonus; else delete it.bonus;
      });
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

  const rolls = shown.includes('кинуть(') || owned || Boolean(read.by);

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
        <div data-field="Формула" className="number-line__formula">
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

      {rolls ? <RollLine roll={read} context={context} system={context.system} owned={owned}
        who={{ label: 'кости бросает', empty: 'никто — просто кости, без правок броска', title: 'на бросок действуют правки этого листа: преимущество, «Благословение» и подобные' }}
        onRoll={change => edit(0, draft => {
          const it = loose(draft);
          const wasOwned = Boolean(it.by);
          change(it);
          const expr = (it.fixed as { expr?: unknown } | undefined)?.expr;
          if (wasOwned || !it.by || typeof expr !== 'string' || !expr.includes('кинуть(')) return;
          const parsed = parseRollFormula(expr, context.system);
          if ('error' in parsed) return;
          delete it.fixed;
          it.die = parsed.die;
          if (parsed.count) it.count = parsed.count; else delete it.count;
          if (parsed.bonus) it.bonus = parsed.bonus; else delete it.bonus;
        })} /> : null}
    </>
  );
}
