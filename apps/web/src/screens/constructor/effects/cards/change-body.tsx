import { operandText } from '@vtt/engine/formula';
import { SheetPick } from '../../sheet-pick.tsx';
import { sheetChoices, callable } from '../../slots.tsx';
import { useMemo, useState, type ReactNode } from 'react';
import type { System, Step, SlotRef, ValueKind } from '@vtt/schema';
import { Field, Segmented, Select, Button } from '../../../../ui/primitives.tsx';
import type { CardGroup } from '../../cards.ts';
import { retype } from '../../cards.ts';
import { parseRollExpr, badFormula, exprText } from '../../roll-expr.ts';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import type { BarApi } from '../../../../store/formula-bar.ts';
import { labelOfTag } from '../../../../ui/formula.tsx';
import { EffectPick, effectNameOf } from '../../effect-pick.tsx';
import { throwsDice } from '@vtt/engine/model/lint';
import { DICE_BY_STEP } from '@vtt/engine/words/glossary';
import { dieWord, readingWord } from '../../readback.ts';
import { unquote } from '../../roll-expr.ts';
import { asDice } from '../../../../words.ts';
import { outputRefs, stepNames, inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn, WithNumber } from '../words.ts';
import { SendBody } from './send-body.tsx';
import { callArgs, retarget } from '../call-args.ts';
import { CallEditor } from '../../call-editor.tsx';
import { ConditionField } from '../../condition-field.tsx';
import { amountParamOf } from '@vtt/engine/model/lists';
import { fieldsOf, cellSource } from '@vtt/engine/model/sheet-columns';
import { DESK_ID } from '@vtt/engine/engine/owners';
import { FieldPick } from '../../../../ui/field-pick.tsx';

const fieldTarget = (target: unknown): { sheet: string; tag: string } | null => {
  const expr = target && typeof target === 'object' && 'expr' in target ? String((target as { expr: unknown }).expr) : '';
  const found = /^\s*@([\p{L}\p{N}_]+)\.([\p{L}\p{N}_.]+)\s*$/u.exec(expr);
  return found ? { sheet: found[1]!, tag: found[2]! } : null;
};

const rowNamesOf = (context: SlotContext): { name: string; label: string; table: string }[] => [
  ...(context.effect.params ?? [])
    .filter(param => param.kind === 'choice' && typeof param.from === 'string' && !param.many)
    .map(param => ({ name: param.key, label: param.label ?? param.key, table: String(param.from) })),
  ...context.earlier.filter(step => step.table).map(step => ({ name: step.id, label: step.id, table: step.table! })),
];

const storedColumns = (system: System, table: string) => {
  const spec = system.tables?.[table];
  return (spec?.columns ?? []).filter(column => (spec?.rows ?? []).some(row => cellSource(column, row).kind === 'input'));
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
  const [chosen, setChosen] = useState<string | null>(null);
  const owner = picked?.sheet ?? (param ? `:${param}` : chosen ?? sheets[0]?.[0] ?? '');
  const options: (readonly [string, string])[] = [
    ...sheets.map(([name, label]) => [name, `«${label}»`] as const),
    ...(desk ? [[DESK_ID, 'стол'] as const] : []),
    ...fieldParams.map(p => [`:${p.key}`, `поле из входа «${p.label ?? p.key}»`] as const),
  ];
  const fields = fieldsOf(system).filter(f => f.value.kind === 'stored' && (owner === DESK_ID ? f.lives === 'desk' : f.lives !== 'desk'));
  const cells = rowNamesOf(context)
    .filter(row => (owner === DESK_ID ? system.tables?.[row.table]?.owner === 'desk' : system.tables?.[row.table]?.owner && system.tables?.[row.table]?.owner !== 'desk'))
    .flatMap(row => storedColumns(system, row.table).map(column => [`${row.name}.${column.key}`, `${row.label} · ${column.label ?? column.key}`] as const));
  return (
    <div className="row">
      <Field label="У кого" needed={!owner}>
        <Select<string>
          value={owner}
          options={options.length ? options : [['', '— у эффекта нет входов-листов —']]}
          onChange={next => {
            if (next.startsWith(':')) { onChange({ expr: `@${next.slice(1)}` }); return; }
            setChosen(next);
            onChange(picked ? { expr: `@${next}.${picked.tag}` } : null);
          }}
        />
      </Field>
      {owner.startsWith(':') ? null : (
        <Field label="Какое поле" needed={!picked}>
          <FieldPick
            system={system}
            value={picked?.tag ?? ''}
            fields={fields}
            extra={cells}
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

  const direction = String((apply as Record<string, any>).direction ?? 'subtract');
  const valueText = (): string => {
    const value = (apply as Record<string, any>).value;
    return value && typeof value === 'object' && 'expr' in value ? String(value.expr) : '';
  };
  const fixedText = exprText((amount as Record<string, any> | undefined)?.fixed);
  const inline = Boolean(fixedText) && !(amount as Record<string, any> | undefined)?.die && !exprText((amount as Record<string, any> | undefined)?.bonus)
    && Boolean(amountId) && [`@${amountId}`, ''].includes(valueText().trim());
  const asExpr = (): string => {
    if (inline) return fixedText;
    const written = valueText();
    return written.trim() ? written : amountId ? `@${amountId}` : '';
  };

  const shown = draft ?? asExpr();

  const dice = (amount as Record<string, any> | undefined)?.die;
  const bonus = (amount as Record<string, any> | undefined)?.bonus;
  const diceChip = dieChip(dice, context);
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

  const DICE = /(?<![\p{L}\p{N}_@.])(\d+)?\s*[dдк]\s*(\d+)/iu;

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
      const next = (place ? place(name) : (mentions(line, id) ? line : (line ? `${operandText(line, '+')} + ${name}` : name)))
        .replace(/\s+/g, ' ').trim();
      const target = apply as Record<string, any>;
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
    if (inline) {
      const bad = text ? badFormula({ expr: text }) : null;
      if (bad) { setTrouble(bad); return; }
      edit(0, step => { const a = step as Record<string, any>; if (text) a.fixed = { expr: text }; else delete a.fixed; });
      setDraft(null);
      setTrouble(null);
      return;
    }

    if (throwsDice(text)) { setTrouble(DICE_BY_STEP); return; }

    const bare = text.replace(/"[^"]*"|'[^']*'/g, m => ' '.repeat(m.length));
    const rolled = bare.match(DICE);
    if (rolled) {
      const notation = `${rolled[1] ?? 1}d${rolled[2]}`;
      const picked = parseRollExpr(notation, context.system).die;

      const at = rolled.index ?? 0;
      const swap = (put: string) => `${text.slice(0, at)}${put}${text.slice(at + rolled[0].length)}`;
      const next = (name: string) => (mentions(text, name.slice(1))
        ? swap('').replace(/\+\s*\+/g, '+').replace(/[-+*/]\s*$/, '').replace(/\s+/g, ' ').trim()
        : swap(name));

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
    onPick: (insert: (piece: string) => string, bar: BarApi) => {
      if (p.kind !== 'dice') { bar.write(insert(`@${p.key}`)); return; }
      bar.dismiss();
      putIntoAmount({ expr: `@${p.key}` }, insert);
    },
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
      onPick: (insert: (piece: string) => string, bar: BarApi) => { bar.dismiss(); putIntoAmount(key, insert); },
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

      <Field label="Как">
        <Select<string>
          value={direction}
          options={[['subtract', 'отнять'], ['add', 'прибавить'], ['set', 'поставить']]}
          onChange={next => edit(applyIndex, step => { const d = step as Record<string, unknown>; if (next === 'subtract') delete d.direction; else d.direction = next; })}
        />
      </Field>
      <Field
        label="Сколько"
        error={trouble}
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
          placeholder={direction === 'set' ? 'например: @цель.поле' : 'например: @шаг'}
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
  const firstEvent = callable(system, context.effect)[0]?.[0];
  const [retyping, setRetyping] = useState(false);
  const blank = (mode === 'apply' ? !step.target : !step.effect) || retyping;

  const fromRecord = (label: string, kind: ValueKind) =>
    onAddParam ? (): SlotRef => ({ expr: `@${onAddParam(label, kind)}` }) : undefined;

  return (
    <>
      {blank ? <Segmented
        value={mode}
        options={[
          { key: 'apply', label: 'поле' }, { key: 'status', label: 'состояние' },
          ...(firstEvent || mode === 'emit' ? [{ key: 'emit', label: 'вызов' }] : []),
        ]}
        onChange={next => edit(applyIndex, draft => {
          const d = draft as any;
          const kept = system.effects[effectNameOf(d.effect)];
          const fits = (activation: 'manual' | 'passive') =>
            !kept ? typeof d.effect === 'object' && d.effect !== null : (kept.activation ?? 'manual') === activation;
          if (next === 'status') {
            retype(draft, 'status');
            if (!fits('passive')) { delete d.effect; delete d.args; }
          } else if (next === 'emit') {
            retype(draft, 'emit');
            if (!fits('manual')) { delete d.effect; delete d.args; }
            d.effect ??= firstEvent ?? '';
            const main = amountParamOf(system.effects[String(d.effect)]);
            if (group.amount?.id && main) d.args = { ...(d.args ?? {}), [main.key]: { expr: `@${group.amount.id}` } };
            const filled = callArgs(system, context.effect, String(d.effect), d.args, { inLoop: context.earlier.some(one => one.splits) });
            if (Object.keys(filled).length) d.args = filled;
          } else {
            retype(draft, 'apply');
          }
        })}
      /> : (
        <div className="inline inline--tight step-retype">
          <Button size="sm" variant="ghost" title="поменять, что делает шаг: изменить поле, наложить состояние или вызвать эффект" onClick={() => setRetyping(true)}>сменить вид шага</Button>
        </div>
      )}


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
              onChange={next => edit(applyIndex, draft => {
                const d = draft as any;
                if (next === 'apply') { delete d.mode; delete d.where; delete d.one; delete d.by; } else d.mode = next;
              })}
            />
          </Field>
          {String(step.mode ?? 'apply') === 'remove' ? (
            <Field label="Снять">
              <Select
                value={step.by === 'tag' ? 'tag' : 'effect'}
                options={[['effect', 'этот эффект'], ['tag', 'все эффекты с меткой']] as const}
                onChange={next => edit(applyIndex, draft => {
                  const d = draft as any;
                  delete d.effect; delete d.args;
                  if (next === 'tag') { d.by = 'tag'; delete d.where; } else delete d.by;
                })}
              />
            </Field>
          ) : null}
          {String(step.mode ?? 'apply') === 'remove' && step.by === 'tag' ? (
            <Field label="Какая метка" needed={!step.effect}>
              <Select
                value={typeof step.effect === 'string' ? step.effect : ''}
                options={[['', '— какая метка —'], ...[...new Set(Object.values(system.effects ?? {}).flatMap(one => one.tags ?? []))].sort().map(tag => [tag, tag] as const)] as never}
                onChange={next => edit(applyIndex, draft => { const d = draft as any; if (next) d.effect = next; else delete d.effect; })}
              />
            </Field>
          ) : (
          <Field label="Какое">
            <EffectPick
              value={step.effect}
              system={system}
              only={effect => (effect.activation ?? 'manual') === 'passive'}
              inputs={context.effect.params ?? []}
              {...(onAddParam ? { onCreateParam: () => onAddParam('какое', 'effect') } : {})}
              empty="— какое состояние —"
              onChange={next => edit(applyIndex, draft => {
                const d = draft as any;
                if (!next) { delete d.effect; return; }
                d.effect = next;
                if (typeof next !== 'string') return;
                const args = callArgs(system, context.effect, next, d.args, { inLoop: context.earlier.some(one => one.splits), to: d.to, applied: true });
                if (Object.keys(args).length) d.args = args; else delete d.args;
              })}
            />
          </Field>
          )}
          <Field label={String(step.mode ?? 'apply') === 'remove' ? 'С кого' : 'На кого'} needed={!step.to}>
            <SheetPick
              value={step.to} sheets={sheetChoices(context).singles} system={system} where="состояние · на кого"
              onChange={next => edit(applyIndex, draft => {
                const d = draft as any;
                const before = d.to;
                if (next) d.to = next; else delete d.to;
                const id = effectNameOf(d.effect);
                if (!id) return;
                const args = retarget(system, context.effect, id, d.args, before, next);
                if (Object.keys(args).length) d.args = args; else delete d.args;
              })}
            />
          </Field>
          {String(step.mode ?? 'apply') === 'remove' ? (
            <>
              {step.by === 'tag' ? null : <ConditionField
                value={step.where?.expr}
                onChange={expr => edit(applyIndex, draft => { const d = draft as any; if (expr) d.where = { expr }; else delete d.where; })}
                system={system}
                sheets={context.sheets}
                names={new Map([
                  ...(context.effect.params ?? []),
                  ...(system.effects[effectNameOf(step.effect)]?.params ?? []),
                ].map(param => [param.key, param.label ?? param.key] as const))}
                quick={(system.effects[effectNameOf(step.effect)]?.params ?? []).filter(param => param.kind === 'boolean').map(param => ({ ref: param.key, label: param.label ?? param.key, kind: 'boolean' as const }))}
                title="Какие снять"
                where="состояние · какие снять"
                placeholder="например: @заклинание == @spell_effect"
              />}
              <Field label="Сколько снять">
                <Select
                  value={step.one ? 'one' : 'all'}
                  options={[['all', 'все'], ['one', 'одно, самое раннее']] as const}
                  onChange={next => edit(applyIndex, draft => { const d = draft as any; if (next === 'one') d.one = true; else delete d.one; })}
                />
              </Field>
            </>
          ) : null}
          <StatusArgs step={step} context={context} onArg={(key, next) => edit(applyIndex, draft => {
            const d = draft as any;
            const args = { ...(d.args ?? {}) };
            if (next === undefined || next === null) delete args[key]; else args[key] = next;
            if (Object.keys(args).length) d.args = args; else delete d.args;
          })} />
        </>
      ) : null}
    </>
  );
}

function StatusArgs({ step, context, onArg }: {
  step: any;
  context: SlotContext;
  onArg: (key: string, next: SlotRef | null) => void;
}) {
  if (String(step.mode ?? 'apply') === 'remove') return null;
  const id = effectNameOf(step.effect);
  const known = context.system.effects[id];
  if (known && known.activation !== 'passive') return null;
  if (known) {
    if (!(known.params ?? []).length) return null;
    return (
      <CallEditor
        system={context.system}
        effect={id}
        args={step.args as Record<string, unknown> | undefined}
        onArg={onArg}
        context={context}
        where="наложить"
      />
    );
  }
  const params = typeof step.effect !== 'object' || !step.effect ? [] : [...new Map(Object.values(context.system.effects)
    .filter(effect => effect.activation === 'passive')
    .flatMap(effect => effect.params ?? [])
    .map(param => [param.key, param] as const)).values()];
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
            placeholder={param.kind === 'sheet' ? 'например: @действующий' : 'например: @действующий.поле'}
            onCommit={next => onArg(param.key, next.trim() ? { expr: next } : null)}
          />
        </Field>
      ))}
    </>
  );
}

function dieChip(dice: unknown, context: SlotContext): { label: string } | null {
  if (typeof dice === 'string' && dice) {
    const reading = readingWord(context.system, dice);
    const die = dieWord(context.system, dice);
    return { label: reading ? `${die} (${reading})` : die };
  }
  const expr = dice && typeof dice === 'object' ? String((dice as { expr?: unknown }).expr ?? '').trim() : '';
  if (!expr) return null;
  const input = /^@([\p{L}\p{N}_]+)$/u.exec(expr)?.[1];
  if (input) return { label: context.effect.params?.find(p => p.key === input)?.label ?? input };
  return { label: asDice(unquote(expr)) };
}

