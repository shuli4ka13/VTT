import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { HOLDER } from '@vtt/engine/model/references';
import { compile } from '@vtt/engine/formula';
import type { BarOption } from '../../store/formula-bar.ts';
import { Field, Select } from '../../ui/primitives.tsx';
import { FormulaField } from '../../ui/formula-field.tsx';
import { formulaWords } from '../../ui/formula-words.ts';
import type { SheetNames } from '../../ui/formula-chips.tsx';
import { splitHolder, joinHolder, holderIn } from './guard-expr.ts';

export type QuickKind = 'boolean' | 'number' | 'text' | 'tags';

export interface QuickRef { ref: string; label: string; kind: QuickKind; tags?: string[]; no?: string }

export interface Phrase { expr: string; label: string }

export const holderPhrase = (name: string): string => `@${name} == @${HOLDER}`;

export const yesNo = (one: QuickRef): [string, string] => (one.no !== undefined ? [one.label, one.no] : [`${one.label} — да`, `${one.label} — нет`]);

const compiles = (text: string): boolean => {
  try { compile(text); return true; } catch { return false; }
};

export function readyOf(quick: readonly QuickRef[], phrases: readonly Phrase[]): (readonly [string, string])[] {
  return [
    ...phrases.map(one => [one.expr, one.label] as const),
    ...quick.flatMap((one): (readonly [string, string])[] => {
      if (one.kind === 'tags') return (one.tags ?? []).map(tag => [`есть(@${one.ref}, ${JSON.stringify(tag)})`, `${one.label}: «${tag}»`] as const);
      if (one.kind !== 'boolean') return [];
      const [yes, no] = yesNo(one);
      return [[`@${one.ref}`, yes] as const, [`не @${one.ref}`, no] as const];
    }),
  ];
}

export function ConditionField({
  value, onChange, system, holders = [], quick = [], phrases = [], names, sheets, where, placeholder,
  title = 'Только если', holderLabel = 'Кого касается', holderHint, holderTip, aside, ruleHint, bare = false, spoken, tail,
}: {
  value: string | undefined;
  onChange: (expr: string | null) => void;
  system: System;
  holders?: readonly (readonly [string, string])[];
  quick?: readonly QuickRef[];
  phrases?: readonly Phrase[];
  names?: Map<string, string>;
  sheets?: SheetNames;
  where: string;
  placeholder?: string;
  title?: string;
  holderLabel?: string;
  holderHint?: string;
  holderTip?: string;
  aside?: ReactNode;
  ruleHint?: string;
  required?: boolean;
  bare?: boolean;
  spoken?: boolean;
  tail?: string;
}) {
  const options = holders.map(([name, label]) => [holderPhrase(name), label] as const);
  const { holder, rest } = splitHolder(value, options.map(([expr]) => expr));
  const write = (nextHolder: string, nextRest: string) =>
    onChange(joinHolder(nextRest && holderIn(nextRest, options.map(([expr]) => expr)) ? '' : nextHolder, nextRest));
  const ready = readyOf(quick, phrases);
  const said = rest.trim() && compiles(rest) ? `${formulaWords(system, rest, names)}${tail ? ` — ${tail}` : ''}` : '';

  const holderField = options.length ? (
    <Field label={holderLabel} {...(holderTip ? { tip: holderTip } : { hint: holderHint ?? 'Носитель — лист, на котором это висит.' })}>
      <Select<string>
        value={holder}
        options={[['', 'всех — без условия'], ...options]}
        onChange={next => write(next, rest)}
      />
    </Field>
  ) : null;

  return (
    <>
      {aside ? <div className="row">{holderField}{aside}</div> : holderField}
      <div className={`cond${bare ? ' cond--bare' : ''}`}>
        {bare ? null : <span className="cond__title">{title}</span>}
        <div className="cond__fact">
          <span className="cond__formula">
            <FormulaField
              value={rest}
              system={system}
              where={where}
              {...(names ? { extraNames: names } : {})}
              {...(sheets ? { sheets } : {})}
              {...(placeholder ? { placeholder } : {})}
              {...(ready.length ? { options: ready.map(([expr, label]): BarOption => ({ group: 'частые условия', label, onPick: (insert, bar) => bar.write(insert(expr)) })) } : {})}
              {...(said && spoken !== false ? { spoken: said } : {})}
              onCommit={next => write(holder, next.trim())}
            />
          </span>
        </div>
      </div>
      {ruleHint && rest.trim() ? <span className="faint">{ruleHint}</span> : null}
    </>
  );
}
