import { ownerOf } from '@vtt/engine/engine/owners';
import { useMemo, useState } from 'react';
import type { Step } from '@vtt/schema';
import { Field, Select, Button } from '../../../../ui/primitives.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { formulaAsLabels } from '../../../../ui/formula.tsx';
import { SlotInput } from '../../slot-input.tsx';
import { asOneFormula } from '@vtt/engine/model/amounts';
import { namesOf } from '../../slots.tsx';
import { inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

type Loose = Record<string, unknown>;

const loose = (draft: unknown): Loose => draft as Loose;

const slotOf = (step: Loose, key: string) => step[key] as never;

const textOf = (step: Loose): string => {
  const fixed = step.fixed as { expr?: unknown } | undefined;
  return typeof fixed?.expr === 'string' ? fixed.expr : '';
};

export function NumberBody({ step, context, edit, onAddParam }: {
  step: Step;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: string, want?: string) => string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const read = loose(step);
  const source = typeof read.source === 'object' ? 'roll' : (read.source ?? 'roll');
  const line = draft ?? textOf(read) ?? '';
  const shown = line || (draft === null ? asOneFormula(step) ?? '' : '');
  const names = useMemo(() => namesOf(context), [context]);
  const words = shown ? formulaAsLabels(context.system, shown, names) : '';

  const unknown = [...new Set([...shown.matchAll(/@([\p{L}\p{N}_.]+)/gu)].map(m => m[1]!))]
    .filter(name => !ownerOf(name) && !name.includes('.'))
    .filter(name => !names.has(name) && !context.system.fields.some(f => f.tag === name));

  const commit = (typed: string) => {
    edit(0, target => {
      const it = loose(target);
      delete it.dice;
      delete it.bonus;
      delete it.count;
      delete it.double;
      it.source = 'item';
      if (typed.trim()) it.fixed = { expr: typed };
      else delete it.fixed;
    });
    setDraft(null);
  };

  if (source === 'margin') {
    return (
      <Field label="какое превышение">
        <SlotInput
          where="число · какое превышение"
          value={slotOf(read, 'margin')} context={context} allow={['ref']}
          onChange={next => edit(0, draft => { loose(draft).margin = next ?? undefined; })}
        />
      </Field>
    );
  }

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
          owners
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
          onClick={() => { onAddParam(name, name, name); }}
        >{`взять «${name}» из записи`}</Button>
      )) : null}

      {source !== 'item' ? (
        <Field label="откуда">
          <Select
            value={String(source)}
            options={[['item', 'формулой'], ['margin', 'превышение проверки']] as const}
            onChange={next => edit(0, draft => { loose(draft).source = next; })}
          />
        </Field>
      ) : null}
    </>
  );
}
