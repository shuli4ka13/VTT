import type { System } from '@vtt/schema';
import { HOLDER } from '@vtt/engine/model/references';
import { listOf } from '@vtt/engine/model/lists';
import { rowTables } from '@vtt/engine/model/tables';
import { Field, Fold, Select, Input } from '../../ui/primitives.tsx';
import { FormulaField } from '../../ui/formula-field.tsx';
import { formulaAsLabels } from '../../ui/formula.tsx';
import type { SheetNames } from '../../ui/formula-chips.tsx';
import { readGuard, writeGuard, splitHolder, joinHolder } from './guard-expr.ts';
import type { When, RowIs } from './guard-expr.ts';

export type QuickKind = 'boolean' | 'number' | 'text' | 'tags';

export interface QuickRef { ref: string; label: string; kind: QuickKind; tags?: string[] }

export interface Phrase { expr: string; label: string }

export const holderPhrase = (name: string): string => `@${name} == @${HOLDER}`;

const BY_FORMULA = ':формула';

const numberWords = (when: When): string => {
  const low = when.atLeast?.trim();
  const high = when.atMost?.trim();
  if (low && high) return `от ${low} до ${high}`;
  if (low) return `не меньше ${low}`;
  if (high) return `не больше ${high}`;
  return 'любое число';
};

const rowIsWords = (where: RowIs, system?: System): string => {
  const column = system?.tables?.[where.table]?.columns?.find(c => c.key === where.column);
  return `у метки «${column?.label || where.column}» = «${String(where.is)}»`;
};

export function whenWords(when: When | null | undefined, labelOf: (ref: string) => string, system?: System): string | null {
  if (!when?.ref) return null;
  const label = labelOf(when.ref);
  if (when.where) {
    const parts = [when.has !== undefined ? `есть «${when.has}»` : '', rowIsWords(when.where, system)].filter(Boolean).join(' и ');
    return `${when.not ? 'не так, что ' : ''}${label}: ${parts}`;
  }
  if (when.has !== undefined) return `${label} ${when.not ? 'не' : ''} «${when.has}»`.replace('  ', ' ');
  if (when.atLeast !== undefined || when.atMost !== undefined) return `${label} ${numberWords(when)}`;
  return when.not ? label.replace(' — ', ' — не ') : label;
}

export function conditionWords(expr: string | undefined, system: System, quick: readonly QuickRef[] = [], phrases: readonly Phrase[] = []): string | null {
  if (!expr?.trim()) return null;
  const phrase = phrases.find(one => one.expr === expr.trim());
  if (phrase) return phrase.label;
  const labelOf = (ref: string) => quick.find(one => one.ref === ref)?.label ?? ref;
  return whenWords(readGuard(expr), labelOf, system) ?? formulaAsLabels(system, expr);
}

const tablesOfTags = (system: System, tags: string[]) =>
  rowTables(system)
    .filter(([, t]) => (t.columns ?? []).length && (t.rows ?? []).some(r => tags.includes(String(r.value))))
    .map(([id, t]) => [id, t.label || id] as const);

export function ConditionField({
  value, onChange, system, holders = [], quick = [], phrases = [], names, sheets, where, placeholder,
  title = 'Только если', holderLabel = 'Кого касается', holderHint, ruleHint,
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
  ruleHint?: string;
}) {
  const options = holders.map(([name, label]) => [holderPhrase(name), label] as const);
  const { holder, rest } = splitHolder(value, options.map(([expr]) => expr));
  const write = (nextHolder: string, nextRest: string) => onChange(joinHolder(nextHolder, nextRest));

  const phrase = phrases.find(one => one.expr === rest.trim()) ?? null;
  const when = phrase ? null : readGuard(rest);
  const known = when ? quick.find(one => one.ref === when.ref) ?? null : null;
  const custom = rest.trim() !== '' && !phrase && !known;
  const picked = custom ? BY_FORMULA : phrase ? phrase.expr : known ? known.ref : '';

  const put = (next: When | null) => write(holder, next ? writeGuard(next) : '');
  const keep = (next: Partial<When>) => {
    if (!when) return;
    const made: When = { ref: when.ref, ...next };
    for (const key of ['atLeast', 'atMost', 'has', 'not', 'where'] as const) if (made[key] === undefined) delete made[key];
    put(made);
  };

  const words = conditionWords(rest, system, quick, phrases);
  const whereTable = when?.where ? system.tables?.[when.where.table] : undefined;
  const whereColumn = whereTable?.columns?.find(c => c.key === when?.where?.column);
  const whereValues = whereColumn?.kind === 'choice' ? (listOf(system, whereColumn.from) ?? []) : [];

  return (
    <>
      {options.length ? (
        <Field label={holderLabel} hint={holderHint ?? 'Носитель — лист, на котором это висит.'}>
          <Select<string>
            value={holder}
            options={[['', 'всех — без условия'], ...options]}
            onChange={next => write(next, rest)}
          />
        </Field>
      ) : null}
      <Fold title={title} summary={words ? `если ${words}` : options.length ? 'больше условий нет' : 'всегда'}>
        <div className="row">
          <Field label={options.length ? 'Ещё условие' : 'Делать'} hint={ruleHint}>
            <Select<string>
              value={picked}
              options={[['', options.length ? 'нет' : 'всегда'],
                ...phrases.map(one => [one.expr, one.label] as const),
                ...quick.map(one => [one.ref, `если ${one.label}`] as const),
                [BY_FORMULA, 'формулой…']]}
              onChange={next => {
                if (!next) { write(holder, ''); return; }
                if (next === BY_FORMULA) { write(holder, rest.trim() || 'да'); return; }
                if (phrases.some(one => one.expr === next)) { write(holder, next); return; }
                put({ ref: next });
              }}
            />
          </Field>

          {custom ? (
            <Field label="Условие" hint="Верно — делается, нет — пропускается.">
              <FormulaField
                value={rest}
                system={system}
                where={where}
                {...(names ? { extraNames: names } : {})}
                {...(sheets ? { sheets } : {})}
                {...(placeholder ? { placeholder } : {})}
                onCommit={next => write(holder, next)}
              />
            </Field>
          ) : null}

          {when && known?.kind === 'boolean' ? (
            <Field label="Исход">
              <Select
                value={when.not ? 'no' : 'yes'}
                options={[['yes', 'да'], ['no', 'нет']] as const}
                onChange={next => keep(next === 'no' ? { not: true } : {})}
              />
            </Field>
          ) : null}

          {when && known?.kind === 'tags' ? (
            <>
              <Field label="Есть метка" hint="Пусто — любая.">
                <Select
                  value={when.has ?? ''}
                  options={[['', '— любая —'], ...(known.tags ?? []).map(t => [t, t] as const)] as never}
                  onChange={next => keep({ ...(next ? { has: next } : {}), where: when.where, not: when.not })}
                />
              </Field>
              <Field label="Где у метки" hint="Смотрит в строку метки в таблице: один факт вместо перечня меток.">
                <div className="inline inline--tight">
                  <Select
                    value={when.where?.table ?? ''}
                    options={[['', '— без условия —'], ...tablesOfTags(system, known.tags ?? [])] as never}
                    onChange={next => {
                      const column = next ? system.tables?.[next]?.columns?.[0]?.key : undefined;
                      keep({ has: when.has, not: when.not, ...(next && column ? { where: { table: next, column, is: '' } } : {}) });
                    }}
                  />
                  {when.where ? (
                    <>
                      <Select
                        value={when.where.column}
                        options={(whereTable?.columns ?? []).map(c => [c.key, c.label || c.key] as const) as never}
                        onChange={next => keep({ ...when, where: { ...when.where!, column: next, is: '' } })}
                      />
                      <span className="faint">=</span>
                      {whereValues.length ? (
                        <Select
                          value={String(when.where.is ?? '')}
                          options={[['', '— что —'], ...whereValues.map(o => [String(o.value), o.label] as const)] as never}
                          onChange={next => keep({ ...when, where: { ...when.where!, is: next } })}
                        />
                      ) : (
                        <Input value={String(when.where.is ?? '')} onChange={next => keep({ ...when, where: { ...when.where!, is: next } })} />
                      )}
                    </>
                  ) : null}
                </div>
              </Field>
              <Field label="Исход">
                <Select
                  value={when.not ? 'no' : 'yes'}
                  options={[['yes', 'так и есть'], ['no', 'не так']] as const}
                  onChange={next => keep({ has: when.has, where: when.where, ...(next === 'no' ? { not: true } : {}) })}
                />
              </Field>
            </>
          ) : null}

          {when && known?.kind === 'number' ? (
            <>
              <Field label="Не меньше" hint="Пусто — нижней границы нет.">
                <FormulaField
                  value={when.atLeast ?? ''}
                  system={system}
                  where={`${where} · не меньше`}
                  {...(names ? { extraNames: names } : {})}
                  {...(sheets ? { sheets } : {})}
                  onCommit={next => keep({ atLeast: next.trim() || undefined, atMost: when.atMost })}
                />
              </Field>
              <Field label="Не больше" hint="Пусто — верхней границы нет.">
                <FormulaField
                  value={when.atMost ?? ''}
                  system={system}
                  where={`${where} · не больше`}
                  {...(names ? { extraNames: names } : {})}
                  {...(sheets ? { sheets } : {})}
                  onCommit={next => keep({ atLeast: when.atLeast, atMost: next.trim() || undefined })}
                />
              </Field>
            </>
          ) : null}

          {when && known?.kind === 'text' ? (
            <>
              <Field label="Ступень" hint="Как она названа в таблице степеней.">
                <Input value={when.has ?? ''} onChange={next => keep({ has: next, not: when.not })} />
              </Field>
              <Field label="Исход">
                <Select
                  value={when.not ? 'no' : 'yes'}
                  options={[['yes', 'она и есть'], ['no', 'любая другая']] as const}
                  onChange={next => keep({ has: when.has ?? '', ...(next === 'no' ? { not: true } : {}) })}
                />
              </Field>
            </>
          ) : null}
        </div>
      </Fold>
    </>
  );
}
