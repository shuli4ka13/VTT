import { tagWords } from '@vtt/engine/engine/roll-tags';
import { parseRollFormula, formatRollFormula } from '../../roll-formula.ts';
import { RollLine } from './roll-line.tsx';
import { useMemo, useState } from 'react';
import type { Step, ValueKind } from '@vtt/schema';
import { Field, Button } from '../../../../ui/primitives.tsx';
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

export function NumberBody({ step, context, edit, onAddParam }: {
  step: Step;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: ValueKind, want?: string) => string;
}) {
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

  return (
    <>
      <Field
        label="Сколько"
        needed={!shown}
      >
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
        {trouble ? <span className="field__error">{trouble}</span> : null}
      </Field>

      {onAddParam ? unknown.map(name => (
        <Button
          key={name} size="sm" variant="ghost"
          onClick={() => { onAddParam(name, 'number', name); }}
        >{`взять «${name}» из записи`}</Button>
      )) : null}

      <RollLine roll={read} context={context} system={context.system} owned={owned}
        onRoll={change => edit(0, draft => change(loose(draft)))} />
    </>
  );
}
