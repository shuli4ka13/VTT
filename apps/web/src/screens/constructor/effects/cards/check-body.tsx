import { RollerPick, RollTags, setRoller } from './roll-line.tsx';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { System } from '@vtt/schema';
import { Select, Fold, Field } from '../../../../ui/primitives.tsx';
import { FieldRow } from '../../../../ui/field-row.tsx';
import type { RowField } from '../../../../ui/field-row.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { namesOf, inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { badFormula } from '../../roll-expr.ts';
import { whoOf } from '../../readback.ts';
import { parseCheckFormula, formatCheckFormula, compare } from '../../roll-formula.ts';
import { tagWords } from '@vtt/engine/engine/roll-tags';
import { rowTables } from '@vtt/engine/model/tables';

const loose = (draft: unknown): Record<string, any> => draft as Record<string, any>;

const SUCCESS = [['atLeast', 'не меньше порога'], ['over', 'строго больше'], ['notOver', 'не больше порога'], ['under', 'строго меньше'], ['equals', 'ровно порог']] as const;

export function CheckBody({ step, roll, context, edit, system, onUnpair, asIf = false }: {
  step: any;
  roll: any | null;
  context: SlotContext;
  edit: EditFn;
  system: System;
  onUnpair?: () => void;
  asIf?: boolean;
}) {
  const at = roll ? 1 : 0;
  const tables = rowTables(system);

  const more: RowField[] = [
    ...(tables.length ? [{
      key: 'degrees', label: 'Исход ступенями', width: 190,
      hint: 'Вместо «да/нет» исход читается ступенями по таблице: «провал / успех с ценой / полный успех»',
      node: (
        <Select
          value={String(step.degrees?.table ?? '')}
          options={[['', '— нет, да или нет —'], ...tables.map(([key, t]) => [key, t.label || key] as const)] as never}
          onChange={next => edit(at, draft => {
            const d = loose(draft);
            if (next) d.degrees = { table: next, ...(d.degrees?.of && d.degrees.of !== 'total' ? { of: d.degrees.of } : {}) }; else delete d.degrees;
          })}
        />
      ),
    }] : []),
    ...(step.degrees?.table ? [{
      key: 'degreesOf', label: 'Ступень по', width: 170,
      node: (
        <Select
          value={String(step.degrees.of ?? 'total')}
          options={[['total', 'итогу'], ['margin', 'запасу против порога']] as const}
          onChange={next => edit(at, draft => { if (next === 'total') delete loose(draft).degrees.of; else loose(draft).degrees.of = next; })}
        />
      ),
    }] : []),
  ];
  const forced = (key: 'succeedOn' | 'failOn') => (
    <FormulaField
      value={String((step[key] as { expr?: unknown } | undefined)?.expr ?? '')}
      system={system}
      where={`проверка · ${key === 'succeedOn' ? 'успех на кости' : 'провал на кости'}`}
      placeholder={key === 'succeedOn' ? 'например: 20' : 'например: 1'}
      onCommit={text => edit(at, draft => { const d = loose(draft); if (text.trim()) d[key] = { expr: text.trim() }; else delete d[key]; })}
    />
  );
  const always = (key: 'failIf' | 'passWith') => (
    <FormulaField
      value={String((step[key] as { expr?: unknown } | undefined)?.expr ?? '')}
      system={system}
      where={`проверка · ${key === 'failIf' ? 'всегда провал' : 'всегда успех с запасом'}`}
      placeholder={key === 'failIf' ? 'например: @носитель.ки == 0' : 'например: 1'}
      onCommit={text => edit(at, draft => { const d = loose(draft); if (text.trim()) d[key] = { expr: text.trim() }; else delete d[key]; })}
    />
  );
  const rolled = Boolean(roll || readsRoll(step, context));
  const summary = moreSummary(step, rolled);
  return (
    <>
      <div className="field">
        <span className="field__label">{asIf ? "Условие" : "Проверка"}</span>
        <CheckFormula step={step} roll={roll} context={context} edit={edit}
          lead={roll ? <RollerPick by={roll.by} context={context} keep onPick={next => edit(0, draft => setRoller(loose(draft), next))} /> : null}
          {...(onUnpair ? { onUnpair } : {})} />
        <span className="field__hint">{roll
          ? 'кость, прибавка, знак и порог; против кого — лист справа: >= цель.Класс брони'
          : rolled ? 'Бросок, знак и порог: число, поле через лист или бросок соперника' : 'Число, знак и порог: @носитель.ки >= 1'}</span>
      </div>
      {roll ? <RollTags roll={roll} system={system} onRoll={change => edit(0, draft => change(loose(draft)))} /> : null}
      <ContestLine step={step} roll={roll} context={context} />
      <Fold title="ещё" summary={summary}>
        {more.length ? <FieldRow id="check-more" fields={more} /> : null}
        {rolled ? (
          <div className="row">
            <Field label="Успех, если на кости не меньше" hint="Если на кости выпало столько или больше — успех, что бы ни прибавили.">{forced('succeedOn')}</Field>
            <Field label="Провал, если на кости не больше" hint="Натуральная 1: что бы ни прибавили — провал.">{forced('failOn')}</Field>
          </div>
        ) : null}
        <div className="row">
          <Field label="Всегда провал, если" hint="Условие да/нет: если верно — провал, что бы ни выпало.">{always('failIf')}</Field>
          <Field label="Всегда успех с запасом" hint="Число: проверка проходит с таким запасом над порогом.">{always('passWith')}</Field>
        </div>
      </Fold>
    </>
  );
}

const moreSummary = (step: any, rolled: boolean): string => [
  step.degrees?.table ? 'исход ступенями' : '',
  rolled && step.succeedOn ? `успех от ${String(step.succeedOn.expr ?? '')} на кости` : '',
  step.failIf ? 'есть условие провала' : '',
  step.passWith ? 'успех с запасом' : '',
  rolled && step.failOn ? `провал до ${String(step.failOn.expr ?? '')}` : '',
].filter(Boolean).join(' · ');

const readsRoll = (step: any, context: SlotContext): boolean => {
  const name = /^@([\p{L}\p{N}_]+)$/u.exec(String(step.value?.expr ?? '').trim())?.[1];
  return Boolean(name && context.earlier.some(e => e.id === name && e.type === 'roll'));
};

const setSuccessWhen = (d: Record<string, unknown>, op: string): void => {
  if (op === 'atLeast') delete d.successWhen; else d.successWhen = op;
};

function CheckFormula({ step, roll, context, edit, onUnpair, lead = null }: { step: any; roll: any | null; context: SlotContext; edit: EditFn; onUnpair?: () => void; lead?: ReactNode }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const names = useMemo(() => {
    const out = namesOf(context);
    for (const word of tagWords(context.system).keys()) out.set(word, word);
    return out;
  }, [context]);

  const drop = () => { setDraft(null); setTrouble(null); };
  const commit = (text: string) => {
    if (text.trim() === formatCheckFormula(roll, step)) { drop(); return; }
    const cmp = compare(text.trim());
    const own = Boolean(roll?.id && cmp && cmp.left === `@${roll.id}`);
    const plain = Boolean(cmp && !cmp.left.startsWith('кинуть(') && !own);
    if (roll && own && cmp) {
      if (!cmp.right) { setTrouble('справа от сравнения пусто — с чем сравниваем?'); return; }
      const bad = badFormula({ expr: cmp.right });
      if (bad) { setTrouble(bad); return; }
      edit(1, target => { const d = loose(target); d.versus = { expr: cmp.right }; setSuccessWhen(d, cmp.op); });
      drop();
      return;
    }
    if (!roll || (plain && onUnpair)) {
      if (!cmp || !cmp.left || !cmp.right) { setTrouble('проверка — это сравнение: «@носитель.ки >= 1»'); return; }
      const bad = badFormula({ expr: cmp.left }) ?? badFormula({ expr: cmp.right });
      if (bad) { setTrouble(bad); return; }
      edit(roll ? 1 : 0, target => {
        const d = loose(target);
        d.value = { expr: cmp.left };
        d.versus = { expr: cmp.right };
        setSuccessWhen(d, cmp.op);
        if (roll && !readsRoll({ value: d.value }, context)) { delete d.succeedOn; delete d.failOn; }
      });
      if (roll) onUnpair?.();
      drop();
      return;
    }
    const parsed = parseCheckFormula(text, context.system);
    if ('error' in parsed) { setTrouble(parsed.error); return; }
    const bad = badFormula(parsed.roll.bonus) ?? badFormula(parsed.versus);
    if (bad) { setTrouble(bad); return; }
    edit(0, target => {
      const d = loose(target);
      d.die = parsed.roll.die;
      if (parsed.roll.count) d.count = parsed.roll.count; else delete d.count;
      if (parsed.roll.bonus) d.bonus = parsed.roll.bonus; else delete d.bonus;
    });
    edit(1, target => {
      const d = loose(target);
      setSuccessWhen(d, parsed.successWhen);
      d.versus = parsed.versus;
    });
    drop();
  };

  const formula = (
    <FormulaField
      value={draft ?? formatCheckFormula(roll, step)}
      system={context.system}
      where="проверка"
      extraNames={names}
      {...(context.sheets ? { sheets: context.sheets } : {})}
      badges={inputBadges(context)}
      invalid={Boolean(trouble)}
      placeholder={roll ? 'кинуть(@кость) + прибавка >= @цель.кд' : '@носитель.ки >= 1'}
      onChange={next => { setTrouble(null); setDraft(next); }}
      onCommit={commit}
      onCancel={drop}
    />
  );

  return (
    <>
      <span data-guide="check-formula">{lead ? <div className="roll-formula">{lead}{formula}</div> : formula}</span>
      {trouble ? <span className="field__error">{trouble}</span> : null}
    </>
  );
}

const loneRef = (ref: unknown): string | null =>
  /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr?: unknown } | undefined)?.expr ?? ''))?.[1] ?? null;

function ContestLine({ step, roll, context }: { step: any; roll: any | null; context: SlotContext }) {
  const steps = (context.effect.steps ?? []) as any[];
  const split = steps.findIndex(one => one.type === 'each');
  const find = (name: string | null) => (name ? steps.findIndex(one => one.id === name && one.type === 'roll' && one.by) : -1);
  const mineAt = roll ? steps.indexOf(roll) : find(loneRef(step.value));
  const theirsAt = find(loneRef(step.versus));
  if (mineAt < 0 || theirsAt < 0) return null;
  const part = (at: number) => {
    const one = steps[at];
    const tags = ((one.tags ?? []) as unknown[]).filter((tag): tag is string => typeof tag === 'string');
    const what = tags.length ? `«${tags.join(', ')}»` : `«${String(one.id)}»`;
    const when = split >= 0 && at < split ? 'один на все цели' : split >= 0 ? 'у каждой цели свой' : '';
    return <span className="contest__side">{whoOf(context.effect, one.by)} бросает {what}{when ? <span className="faint"> — {when}</span> : null}</span>;
  };
  return (
    <p className="contest" title="Встречный бросок: итог одного броска сравнивается с итогом другого. Бросок выше «Для каждого из» — один на всех; ниже — свой у каждой цели.">
      <span className="contest__mark" aria-hidden>⇄</span>
      {part(mineAt)}
      <span className="contest__vs">против</span>
      {part(theirsAt)}
    </p>
  );
}

export { SUCCESS };
