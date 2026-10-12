import type { System } from '@vtt/schema';
import { HOLDER } from '@vtt/engine/model/references';
import { listOf } from '@vtt/engine/model/lists';
import { rowTables } from '@vtt/engine/model/tables';
import { useState } from 'react';
import { compile } from '@vtt/engine/formula';
import { Button, Field, Select, Input } from '../../ui/primitives.tsx';
import { FormulaField } from '../../ui/formula-field.tsx';
import { formulaWords } from '../../ui/formula-words.ts';
import type { SheetNames } from '../../ui/formula-chips.tsx';
import { readGuard, writeGuard, splitHolder, joinHolder, holderIn } from './guard-expr.ts';
import type { When } from './guard-expr.ts';

export type QuickKind = 'boolean' | 'number' | 'text' | 'tags';

export interface QuickRef { ref: string; label: string; kind: QuickKind; tags?: string[]; no?: string }

export interface Phrase { expr: string; label: string }

export const holderPhrase = (name: string): string => `@${name} == @${HOLDER}`;

const BY_FORMULA = ':формула';
const NOT = ':не:';
const yesNo = (one: QuickRef): [string, string] => (one.no !== undefined ? [one.label, one.no] : [`${one.label} — да`, `${one.label} — нет`]);

const tablesOfTags = (system: System, tags: string[]) =>
  rowTables(system)
    .filter(([, t]) => (t.columns ?? []).length && (t.rows ?? []).some(r => tags.includes(String(r.value))))
    .map(([id, t]) => [id, t.label || id] as const);

export function ConditionField({
  value, onChange, system, holders = [], quick = [], phrases = [], names, sheets, where, placeholder,
  title = 'Только если', holderLabel = 'Кого касается', holderHint, ruleHint, required = false, bare = false, spoken = false, tail,
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
  required?: boolean;
  bare?: boolean;
  spoken?: boolean;
  tail?: string;
}) {
  const options = holders.map(([name, label]) => [holderPhrase(name), label] as const);
  const { holder, rest } = splitHolder(value, options.map(([expr]) => expr));
  const write = (nextHolder: string, nextRest: string) => onChange(joinHolder(nextHolder, nextRest));
  const facts = factsOf(rest);
  const [adding, setAdding] = useState(false);
  const rows = adding || (required && !facts.length) ? [...facts, ''] : facts;
  const setRow = (at: number, expr: string | null) => {
    const next = [...rows];
    if (expr) next[at] = expr; else next.splice(at, 1);
    setAdding(false);
    write(expr && holderIn(expr, options.map(([phrase]) => phrase)) ? '' : holder, joinFacts(next.filter(Boolean)));
  };
  const open = rows.length > 0 && rows[rows.length - 1] !== '';

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
      <div className={`cond${bare ? ' cond--bare' : ''}`}>
        {!bare && rows.length ? <span className="cond__title">{title}</span> : null}
        {rows.map((fact, at) => (
          <div className="cond__row" key={`${at}:${fact}`}>
            {at > 0 ? <span className="cond__and">и</span> : null}
            <FactRow
              value={fact} system={system} quick={quick} phrases={phrases} where={where} spoken={spoken} {...(tail ? { tail } : {})}
              {...(names ? { names } : {})} {...(sheets ? { sheets } : {})} {...(placeholder ? { placeholder } : {})}
              onChange={next => setRow(at, next)}
            />
            {required && rows.length === 1 ? null : (
              <button type="button" className="extra__x" title="убрать условие" aria-label="убрать условие" onClick={() => setRow(at, null)}>×</button>
            )}
            {open && at === rows.length - 1 ? (
              <Button size="sm" variant="ghost" title="ещё одно условие — должны сойтись все" onClick={() => setAdding(true)}>+ и</Button>
            ) : null}
          </div>
        ))}
        {!rows.length ? <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>+ условие</Button> : null}
      </div>
      {ruleHint && rows.length ? <span className="faint">{ruleHint}</span> : null}
    </>
  );
}

function topArgs(text: string): string[] | null {
  const head = /^все\s*\(/u.exec(text);
  if (!head || !text.endsWith(')')) return null;
  const inner = text.slice(head[0].length, -1);
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let at = 0; at < inner.length; at++) {
    const ch = inner[at]!;
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth < 0) return null; }
    else if (ch === ',' && depth === 0) { out.push(inner.slice(start, at).trim()); start = at + 1; }
  }
  if (depth !== 0 || quote) return null;
  out.push(inner.slice(start).trim());
  return out.every(Boolean) ? out : null;
}

function factsOf(expr: string): string[] {
  const text = expr.trim();
  if (!text) return [];
  try { compile(text); } catch { return [text]; }
  const parts = topArgs(text);
  if (!parts) return [text];
  const out: string[] = [];
  for (let at = 0; at < parts.length; at++) {
    const pair = at + 1 < parts.length ? `все(${parts[at]}, ${parts[at + 1]})` : null;
    const both = pair ? readGuard(pair) : null;
    if (pair && both && both.atLeast !== undefined && both.atMost !== undefined) { out.push(pair); at++; continue; }
    out.push(parts[at]!);
  }
  return out;
}

const compiles = (text: string): boolean => {
  try { compile(text); return true; } catch { return false; }
};

const joinFacts = (facts: string[]): string => (facts.length > 1 ? `все(${facts.join(', ')})` : facts[0] ?? '');

function FactRow({ value, onChange, system, quick, phrases, names, sheets, where, placeholder, spoken, tail }: {
  value: string;
  onChange: (expr: string | null) => void;
  system: System;
  quick: readonly QuickRef[];
  phrases: readonly Phrase[];
  names?: Map<string, string>;
  sheets?: SheetNames;
  where: string;
  placeholder?: string;
  spoken: boolean;
  tail?: string;
}) {
  const phrase = phrases.find(one => one.expr === value.trim()) ?? null;
  const when = phrase ? null : readGuard(value);
  const known = when ? quick.find(one => one.ref === when.ref) ?? null : null;
  const custom = value.trim() !== '' && !phrase && !known;
  const [formula, setFormula] = useState(false);
  const picked = custom || formula ? BY_FORMULA : phrase ? phrase.expr : known ? `${known.kind === 'boolean' && when?.not ? NOT : ''}${known.ref}` : '';
  const put = (next: When | null) => onChange(next ? writeGuard(next) : null);
  const keep = (next: Partial<When>) => {
    if (!when) return;
    const made: When = { ref: when.ref, ...next };
    for (const key of ['atLeast', 'atMost', 'has', 'not', 'where'] as const) if (made[key] === undefined) delete made[key];
    put(made);
  };
  const whereTable = when?.where ? system.tables?.[when.where.table] : undefined;
  const whereColumn = whereTable?.columns?.find(c => c.key === when?.where?.column);
  const whereValues = whereColumn?.kind === 'choice' ? (listOf(system, whereColumn.from) ?? []) : [];
  const showFormula = custom || formula;
  const said = spoken && value.trim() && compiles(value) ? `${formulaWords(system, value, names)}${tail ? ` — ${tail}` : ''}` : '';

  return (
    <div className="cond__fact">
      {showFormula ? null : <Select<string>
        value={picked}
        options={[['', '— что проверяем —'],
          ...phrases.map(one => [one.expr, one.label] as const),
          ...quick.flatMap(one => (one.kind === 'boolean'
            ? [[one.ref, yesNo(one)[0]] as const, [`${NOT}${one.ref}`, yesNo(one)[1]] as const]
            : [[one.ref, one.label] as const])),
          [BY_FORMULA, 'формулой…']]}
        onChange={next => {
          if (!next) { setFormula(false); onChange(null); return; }
          if (next === BY_FORMULA) { setFormula(true); return; }
          setFormula(false);
          if (phrases.some(one => one.expr === next)) { onChange(next); return; }
          if (next.startsWith(NOT)) { put({ ref: next.slice(NOT.length), not: true }); return; }
          put({ ref: next });
        }}
      />}
          {showFormula ? (
            <span className="cond__formula">
              <FormulaField
                value={value}
                system={system}
                where={where}
                {...(names ? { extraNames: names } : {})}
                {...(sheets ? { sheets } : {})}
                {...(placeholder ? { placeholder } : {})}
                {...(said && custom && !formula ? { spoken: said } : {})}
                onCommit={next => { setFormula(false); onChange(next.trim() || null); }}
              />
            </span>
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
              <Field label="не меньше">
                <FormulaField
                  value={when.atLeast ?? ''}
                  system={system}
                  where={`${where} · не меньше`}
                  {...(names ? { extraNames: names } : {})}
                  {...(sheets ? { sheets } : {})}
                  onCommit={next => keep({ atLeast: next.trim() || undefined, atMost: when.atMost })}
                />
              </Field>
              <Field label="не больше">
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

          {said && !showFormula ? <span className="cond__words" title="условие словами">{said}</span> : null}
    </div>
  );
}
