import { tagWords, hasField } from '@vtt/engine';
import { useMemo, useState } from 'react';
import type { Step, ValueKind } from '@vtt/schema';
import { Button } from '../../../../ui/primitives.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { namesOf } from '../../slots.tsx';
import { inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { useStepName } from './step-name.tsx';
import { useT } from '../../../../i18n/author.ts';

type Loose = Record<string, unknown>;

const loose = (draft: unknown): Loose => draft as Loose;

const textOf = (step: Loose): string =>
  [step.fixed, step.bonus]
    .map(part => (part as { expr?: unknown } | undefined)?.expr)
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' + ');

export function NumberBody({ step, context, edit, onAddParam, takenNames }: {
  step: Step;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: ValueKind, want?: string) => string;
  takenNames?: readonly string[];
}) {
  const t = useT('rollCards');
  const name = useStepName({ step, context, edit, takenNames });
  const [draft, setDraft] = useState<string | null>(null);
  const read = loose(step);
  const stored = textOf(read);
  const shown = draft ?? stored;
  const names = useMemo(() => namesOf(context), [context]);

  const unknown = [...new Set([...shown.matchAll(/@([\p{L}\p{N}_.]+)/gu)].map(m => m[1]!))]
    .filter(found => !found.includes('.'))
    .filter(found => !names.has(found) && !hasField(context.system, found) && !tagWords(context.system).has(found));

  const commit = (typed: string) => {
    setDraft(null);
    if (typed.trim() === stored.trim()) return;
    edit(0, target => {
      const it = loose(target);
      delete it.die;
      delete it.count;
      delete it.times;
      delete it.bonus;
      if (typed.trim()) it.fixed = { expr: typed }; else delete it.fixed;
    });
  };

  return (
    <>
      <div className="inline inline--tight number-line">
        {name.input}
        <span className="number-line__eq">=</span>
        <div data-field={t('formula.label')} className="number-line__formula">
          <FormulaField
            value={shown}
            system={context.system}
            where={t('formula.where')}
            extraNames={names}
            {...(context.sheets ? { sheets: context.sheets } : {})}
            badges={inputBadges(context)}
            placeholder={t('formula.placeholder')}
            onChange={next => setDraft(next)}
            onCommit={commit}
            onCancel={() => setDraft(null)}
          />
        </div>
      </div>
      {name.trouble}

      {onAddParam ? unknown.map(found => (
        <Button
          key={found} size="sm" variant="ghost"
          onClick={() => { onAddParam(found, 'number', found); }}
        >{t('takeParam', { name: found })}</Button>
      )) : null}
    </>
  );
}
