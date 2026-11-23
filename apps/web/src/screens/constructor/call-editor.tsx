import { grouped as byRole } from './effects/roles.ts';
import { useState, type ReactNode } from 'react';
import type { System, Param, SlotRef, Effect } from '@vtt/schema';
import { paymentsOf, listOf, isBlank, paramsOf, isTyped, implicitOf } from '@vtt/engine';
import { defaultSaid } from '../../ui/formula-labels.ts';
import { Field, Select } from '../../ui/primitives.tsx';
import { FormulaView } from '../../ui/formula-field.tsx';
import { ValueField, asText, type SlotOption } from './value-field.tsx';
import type { SlotContext } from './slots.tsx';
import { EffectPick } from './effect-pick.tsx';
import { choiceRows, pickedRow } from './choice-rows.ts';
import { TypedPick } from './typed-pick.tsx';
import { TargetPick } from './field-target.tsx';

export interface CallInput {
  param: Param;
  value: unknown;
  fromProp: boolean;
}

function rowsAsOptions(system: System, need: Param): SlotOption[] {
  if (need.kind !== 'choice' || !need.from) return [];
  const group = `«${system.tables?.[need.from]?.label || need.from}»`;
  return (listOf(system, need.from) ?? []).map(row => ({ group, label: row.label, formula: JSON.stringify(row.value) }));
}

function status(input: CallInput): { text: string; bad: boolean } {
  if (input.value !== undefined && input.value !== null) return { text: '', bad: false };
  if (input.fromProp) return { text: `берётся из свойства «${input.param.label ?? input.param.key}»`, bad: false };
  if (input.param.ask) return { text: input.param.ask.by === 'gm' ? 'спросят ведущего' : 'спросят игрока', bad: false };
  if (input.param.optional) return { text: 'можно не заполнять', bad: false };
  return { text: 'не передано', bad: true };
}

type Place = 'record' | 'asked' | 'computed' | 'missing' | 'unused';

const lonely = (value: unknown): string | null => {
  const text = asText(value)?.trim() ?? '';
  return /^@[\p{L}\p{N}_]+$/u.test(text) ? text.slice(1) : null;
};

const BY_FORMULA = ':формула';

const FROM_NAME = /^@([\p{L}\p{N}_.]+)$/u;

function namedSources(context: SlotContext): { name: string; label: string; table: string }[] {
  const tables = new Map<string, string>(context.tables ?? []);
  for (const param of context.effect.params ?? []) if (param.kind === 'choice' && param.from && !tables.has(param.key)) tables.set(param.key, param.from);
  const labelOf = (name: string): string => {
    const param = (context.effect.params ?? []).find(one => one.key === name);
    if (param) return `вход «${param.label ?? param.key}»`;
    const named = context.names?.get(name);
    return named ? `«${named}»` : `«${name}»`;
  };
  return [...tables].map(([name, table]) => ({ name, table, label: labelOf(name) }));
}

function ChoiceArg({ system, param, value, onArg, context, children }: {
  system: System;
  param: Param;
  value: unknown;
  onArg: (key: string, next: SlotRef | null) => void;
  context: SlotContext;
  children: ReactNode;
}) {
  const rows = choiceRows(system, param);
  const text = asText(value)?.trim() ?? '';
  const picked = pickedRow(system, param, value);
  const sources = namedSources(context);
  const fitting = sources.filter(one => one.table === param.from);
  const named = FROM_NAME.exec(text)?.[1];
  const source = named ? sources.find(one => one.name === named) : undefined;
  const [formula, setFormula] = useState(false);
  const byFormula = formula || (text !== '' && !picked && !source);
  const tableOf = (id: string): string => system.tables?.[id]?.label || id;
  const options: (readonly [string, string, string])[] = [
    ['', '— выберите —', ''],
    ...rows.map(row => [JSON.stringify(row.value), row.label, `Строка «${tableOf(param.from ?? '')}»`] as const),
    ...fitting.map(one => [`@${one.name}`, one.label, 'Из этого эффекта'] as const),
    ...(source && source.table !== param.from ? [[`@${source.name}`, `${source.label} — строка «${tableOf(source.table)}», не подходит`, 'Из этого эффекта'] as const] : []),
    [BY_FORMULA, 'формулой…', 'Другое'],
  ];
  return (
    <div className="stack stack--tight">
      <Select<string>
        value={byFormula ? BY_FORMULA : picked ? JSON.stringify(picked.value) : source ? `@${source.name}` : ''}
        options={options.map(([key, label, group]) => (group ? [key, label, group] as const : [key, label] as const))}
        onChange={next => {
          if (next === BY_FORMULA) { setFormula(true); return; }
          setFormula(false);
          onArg(param.key, next ? { expr: next } : null);
        }}
      />
      {source && source.table !== param.from ? (
        <span className="field__error">{source.label} — строка таблицы «{tableOf(source.table)}», а сюда нужна строка «{tableOf(param.from ?? '')}»</span>
      ) : null}
      {byFormula ? children : null}
    </div>
  );
}

const effectOf = (value: unknown): string | null => {
  const text = asText(value)?.trim() ?? '';
  const quoted = /^"([^"]*)"$/.exec(text);
  return quoted ? quoted[1]! : null;
};

export function placeOf(input: CallInput, props: ReadonlySet<string>): Place {
  const { value, param } = input;
  if (isBlank(value)) {
    if (input.fromProp) return 'record';
    if (param.ask) return 'asked';
    if (param.default !== undefined) return 'computed';
    if (param.optional) return 'unused';
    return 'missing';
  }
  const prop = lonely(value);
  if (prop && props.has(prop)) return 'record';
  return 'computed';
}

function namesFor(system: System, called: Effect | undefined, args: Record<string, unknown> | undefined, names?: Map<string, string>): { extra: Map<string, string>; sheets: Map<string, string> } {
  const extra = new Map(names ?? []);
  const sheets = new Map<string, string>();
  for (const param of called?.params ?? []) {
    if (param.kind === 'sheet') sheets.set(param.key, param.label ?? param.key);
    else if (!extra.has(param.key)) extra.set(param.key, param.label ?? param.key);
  }
  for (const { payment } of called ? paymentsOf(system, called, args ?? {}) : []) {
    for (const param of payment.params ?? []) if (param.ask && !extra.has(param.key)) extra.set(param.key, param.label ?? param.key);
  }
  return { extra, sheets };
}

function valueShown(system: System, input: CallInput, names?: Map<string, string>, sheets?: Map<string, string>): ReactNode {
  if (input.param.kind === 'effect') {
    const id = effectOf(input.value) ?? (input.param.default !== undefined ? String(input.param.default) : null);
    if (!id) return <span className="faint">{input.param.optional ? 'нет' : 'не передаётся'}</span>;
    const chip = <span className="chips__chip"><span>{system.effects[id]?.label || id}</span></span>;
    return effectOf(input.value) ? chip : <span>{chip} <span className="faint">— как у эффекта</span></span>;
  }
  if (isBlank(input.value)) {
    if (input.param.default !== undefined) return <span>{defaultSaid(system, input.param, input.param.default)} <span className="faint">— как у эффекта</span></span>;
    return <span className="faint">{input.param.optional ? 'нет' : 'не передаётся'}</span>;
  }
  const row = pickedRow(system, input.param, input.value);
  if (row) return <span>«{row.label}»</span>;
  const literal = effectOf(input.value);
  if (literal !== null) return <span>«{literal}»</span>;
  return <FormulaView value={asText(input.value) ?? ''} system={system} {...(names ? { extraNames: names } : {})} {...(sheets ? { sheets } : {})} />;
}

export function CallSummary({ system, effect, args, props, names, label }: {
  system: System;
  effect: string;
  args: Record<string, unknown> | undefined;
  props: ReadonlySet<string>;
  names?: Map<string, string>;
  label: string;
}) {
  const called = system.effects[effect];
  if (!called) return null;
  const inputs = paramsOf(system, called)
    .filter(param => param.kind !== 'sheet')
    .map(param => ({ param, value: args?.[param.key], fromProp: props.has(param.key) }));
  const shownNames = namesFor(system, called, args, names);
  const computed = inputs.filter(input => placeOf(input, props) === 'computed');
  const asked = inputs.filter(input => placeOf(input, props) === 'asked');
  if (!computed.length && !asked.length) return null;
  return (
    <div className="call-group call-group--quiet">
      <span className="call-group__title">«{label}» считает сам</span>
      {computed.map(input => (
        <div className="pair" key={input.param.key}>
          <span className="call-args__name">{input.param.label ?? input.param.key}</span>
          <span className="call-group__value">← {valueShown(system, input, shownNames.extra, shownNames.sheets)}</span>
        </div>
      ))}
      {asked.length ? <span className="faint">спросят за столом: {asked.map(input => input.param.label ?? input.param.key).join(', ')}</span> : null}
    </div>
  );
}

export function CallEditor({ system, effect: raw, effects, onEffect, args, onArg, context, where, headAction, children, inputs: callerInputs }: {
  system: System;
  effect: unknown;
  effects?: [string, { label?: string }][];
  onEffect?: (id: string | { expr: string } | null) => void;
  inputs?: readonly Param[];
  args: Record<string, unknown> | undefined;
  onArg: (key: string, next: SlotRef | null) => void;
  context: SlotContext;
  where: string;
  headAction?: ReactNode;
  children?: ReactNode;
}) {
  const [more, setMore] = useState(false);
  const fromInput = typeof raw === 'object' && raw ? /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((raw as { expr?: unknown }).expr ?? ''))?.[1] : undefined;
  const via = fromInput ? callerInputs?.find(param => param.key === fromInput) : undefined;
  const effect = typeof raw === 'string' ? raw : typeof via?.default === 'string' ? via.default : '';
  const called = system.effects[effect];
  const params = called ? paramsOf(system, called) : [];
  const inputs: CallInput[] = params.map(param => ({ param, value: args?.[param.key], fromProp: false }));
  const nameOf = (param: Param) => param.label ?? param.key;
  const valueField = (input: CallInput) => (
    <ValueField
      where={`${where} · ${nameOf(input.param)}`}
      value={input.value as never}
      context={context}
      extraOptions={rowsAsOptions(system, input.param)}
      onChange={next => onArg(input.param.key, next)}
    />
  );
  const selfOf = (input: CallInput): string | null => {
    const auto = implicitOf(input.param, context.effect);
    if (!auto) return null;
    const from = context.scope?.find(one => one.name === auto.from)?.label ?? (context.effect.params ?? []).find(param => param.key === auto.from)?.label ?? auto.from;
    return `сам: «${from}»`;
  };
  const editor = (input: CallInput) => (
    input.param.kind === 'effect' ? (
      <Select<string>
        label={nameOf(input.param)}
        value={effectOf(input.value) ?? ''}
        options={[['', input.param.default !== undefined ? `как у эффекта: ${system.effects[String(input.param.default)]?.label ?? String(input.param.default)}` : '— не передаётся —'],
          ...Object.entries(system.effects).filter(([id]) => id !== effect).map(([id, e]) => [id, e.label || id] as const)]}
        onChange={next => onArg(input.param.key, next ? { expr: JSON.stringify(next) } : null)}
      />
    ) : input.param.kind === 'field' && context.scope && !input.param.many ? (
      <TargetPick target={input.value} context={context} onChange={next => onArg(input.param.key, next)} formula={valueField(input)} />
    ) : isTyped(input.param.kind) && context.scope ? (
      <TypedPick
        want={{ kind: input.param.kind!, ...(input.param.from ? { from: input.param.from } : {}), ...(input.param.many ? { many: true } : {}) }}
        value={input.value}
        context={context}
        label={nameOf(input.param)}
        blank={byDefault(input) ?? selfOf(input) ?? (status(input).text || '— не передано —')}
        onChange={next => onArg(input.param.key, next)}
      >
        {valueField(input)}
      </TypedPick>
    ) : choiceRows(system, input.param).length
      ? <ChoiceArg system={system} param={input.param} value={input.value} onArg={onArg} context={context}>{valueField(input)}</ChoiceArg>
      : valueField(input)
  );

  const pick = !onEffect ? null : callerInputs?.some(param => param.kind === 'effect') ? (
    <EffectPick value={raw} system={system} inputs={callerInputs}
      only={one => (effects ?? []).some(([, e]) => e === one)} onChange={onEffect} />
  ) : (
    <Select
      value={typeof raw === 'string' ? raw : ''}
      options={[['', '— что вызвать —'], ...byRole(system, effects ?? []).map(([id, e, group]) => [id, e.label || id, group] as const)] as never}
      onChange={next => onEffect(next)}
    />
  );

  const empty = (input: CallInput) => isBlank(input.value);
  const rare = (input: CallInput) => empty(input)
    && (Boolean(input.param.optional) || Boolean(input.param.ask));
  const byDefault = (input: CallInput) => {
    if (!empty(input) || input.param.kind === 'effect' || input.param.default === undefined) return null;
    const value = input.param.default;
    return `как у эффекта: ${defaultSaid(system, input.param, value)}`;
  };
  const main = inputs.filter(input => !rare(input));
  const rest = inputs.filter(rare);
  const arg = (input: CallInput) => {
    const shown = status(input);
    return (
      <div className="pair call-row__arg" key={input.param.key}>
        <span className="call-args__name">{nameOf(input.param)}</span>
        {editor(input)}
        {byDefault(input) ? <span className="faint">{byDefault(input)}</span> : shown.bad ? <span className="need">не передано</span> : null}
      </div>
    );
  };
  return (
    <div className="call-row">
      {pick ? <Field label="Какой эффект" needed={!effect && !fromInput}>{pick}</Field> : null}
      {pick && fromInput ? <span className="faint">{via ? `из входа «${via.label ?? via.key}»` : `входа «${fromInput}» нет`}</span> : null}
      {children}
      {main.map(arg)}
      {effect && (rest.length || headAction) ? (
        <div className={`call-row__more${more ? ' is-open' : ''}`}>
          <button type="button" className="call-row__toggle" onClick={() => setMore(!more)}>{more ? '▾ ещё' : `▸ ещё${rest.length ? ` (${rest.length})` : ''}`}</button>
          <div className="call-row__more-body">
            {rest.map(arg)}
            {headAction}
          </div>
        </div>
      ) : null}
    </div>
  );
}
