import { useMemo, useState, type ReactNode } from 'react';
import type { System, Step, SlotRef, ValueKind } from '@vtt/schema';
import { Field, Segmented, Select } from '../../../../ui/primitives.tsx';
import type { CardGroup } from '../../cards.ts';
import { parseRollExpr, badFormula, exprText } from '../../roll-expr.ts';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import type { BarApi } from '../../../../store/formula-bar.ts';
import { labelOfTag } from '../../../../ui/formula.tsx';
import { SlotInput, chipOf, type SlotOption } from '../../slot-input.tsx';
import { outputRefs, stepNames, inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn, WithNumber } from '../words.ts';
import { SendBody } from './send-body.tsx';
import { Extras } from './extras.tsx';
import { calledOf } from '@vtt/engine/engine/effects';
import { amountParamOf } from '@vtt/engine/model/lists';
import { tight } from '@vtt/engine/model/amounts';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { DESK_ID } from '@vtt/engine/engine/owners';

const fieldTarget = (target: unknown): { sheet: string; tag: string } | null => {
  const expr = target && typeof target === 'object' && 'expr' in target ? String((target as { expr: unknown }).expr) : '';
  const found = /^\s*@([\p{L}\p{N}_]+)\.([\p{L}\p{N}_.]+)\s*$/u.exec(expr);
  return found ? { sheet: found[1]!, tag: found[2]! } : null;
};

function TargetPick({ target, context, onChange }: {
  target: unknown;
  context: SlotContext;
  onChange: (next: { expr: string } | null) => void;
}) {
  const system = context.system;
  const picked = fieldTarget(target);
  const param = target && typeof target === 'object' && 'expr' in target && !picked ? String((target as { expr: unknown }).expr).replace(/^@/, '') : '';
  const sheets = [...(context.sheets ?? new Map<string, string>())];
  const desk = fieldsOf(system).some(f => f.lives === 'desk');
  const fieldParams = (context.effect.params ?? []).filter(p => p.kind === 'field');
  const owner = picked?.sheet ?? (param ? `:${param}` : sheets[0]?.[0] ?? '');
  const options: (readonly [string, string])[] = [
    ...sheets.map(([name, label]) => [name, `«${label}»`] as const),
    ...(desk ? [[DESK_ID, 'стол'] as const] : []),
    ...fieldParams.map(p => [`:${p.key}`, `поле из входа «${p.label ?? p.key}»`] as const),
  ];
  const fields = fieldsOf(system).filter(f => f.value.kind === 'stored' && (owner === DESK_ID ? f.lives === 'desk' : f.lives !== 'desk'));
  return (
    <div className="row">
      <Field label="У кого" needed={!owner}>
        <Select<string>
          value={owner}
          options={options.length ? options : [['', '— у эффекта нет входов-листов —']]}
          onChange={next => {
            if (next.startsWith(':')) onChange({ expr: `@${next.slice(1)}` });
            else onChange(picked ? { expr: `@${next}.${picked.tag}` } : null);
          }}
        />
      </Field>
      {owner.startsWith(':') ? null : (
        <Field label="Какое поле" needed={!picked}>
          <Select<string>
            value={picked?.tag ?? ''}
            options={[['', '— какое поле —'], ...fields.map(f => [f.tag, f.label ?? f.tag] as const)]}
            onChange={next => onChange(next ? { expr: `@${owner}.${next}` } : null)}
          />
        </Field>
      )}
    </div>
  );
}

function ChangeValue({ amount, apply, applyIndex, context, edit, withNumber, onCreateFromRecord }: {
  amount?: Step;

  apply: Step;
  applyIndex: number;
  context: SlotContext;
  edit: EditFn;

  withNumber?: WithNumber;
  onCreateFromRecord?: () => SlotRef;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const рядом = useMemo(() => stepNames(context), [context]);
  const target = (apply as Record<string, any>).target;

  const amountId = String((amount as Record<string, any> | undefined)?.id ?? '');

  const asExpr = (): string => {
    const a = apply as Record<string, any>;
    const value = a.value;
    const written = value && typeof value === 'object'
      ? 'expr' in value ? String(value.expr) : 'const' in value ? String(value.const) : ''
      : '';
    const direction = String(a.direction ?? 'subtract');
    if (direction === 'set') return written;
    const amountName = written.trim() ? tight(written) : amountId ? `@${amountId}` : '';
    const targetName = target && typeof target === 'object' && 'expr' in target ? String(target.expr) : '';
    if (!targetName) return amountName;

    return `${targetName} ${direction === 'add' ? '+' : '-'} ${amountName}`;
  };

  const shown = draft ?? asExpr();

  const dice = (amount as Record<string, any> | undefined)?.die;
  const bonus = (amount as Record<string, any> | undefined)?.bonus;
  const diceChip = chipOf(dice, context);
  const bonusText = exprText(bonus);
  const both = Boolean(diceChip && bonusText);

  const sentChip = (label: ReactNode, onRemove: () => void, key: string) => (
    <span key={key} className="chips__chip chips__chip--sent">
      {label}
      <span className="chips__side chips__side--calc" title="считается шагом-расчётом раньше изменения">расчёт</span>
      <button
        type="button" className="chips__x" aria-label="убрать слагаемое"
        onMouseDown={e => { e.preventDefault(); onRemove(); }}
      >×</button>
    </span>
  );

  const names = amountId && amount ? {
    [amountId]: (
      <>
        {both ? <span className="chips__paren" aria-hidden>(</span> : null}
        {diceChip ? sentChip(
          diceChip.label,
          () => edit(0, step => { delete (step as Record<string, unknown>).die; }),
          'dice',
        ) : null}
        {both ? <span className="chips__plus" aria-hidden>+</span> : null}
        {bonusText ? sentChip(
          bonusText.replace(/[@#]([\p{L}\p{N}_.]+)/gu, (_, tag: string) => labelOfTag(context.system, tag)),
          () => edit(0, step => { delete (step as Record<string, unknown>).bonus; }),
          'bonus',
        ) : null}
        {both ? <span className="chips__paren" aria-hidden>)</span> : null}
      </>
    ),
  } : undefined;

  const DICE = /(\d+)?\s*[dдк]\s*(\d+)/iu;

  const mentions = (text: string, id: string) =>
    new RegExp(`[@#]${id}(?![\\p{L}\\p{N}_])`, 'u').test(text);

  const sendThrough = (
    fill: (amount: Record<string, any>) => void,

    place?: (name: string) => string,
  ) => {
    const line = (draft ?? asExpr()).trim();
    const put = (a: Step, apply: Step, id: string) => {
      fill(a as Record<string, any>);
      const name = `@${id}`;
      const next = (place ? place(name) : (mentions(line, id) ? line : (line ? `${line} + ${name}` : name)))
        .replace(/\s+/g, ' ').trim();
      const target = apply as Record<string, any>;
      target.direction = 'set';

      target.value = { expr: next };
    };
    if (!withNumber && !amountId) {

      setTrouble('кость бросает отдельный шаг — заведите шаг «бросок» и назовите его');
      return;
    }
    if (withNumber) withNumber(put);
    else {

      edit(0, a => fill(a as Record<string, any>));
      edit(applyIndex, apply => put({} as Step, apply, amountId));
    }
    setDraft(null);
    setTrouble(null);
  };

  const commit = (typed: string) => {
    const text = typed.trim();

    const rolled = text.match(DICE);
    if (rolled) {
      const notation = `${rolled[1] ?? 1}d${rolled[2]}`;
      const picked = parseRollExpr(notation, context.system).die;

      const next = (name: string) => (mentions(text, name.slice(1))
        ? text.replace(DICE, '').replace(/\+\s*\+/g, '+').replace(/[-+*/]\s*$/, '').replace(/\s+/g, ' ').trim()
        : text.replace(DICE, name));

      const bad = badFormula({ expr: next('@x') });
      if (bad) { setTrouble(bad); return; }
      sendThrough(a => { a.die = picked; }, next);
      return;
    }

    const bad = text ? badFormula({ expr: text }) : null;
    if (bad) { setTrouble(bad); return; }

    edit(applyIndex, step => {
      const a = step as Record<string, any>;
      if (!text) { delete a.value; return; }
      a.direction = 'set';

      a.value = { expr: text };
    });
    setDraft(null);
    setTrouble(null);
  };

  const putIntoAmount = (ref: SlotRef, place?: (name: string) => string) =>
    sendThrough(a => { a.die = ref; }, place);


  const needs = (context.effect.params ?? []).map(p => ({
    group: 'из записи',
    label: p.label ?? p.key,
    onPick: (insert: (piece: string) => string, bar: BarApi) => { bar.dismiss(); putIntoAmount({ param: p.key } as SlotRef, insert); },
  }));
  if (onCreateFromRecord) {
    needs.push({
      group: 'из записи',
      label: 'новый вход…',
      onPick: (insert: (piece: string) => string, bar: BarApi) => { bar.dismiss(); putIntoAmount(onCreateFromRecord(), insert); },
    });
  }

  for (const output of outputRefs(context.earlier)) {
    if (output.kind !== 'number') continue;
    needs.push({
      group: 'результат шага',
      label: output.label,
      onPick: (_insert: (piece: string) => string, bar: BarApi) => {
        bar.dismiss();
        edit(applyIndex, apply => {
          const target = apply as Record<string, unknown>;
          target.direction = 'subtract';
          target.value = { expr: `@${output.ref}` };
        });
        setDraft(null);
        setTrouble(null);
      },
    });
  }

  for (const [key, c] of Object.entries(context.system.constants ?? {})) {
    if (c.kind !== 'die') continue;
    needs.push({
      group: 'кость системы',
      label: c.label || key,
      onPick: (insert: (piece: string) => string, bar: BarApi) => { bar.dismiss(); putIntoAmount({ constant: key } as SlotRef, insert); },
    });
  }

  return (
    <>
      {}
      <TargetPick
        target={target}
        context={context}
        onChange={next => edit(applyIndex, step => {
          const t = step as Record<string, unknown>;
          if (next) t.target = next; else delete t.target;
        })}
      />

      {}
      <Field
        label="Станет"
        error={trouble}
        hint="Обычная математика. Поля пишутся через лист: @цель.хиты, @носитель.ки."
      >
        <FormulaField
          value={shown}
          system={context.system}
          where="изменение · станет"
          names={names}
          extraNames={рядом}
          {...(context.sheets ? { sheets: context.sheets } : {})}
          badges={inputBadges(context)}
          invalid={Boolean(trouble)}
          placeholder="например: @цель.хп − @урон"
          options={needs}
          onChange={next => { setTrouble(null); setDraft(next); }}
          onCommit={commit}
          onCancel={() => { setDraft(null); setTrouble(null); }}
        />
      </Field>
    </>
  );
}

export function ChangeBody({ group, context, edit, withNumber, system, onAddParam, onOpenEffect }: {
  group: CardGroup;
  context: SlotContext;
  edit: EditFn;
  withNumber?: WithNumber;
  system: System;
  onAddParam?: (label: string, kind: ValueKind) => string;
  onOpenEffect?: (id: string) => void;
  lane?: 'steps' | 'cost';
}) {
  const step = group.step as any;
  const mode = step.type === 'status' ? 'status' : step.type === 'emit' ? 'emit' : 'apply';
  const applyIndex = group.amount ? 1 : 0;
  const firstEvent = calledOf(system)[0]?.[0];

  const fromRecord = (label: string, kind: ValueKind) =>
    onAddParam ? () => ({ param: onAddParam(label, kind) }) : undefined;

  const statusOptions: SlotOption[] = Object.entries(system.effects ?? {})
    .filter(([, e]) => (e.activation ?? 'manual') === 'passive')
    .map(([id, e]) => ({ group: 'Состояния', label: e.label ?? id, ref: { const: id } }));

  return (
    <>
      {}
      <Segmented
        value={mode}
        options={[
          { key: 'apply', label: 'поле' }, { key: 'status', label: 'состояние' },
          ...(firstEvent || mode === 'emit' ? [{ key: 'emit', label: 'вызов' }] : []),
        ]}
        onChange={next => edit(applyIndex, draft => {
          const d = draft as any;
          if (next === 'status') {
            draft.type = 'status';
            d.mode ??= 'apply';
          } else if (next === 'emit') {
            draft.type = 'emit';
            d.event ??= firstEvent ?? '';
            const main = amountParamOf(system.effects[String(d.event)]);
            if (group.amount?.id && main) d.args = { ...(d.args ?? {}), [main.key]: { expr: `@${group.amount.id}` } };
          } else {
            draft.type = 'apply';
            d.direction ??= 'subtract';
            d.targetModifiers ??= true;
          }
        })}
      />


      {mode === 'emit' ? (
        <SendBody step={step} at={applyIndex} context={context} edit={edit} system={system}
          onOpenEffect={onOpenEffect} />
      ) : null}

      {mode === 'apply' ? (
        <>
          {}
          <ChangeValue
            amount={group.amount ?? undefined} apply={step} applyIndex={applyIndex}
            context={context} edit={edit} withNumber={withNumber}
            onCreateFromRecord={fromRecord('сколько — кости', 'dice')} />

          <Extras
            items={[{
              key: 'targetModifiers', label: 'не слушать правки поля',
              on: step.targetModifiers === false,
              add: () => edit(applyIndex, draft => { (draft as any).targetModifiers = false; }),
              drop: () => edit(applyIndex, draft => { (draft as any).targetModifiers = true; }),
              node: (
                <Field label="Правки поля" hint="Всё, что на листе правит приходящее в это поле число: состояния, черты.">
                  <Select
                    value={String(step.targetModifiers ?? true)}
                    options={[['true', 'слушаются'], ['false', 'не слушаются']] as const}
                    onChange={next => edit(applyIndex, draft => { (draft as any).targetModifiers = next === 'true'; })}
                  />
                </Field>
              ),
            }]}
          />
        </>
      ) : null}

      {mode === 'status' ? (
        <>
          {}
          {group.amount ? (
            <span className="faint">
              величина сохранена — вернётся, если снова выбрать «поле»
            </span>
          ) : null}
          <Field label="Что делаем">
            <Select
              value={String(step.mode ?? 'apply')}
              options={[['apply', 'вешаем'], ['remove', 'снимаем']] as const}
              onChange={next => edit(applyIndex, draft => { (draft as any).mode = next; })}
            />
          </Field>
          <Field label="Какое">
            <SlotInput
              where="изменение · какое"
              value={step.effect} context={context} extraOptions={statusOptions} keep={['const', 'param']}
              onChange={next => edit(applyIndex, draft => { (draft as any).effect = next ?? undefined; })}
              onCreateFromRecord={fromRecord('какое', 'effect')}
            />
          </Field>
          <Field label={String(step.mode ?? 'apply') === 'remove' ? 'С кого' : 'На кого'} needed={!step.to}>
            <Select<string>
              value={/^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String(step.to?.expr ?? ''))?.[1] ?? ''}
              options={[['', '— какой лист —'], ...[...(context.sheets ?? new Map<string, string>())].map(([name, label]) => [name, `«${label}»`] as const)]}
              onChange={next => edit(applyIndex, draft => { if (next) (draft as any).to = { expr: `@${next}` }; else delete (draft as any).to; })}
            />
          </Field>
          <StatusArgs step={step} context={context} onChange={(key, expr) => edit(applyIndex, draft => {
            const d = draft as any;
            const args = { ...(d.args ?? {}) };
            if (expr.trim()) args[key] = { expr }; else delete args[key];
            if (Object.keys(args).length) d.args = args; else delete d.args;
          })} />
        </>
      ) : null}
    </>
  );
}

function StatusArgs({ step, context, onChange }: {
  step: any;
  context: SlotContext;
  onChange: (key: string, expr: string) => void;
}) {
  if (String(step.mode ?? 'apply') === 'remove') return null;
  const id = step.effect && typeof step.effect === 'object' && 'const' in step.effect ? String(step.effect.const) : '';
  const params = context.system.effects[id]?.params ?? [];
  if (!params.length) return null;
  return (
    <>
      {params.map(param => (
        <Field key={param.key} label={`Запомнит: ${param.label ?? param.key}`} hint="Висящий эффект хранит это значение и читает его по имени.">
          <FormulaField
            value={String(step.args?.[param.key]?.expr ?? '')}
            system={context.system}
            where={`наложить · ${param.label ?? param.key}`}
            {...(context.sheets ? { sheets: context.sheets } : {})}
            placeholder={param.kind === 'sheet' ? 'например: @действующий' : 'например: @действующий.spell_dc'}
            onCommit={next => onChange(param.key, next)}
          />
        </Field>
      ))}
    </>
  );
}
