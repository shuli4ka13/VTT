import { useMemo, useState } from 'react';
import type { Step, ValueKind } from '@vtt/schema';
import { Field, Select, Button } from '../../../../ui/primitives.tsx';
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

const textOf = (step: Loose): string => {
  const fixed = step.fixed as { expr?: unknown } | undefined;
  return typeof fixed?.expr === 'string' ? fixed.expr : '';
};

export function NumberBody({ step, context, edit, onAddParam }: {
  step: Step;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: ValueKind, want?: string) => string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const read = loose(step);
  const by = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((read.by as { expr?: unknown } | undefined)?.expr ?? ''))?.[1] ?? '';
  const sheets = [...(context.sheets ?? new Map<string, string>())];
  const line = draft ?? textOf(read) ?? '';
  const shown = line || (draft === null ? asOneFormula(step) ?? '' : '');
  const names = useMemo(() => namesOf(context), [context]);
  const words = shown ? formulaAsLabels(context.system, shown, names) : '';

  const unknown = [...new Set([...shown.matchAll(/@([\p{L}\p{N}_.]+)/gu)].map(m => m[1]!))]
    .filter(name => !name.includes('.'))
    .filter(name => !names.has(name) && !hasField(context.system, name));

  const commit = (typed: string) => {
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
          onChange={setDraft}
          onCommit={commit}
          onCancel={() => setDraft(null)}
        />
      </Field>

      {words && words !== shown ? <span className="faint">{words}</span> : null}

      {onAddParam ? unknown.map(name => (
        <Button
          key={name} size="sm" variant="ghost"
          onClick={() => { onAddParam(name, 'number', name); }}
        >{`взять «${name}» из записи`}</Button>
      )) : null}

      <Field label="Бросает" hint="Пусто — просто расчёт: кости без правок броска. С листом — это его бросок: правки и «кости выпали» действуют.">
        <Select<string>
          value={by}
          options={[['', '— расчёт —'], ...sheets.map(([name, label]) => [name, `«${label}»`] as const)]}
          onChange={next => edit(0, draft => { if (next) loose(draft).by = { expr: `@${next}` }; else delete loose(draft).by; })}
        />
      </Field>
    </>
  );
}
