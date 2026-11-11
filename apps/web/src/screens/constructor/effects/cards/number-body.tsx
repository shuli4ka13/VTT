import { tagWords } from '@vtt/engine/engine/roll-tags';
import { parseRollFormula, formatRollFormula } from '../../roll-formula.ts';
import { sheetChoices } from '../../slots.tsx';
import { useMemo, useState } from 'react';
import type { Step, ValueKind } from '@vtt/schema';
import { Button } from '../../../../ui/primitives.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { asOneFormula } from '@vtt/engine/model/amounts';
import { namesOf } from '../../slots.tsx';
import { inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { hasField } from '@vtt/engine/model/sheet-columns';
import { useStepName } from './step-name.tsx';
import { rollReadback, joinReadback } from '../../readback.ts';

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
  const current = typeof (step as { id?: unknown }).id === 'string' ? (step as { id: string }).id : '';
  const name = useStepName({ current, context, edit, takenNames, onRename });
  const [draft, setDraft] = useState<string | null>(null);
  const read = loose(step);
  const stored = read.die !== undefined && read.die !== null ? formatRollFormula(read) : textOf(read) || (asOneFormula(step) ?? '');
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

  const thrown = stored.includes('кинуть(');
  const keyed = read.die !== undefined && read.die !== null;
  const parsed = thrown && !keyed ? parseRollFormula(stored, context.system) : null;
  const asRoll = parsed && !('error' in parsed) && !parsed.count ? parsed : null;
  const roller = [...sheetChoices(context).singles.keys()][0];

  const written = typeof read.die === 'object' && /^["']?\d*\s*[кdд]\s*\d+["']?$/iu.test(String((read.die as { expr?: unknown } | null)?.expr ?? '').trim());
  const sealed = keyed && ((typeof read.die === 'object' && !written) || (read.count !== undefined && read.count !== null) || (read.times !== undefined && read.times !== null));
  if (sealed) {
    return (
      <>
        <div className="inline inline--tight number-line">
          {name.input}
          <span className="number-line__eq">=</span>
          <div data-field="Формула" className="number-line__formula number-line__sealed">
            {joinReadback(rollReadback({ ...step, id: undefined } as Step, context.system, context.effect, names))}
          </div>
        </div>
        {name.trouble}
        <span className="faint number-line__note">
          кости ничьи: правки броска и вопросы «увидев кости» на них не действуют
          {roller ? (
            <Button size="sm" variant="ghost" title="Шаг станет броском листа"
              onClick={() => edit(0, target => { loose(target).by = { expr: `@${roller}` }; })}>сделать броском</Button>
          ) : null}
        </span>
      </>
    );
  }

  return (
    <>
      <div className="inline inline--tight number-line">
        {name.input}
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
            onChange={next => setDraft(next)}
            onCommit={commit}
            onCancel={() => setDraft(null)}
          />
        </div>
      </div>
      {name.trouble}

      {thrown ? (
        <span className="faint number-line__note">
          кости в формуле ничьи: правки броска и вопросы «увидев кости» на них не действуют
          {(asRoll || keyed) && roller ? (
            <Button size="sm" variant="ghost" title="Шаг станет броском листа: кость и прибавка разойдутся по полям"
              onClick={() => edit(0, target => {
                const it = loose(target);
                if (asRoll) {
                  delete it.fixed;
                  it.die = asRoll.die;
                  if (asRoll.bonus) it.bonus = asRoll.bonus; else delete it.bonus;
                }
                it.by = { expr: `@${roller}` };
              })}>сделать броском</Button>
          ) : null}
        </span>
      ) : null}

      {onAddParam ? unknown.map(found => (
        <Button
          key={found} size="sm" variant="ghost"
          onClick={() => { onAddParam(found, 'number', found); }}
        >{`взять «${found}» из записи`}</Button>
      )) : null}
    </>
  );
}
