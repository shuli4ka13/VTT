import { useMemo, useState, type ReactNode } from 'react';
import type { System, Step, SlotRef } from '@vtt/schema';
import { Field, Segmented, Select } from '../../../../ui/primitives.tsx';
import type { CardGroup } from '../../cards.ts';
import { parseRollExpr } from '../../roll-expr.ts';
import { FormulaChips } from '../../../../ui/formula-chips.tsx';
import { labelOfTag } from '../../../../ui/formula.tsx';
import { SlotInput, chipOf, type SlotOption } from '../../slot-input.tsx';
import { outputRefs, stepNames } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn, WithNumber } from '../words.ts';
import { badFormula, exprText } from './roll-expr-input.tsx';
import { SendBody } from './send-body.tsx';
import { Extras } from './extras.tsx';
import { calledOf } from '@vtt/engine/engine/effects';

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
    if (value && typeof value === 'object' && 'expr' in value) return String(value.expr);

    const amountName = amountId ? `@${amountId}` : '';
    const targetName = target && typeof target === 'object' && 'tag' in target ? `@${target.tag}` : '';
    const direction = String(a.direction ?? 'subtract');
    if (direction === 'set') return amountName;
    if (!targetName) return amountName;

    return `${targetName} ${direction === 'add' ? '+' : '-'} ${amountName}`;
  };

  const shown = draft ?? asExpr();

  const rawValue = (apply as Record<string, any>).value;
  const senderMarks: string[] = rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.sender)
    ? rawValue.sender : [];

  const dice = (amount as Record<string, any> | undefined)?.dice;
  const bonus = (amount as Record<string, any> | undefined)?.bonus;
  const diceChip = chipOf(dice, context);
  const bonusText = exprText(bonus);
  const both = Boolean(diceChip && bonusText);

  const sentChip = (label: ReactNode, onRemove: () => void, key: string) => (
    <span key={key} className="chips__chip chips__chip--sent">
      {label}
      <span className="chips__side" title="посчитано отправителем, приходит числом">у отправителя</span>
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
          () => edit(0, step => { delete (step as Record<string, unknown>).dice; }),
          'dice',
        ) : null}
        {both ? <span className="chips__plus" aria-hidden>+</span> : null}
        {bonusText ? sentChip(
          bonusText.replace(/[@#]([\p{L}\p{N}_]+)/gu, (_, tag: string) => labelOfTag(context.system, tag)),
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

      const kept = senderMarks.filter(tag => mentions(next, tag));
      target.value = { expr: next, of: 'target', sender: kept.length ? kept : undefined };
    };
    if (!withNumber && !amountId) {

      setTrouble('кость бросает отправитель — заведите шаг «число» и назовите его');
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

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();

    const rolled = text.match(DICE);
    if (rolled) {
      const notation = `${rolled[1] ?? 1}d${rolled[2]}`;
      const picked = parseRollExpr(notation, context.system).die;

      const next = (name: string) => (mentions(text, name.slice(1))
        ? text.replace(DICE, '').replace(/\+\s*\+/g, '+').replace(/[-+*/]\s*$/, '').replace(/\s+/g, ' ').trim()
        : text.replace(DICE, name));

      const bad = badFormula({ expr: next('@x') });
      if (bad) { setTrouble(bad); return; }
      sendThrough(a => { a.dice = picked; }, next);
      return;
    }

    const bad = text ? badFormula({ expr: text }) : null;
    if (bad) { setTrouble(bad); return; }

    edit(applyIndex, step => {
      const a = step as Record<string, any>;
      if (!text) { delete a.value; return; }
      a.direction = 'set';

      const kept = senderMarks.filter(tag => mentions(text, tag));
      a.value = { expr: text, of: 'target', sender: kept.length ? kept : undefined };
    });
    setDraft(null);
    setTrouble(null);
  };

  const putIntoAmount = (ref: SlotRef, place?: (name: string) => string) =>
    sendThrough(a => { a.dice = ref; }, place);

  const flipSide = (tag: string) => {
    const line = (draft ?? asExpr()).trim();
    edit(applyIndex, step => {
      const a = step as Record<string, any>;
      const value = (a.value && typeof a.value === 'object' && 'expr' in a.value)
        ? a.value : { expr: line, of: 'target' };
      const marked: string[] = Array.isArray(value.sender) ? value.sender : [];
      const sender = marked.includes(tag) ? marked.filter(t => t !== tag) : [...marked, tag];
      a.direction = 'set';
      a.value = { ...value, sender: sender.length ? sender : undefined };
    });
    setDraft(null);
    setTrouble(null);
  };

  const needs = (context.effect.params ?? []).map(p => ({
    group: 'из записи',
    label: p.label ?? p.key,
    onPick: (insert: (piece: string) => string) => putIntoAmount({ param: p.key } as SlotRef, insert),
  }));
  if (onCreateFromRecord) {
    needs.push({
      group: 'из записи',
      label: 'новая потребность…',
      onPick: (insert: (piece: string) => string) => putIntoAmount(onCreateFromRecord(), insert),
    });
  }

  for (const output of outputRefs(context.earlier)) {
    if (output.kind !== 'number') continue;
    needs.push({
      group: 'результат шага',
      label: output.label,
      onPick: () => {
        edit(applyIndex, apply => {
          const target = apply as Record<string, unknown>;
          target.direction = 'subtract';
          target.value = { ref: output.ref };
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
      onPick: (insert: (piece: string) => string) => putIntoAmount({ constant: key } as SlotRef, insert),
    });
  }

  return (
    <>
      {}
      <Field
        label="что меняется"
        needed={!target}
        hint={target ? undefined : 'Поле цели: что этот шаг поменяет.'}
      >
        <SlotInput
          value={target}
          context={context}
          allow={['tag', 'param']}
          side="target"
          placeholder="поле цели"
          onChange={next => edit(applyIndex, target => {
            const t = target as Record<string, unknown>;
            if (next) t.target = next; else delete t.target;
          })}
          onCreateFromRecord={onCreateFromRecord}
        />
      </Field>

      {}
      <Field
        label="станет"
        error={trouble}
        hint="Обычная математика. Подпись у поля — чей лист его считает: щёлкните, чтобы взять у отправителя — он пришлёт своё число."
      >
        <FormulaChips
          value={shown}
          system={context.system}
          names={names}
          extraNames={рядом}
          side="target"
          placeholder="например: @хп − @урон"
          calculator
          extraOptions={needs}
          fromSender={senderMarks}
          onFlipSide={flipSide}
          onChange={setDraft}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(null); setTrouble(null); }
          }}
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
  onAddParam?: (label: string, kind: string) => string;
  onOpenEffect?: (id: string) => void;
}) {
  const step = group.step as any;
  const mode = step.type === 'status' ? 'status' : step.type === 'emit' ? 'emit' : 'apply';
  const applyIndex = group.amount ? 1 : 0;
  const firstEvent = calledOf(system)[0]?.[0];

  const fromRecord = (label: string, kind: string) =>
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
            d.tags ??= [];
            if (group.amount?.id && d.amount === undefined) d.amount = { ref: group.amount.id };
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
              key: 'targetModifiers', label: 'не слушать правки цели',
              on: step.targetModifiers === false,
              add: () => edit(applyIndex, draft => { (draft as any).targetModifiers = false; }),
              drop: () => edit(applyIndex, draft => { (draft as any).targetModifiers = true; }),
              node: (
                <Field label="правки цели" hint="Всё, что у цели правит приходящее число: её состояния, черты, поля.">
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
          <Field label="что делаем">
            <Select
              value={String(step.mode ?? 'apply')}
              options={[['apply', 'вешаем'], ['remove', 'снимаем']] as const}
              onChange={next => edit(applyIndex, draft => { (draft as any).mode = next; })}
            />
          </Field>
          <Field label="какое">
            <SlotInput
              value={step.effect} context={context} extraOptions={statusOptions}
              onChange={next => edit(applyIndex, draft => { (draft as any).effect = next ?? undefined; })}
              onCreateFromRecord={fromRecord('какое', 'effect')}
            />
          </Field>
        </>
      ) : null}
    </>
  );
}
