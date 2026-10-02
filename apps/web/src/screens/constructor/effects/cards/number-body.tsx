import { SheetPick } from '../../sheet-pick.tsx';
import { parseRoll, formatRoll } from '../../check-expr.ts';
import { refForName, sheetChoices } from '../../slots.tsx';
import { useMemo, useState } from 'react';
import type { Step, ValueKind } from '@vtt/schema';
import { Field, Button } from '../../../../ui/primitives.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { formulaAsLabels } from '../../../../ui/formula.tsx';
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
  const line = draft ?? (owned ? formatRoll(read) : textOf(read) ?? '');
  const shown = line || (draft === null && !owned ? asOneFormula(step) ?? '' : '');
  const names = useMemo(() => namesOf(context), [context]);
  const { singles, firsts } = sheetChoices(context);
  const words = shown ? formulaAsLabels(context.system, shown, names) : '';

  const unknown = [...new Set([...shown.matchAll(/@([\p{L}\p{N}_.]+)/gu)].map(m => m[1]!))]
    .filter(name => !name.includes('.'))
    .filter(name => !names.has(name) && !hasField(context.system, name));

  const commit = (typed: string) => {
    if (owned) {
      const parsed = parseRoll(typed, context.system, name => refForName(context, name));
      if ('error' in parsed) { setTrouble(parsed.error); return; }
      edit(0, target => {
        const it = loose(target);
        delete it.fixed;
        it.die = parsed.roll.die;
        if (parsed.roll.count) it.count = parsed.roll.count; else delete it.count;
        if (parsed.roll.bonus) it.bonus = parsed.roll.bonus; else delete it.bonus;
        if (parsed.roll.tags.length) it.tags = parsed.roll.tags; else delete it.tags;
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
        hint="Обычная математика. Наберите @ и часть названия — подскажет. Кость кидается так: кинуть(название кости), вторым числом — сколько раз кидать."
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

      {words && words !== shown ? <span className="faint">{words}</span> : null}

      {onAddParam ? unknown.map(name => (
        <Button
          key={name} size="sm" variant="ghost"
          onClick={() => { onAddParam(name, 'number', name); }}
        >{`взять «${name}» из записи`}</Button>
      )) : null}

      <Field label="Бросает" hint="Пусто — просто расчёт: кости без правок броска. С листом — это его бросок: правки и «кости выпали» действуют.">
        <SheetPick
          value={read.by} sheets={singles} system={context.system} where="бросок · бросает" empty="— расчёт —"
          onChange={next => edit(0, draft => {
            const it = loose(draft);
            if (next) it.by = next; else { delete it.by; delete it.against; }
          })}
        />
      </Field>
      {owned ? (
        <Field label="Против кого" hint="Для правок «по носителю»: «Ослеплён» даёт преимущество тем, кто бросает против него.">
          <SheetPick
            value={read.against} sheets={singles} system={context.system} where="бросок · против кого" empty="ни против кого"
            extra={firsts}
            onChange={next => edit(0, draft => { const it = loose(draft); if (next) it.against = next; else delete it.against; })}
          />
        </Field>
      ) : null}
    </>
  );
}
