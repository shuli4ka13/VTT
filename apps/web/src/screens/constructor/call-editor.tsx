import { useState, type ReactNode } from 'react';
import type { System, Param, SlotRef, Effect } from '@vtt/schema';
import { paymentsOf } from '@vtt/engine/model/payments';
import { Field, Select, Button } from '../../ui/primitives.tsx';
import { FormulaView } from '../../ui/formula-field.tsx';
import { ValueField, asText, type SlotOption } from './value-field.tsx';
import type { SlotContext, SlotKind } from './slots.tsx';
import { listOf } from '@vtt/engine/model/lists';
import { EffectPick } from './effect-pick.tsx';
import { paramsOf } from '@vtt/engine/model/inherit';

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
  return { text: 'не заполнено', bad: true };
}

type Place = 'record' | 'asked' | 'computed' | 'missing' | 'unused';

const lonely = (value: unknown): string | null => {
  const text = asText(value)?.trim() ?? '';
  return /^@[\p{L}\p{N}_]+$/u.test(text) ? text.slice(1) : null;
};

const effectOf = (value: unknown): string | null => {
  const text = asText(value)?.trim() ?? '';
  const quoted = /^"([^"]*)"$/.exec(text);
  return quoted ? quoted[1]! : null;
};

export function placeOf(input: CallInput, props: ReadonlySet<string>): Place {
  const { value, param } = input;
  if (value === undefined || value === null) {
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
  if (input.value === undefined || input.value === null) {
    if (input.param.default !== undefined) return <span>{String(input.param.default)} <span className="faint">— как у эффекта</span></span>;
    return <span className="faint">{input.param.optional ? 'нет' : 'не передаётся'}</span>;
  }
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

export function CallEditor({ system, effect: raw, effects, onEffect, args, fromProps, filled, onArg, context, where, allow, extraFor, headAction, children, grouped = false, names, inputs: callerInputs, compact = false, implicit }: {
  system: System;
  effect: unknown;
  effects: [string, { label?: string }][];
  onEffect: (id: string | { expr: string } | null) => void;
  inputs?: readonly Param[];
  args: Record<string, unknown> | undefined;
  fromProps?: ReadonlySet<string>;
  filled?: Readonly<Record<string, 'actor' | 'targets'>>;
  onArg: (key: string, next: SlotRef | null) => void;
  context: SlotContext;
  where: string;
  allow?: SlotKind[];
  extraFor?: (param: Param) => SlotOption[];
  headAction?: ReactNode;
  children?: ReactNode;
  grouped?: boolean;
  names?: Map<string, string>;
  compact?: boolean;
  implicit?: (param: Param) => string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const fromInput = typeof raw === 'object' && raw ? /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((raw as { expr?: unknown }).expr ?? ''))?.[1] : undefined;
  const via = fromInput ? callerInputs?.find(param => param.key === fromInput) : undefined;
  const effect = typeof raw === 'string' ? raw : typeof via?.default === 'string' ? via.default : '';
  const called = system.effects[effect];
  const params = called ? paramsOf(system, called) : [];
  const inputs: CallInput[] = params.map(param => ({
    param, value: args?.[param.key], fromProp: Boolean(fromProps?.has(param.key)),
  }));
  const nameOf = (param: Param) => param.label ?? param.key;
  const editor = (input: CallInput) => (
    input.param.kind === 'effect' ? (
      <Select<string>
        label={nameOf(input.param)}
        value={effectOf(input.value) ?? ''}
        options={[['', input.param.default !== undefined ? `как у эффекта: ${system.effects[String(input.param.default)]?.label ?? String(input.param.default)}` : '— не передаётся —'],
          ...Object.entries(system.effects).filter(([id]) => id !== effect).map(([id, e]) => [id, e.label || id] as const)]}
        onChange={next => onArg(input.param.key, next ? { expr: JSON.stringify(next) } : null)}
      />
    ) : (
      <ValueField
        where={`${where} · ${nameOf(input.param)}`}
        value={input.value as never}
        context={context}
        {...(allow ? { allow } : {})}
        extraOptions={[...(extraFor?.(input.param) ?? []), ...rowsAsOptions(system, input.param)]}
        onChange={next => onArg(input.param.key, next)}
      />
    )
  );

  const flat = () => inputs.map(input => {
    const fill = filled?.[input.param.key];
    if (fill) {
      return (
        <div className="pair" key={input.param.key}>
          <span className="call-args__name">{nameOf(input.param)}</span>
          <span className="faint">{fill === 'actor' ? 'кто нажал кнопку' : 'цели, выбранные за столом'}</span>
        </div>
      );
    }
    const shown = status(input);
    return (
      <div className="pair" key={input.param.key}>
        <span className="call-args__name">{nameOf(input.param)}</span>
        {editor(input)}
        <span className={shown.bad ? 'need' : 'faint'}>{shown.text}</span>
      </div>
    );
  });

  const shownNames = namesFor(system, called, args, names);
  const shownValue = (input: CallInput): ReactNode => valueShown(system, input, shownNames.extra, shownNames.sheets);

  const groups = () => {
    const props = fromProps ?? new Set<string>();
    const own = inputs.filter(input => !filled?.[input.param.key]);
    const by = (place: Place) => own.filter(input => placeOf(input, props) === place);
    const record = by('record');
    const asked = by('asked');
    const computed = by('computed');
    const missing = by('missing');
    const unused = by('unused');
    const row = (input: CallInput, body: ReactNode, tail?: ReactNode) => (
      <div className="pair" key={input.param.key}>
        <span className="call-args__name">{nameOf(input.param)}</span>
        {body}
        {tail ?? null}
      </div>
    );
    const editing = (input: CallInput) => row(input, editor(input),
      <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>готово</Button>);
    return (
      <>
        {missing.map(input => row(input, editor(input), <span className="need">не заполнено</span>))}
        {record.length ? (
          <div className="call-group">
            <span className="call-group__title">Заполняют у каждой записи</span>
            <div className="inline inline--tight">
              {record.map(input => (open === input.param.key ? editing(input) : (
                <button key={input.param.key} type="button" className="btn btn--sm btn--ghost" title="считать формулой вместо свойства записи"
                  aria-label={`«${nameOf(input.param)}» заполняют у каждой записи`}
                  onClick={() => setOpen(input.param.key)}>{nameOf(input.param)}</button>
              )))}
            </div>
          </div>
        ) : null}
        {asked.length ? (
          <div className="call-group">
            <span className="call-group__title">Спросят за столом</span>
            {asked.map(input => (open === input.param.key ? editing(input) : row(input,
              <span className="faint">{input.param.ask?.by === 'gm' ? 'ведущего' : 'игрока'}</span>,
              <Button size="sm" variant="ghost" onClick={() => setOpen(input.param.key)}>изменить</Button>)))}
          </div>
        ) : null}
        {computed.length ? (
          <div className="call-group call-group--quiet">
            <span className="call-group__title">Считается само</span>
            {computed.map(input => (open === input.param.key ? editing(input) : row(input,
              <span className="call-group__value">← {shownValue(input)}</span>,
              <Button size="sm" variant="ghost" onClick={() => setOpen(input.param.key)}>изменить</Button>)))}
          </div>
        ) : null}
        {unused.length ? (
          <div className="inline inline--tight call-group--unused">
            <span className="faint">Не передаются:</span>
            {unused.map(input => (open === input.param.key ? editing(input) : (
              <Button key={input.param.key} size="sm" variant="ghost" title="передать значение" onClick={() => setOpen(input.param.key)}>{nameOf(input.param)}</Button>
            )))}
          </div>
        ) : null}
      </>
    );
  };

  const pick = callerInputs?.some(param => param.kind === 'effect') ? (
    <EffectPick value={raw} system={system} inputs={callerInputs}
      only={one => effects.some(([, e]) => e === one)} onChange={onEffect} />
  ) : (
    <Select
      value={typeof raw === 'string' ? raw : ''}
      options={[['', '— что вызвать —'], ...effects.map(([id, e]) => [id, e.label || id] as const)] as never}
      onChange={next => onEffect(next)}
    />
  );

  if (compact) {
    const empty = (input: CallInput) => input.value === undefined || input.value === null;
    const self = (input: CallInput) => (empty(input) ? implicit?.(input.param) ?? null : null);
    const rare = (input: CallInput) => empty(input)
      && (input.param.default !== undefined || Boolean(input.param.optional) || Boolean(input.param.ask) || self(input) !== null);
    const main = inputs.filter(input => !rare(input));
    const rest = inputs.filter(rare);
    const arg = (input: CallInput) => {
      const shown = status(input);
      return (
        <div className="pair call-row__arg" key={input.param.key}>
          <span className="call-args__name">{nameOf(input.param)}</span>
          {editor(input)}
          {self(input) ? <span className="faint">{self(input)}</span> : shown.bad ? <span className="need">не заполнено</span> : null}
        </div>
      );
    };
    return (
      <div className="call-row">
        <Field label="Какой эффект" needed={!effect && !fromInput}>{pick}</Field>
        {fromInput ? <span className="faint">{via ? `из входа «${via.label ?? via.key}»` : `входа «${fromInput}» нет`}</span> : null}
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

  return (
    <div className="stack stack--tight">
      <Field label="Какой эффект" needed={!effect && !fromInput}>
        {callerInputs?.some(param => param.kind === 'effect') ? (
          <EffectPick value={raw} system={system} inputs={callerInputs}
            only={one => effects.some(([, e]) => e === one)} onChange={onEffect} />
        ) : (
          <Select
            value={typeof raw === 'string' ? raw : ''}
            options={[['', '— какой эффект —'], ...effects.map(([id, e]) => [id, e.label || id] as const)] as never}
            onChange={next => onEffect(next)}
          />
        )}
      </Field>
      {fromInput ? <span className="faint">{via ? `зовёт эффект, переданный во вход «${via.label ?? via.key}»` : `входа «${fromInput}» нет`}{called ? ` · аргументы — как у «${called.label || effect}»` : ''}</span> : null}
      {children}
      {effect ? (
        <div className="stack stack--tight call-args">
          <div className="call-args__head">
            <span className="field__label">Что передаётся</span>
            {headAction}
          </div>
          {inputs.length ? null : <span className="faint">«{called?.label || effect}» ничего не принимает.</span>}
          {grouped ? groups() : flat()}
        </div>
      ) : null}
    </div>
  );
}
