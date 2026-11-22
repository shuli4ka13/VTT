import { useMemo, useState } from 'react';
import type { System } from '@vtt/schema';
import { Select, Fold, Field } from '../../../../ui/primitives.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { formulaWords } from '../../../../ui/formula-words.ts';
import { namesOf, inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { badFormula } from '../../roll-expr.ts';
import { DegreesEditor } from '../../degrees-editor.tsx';
import { whoOf } from '../../readback.ts';
import { tagWords, splitsTargets } from '@vtt/engine';

const loose = (draft: unknown): Record<string, any> => draft as Record<string, any>;

const SUCCESS = [['atLeast', 'не меньше порога'], ['over', 'строго больше'], ['notOver', 'не больше порога'], ['under', 'строго меньше'], ['equals', 'ровно порог']] as const;

export function CheckBody({ step, context, edit, system, asIf = false }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  system: System;
  asIf?: boolean;
}) {
  const at = 0;

  const names = useMemo(() => {
    const out = namesOf(context);
    for (const word of tagWords(context.system).keys()) out.set(word, word);
    return out;
  }, [context]);
  const shared = { extraNames: names, badges: inputBadges(context), ...(context.sheets ? { sheets: context.sheets } : {}) };
  const forced = (key: 'succeedOn' | 'failOn') => (
    <FormulaField
      value={String((step[key] as { expr?: unknown } | undefined)?.expr ?? '')}
      system={system}
      where={`проверка · ${key === 'succeedOn' ? 'успех на кости' : 'провал на кости'}`}
      {...shared}
      placeholder={key === 'succeedOn' ? 'например: 20' : 'например: 1'}
      onCommit={text => edit(at, draft => { const d = loose(draft); if (text.trim()) d[key] = { expr: text.trim() }; else delete d[key]; })}
    />
  );
  const always = (key: 'failIf' | 'passWith') => (
    <FormulaField
      value={String((step[key] as { expr?: unknown } | undefined)?.expr ?? '')}
      system={system}
      where={`проверка · ${key === 'failIf' ? 'всегда провал' : 'всегда успех с запасом'}`}
      {...shared}
      placeholder={key === 'failIf' ? 'например: носитель.ки == 0' : 'например: 1'}
      onCommit={text => edit(at, draft => { const d = loose(draft); if (text.trim()) d[key] = { expr: text.trim() }; else delete d[key]; })}
    />
  );
  const degreeNames = useMemo(() => new Map([...names, ['успех', 'успех'], ['степени', 'степени']]), [names]);
  const degreeMeanings = useMemo(() => new Map([['успех', 'да или нет — исход этой проверки'], ['степени', 'число — запас над порогом этой проверки']]), []);
  const rolled = readsRoll(step, context);
  const summary = moreSummary(step, rolled, text => formulaWords(system, text, names));
  const side = (key: 'value' | 'versus', label: string, placeholder: string) => (
    <div data-field={label} className="check-line__side" {...(key === 'versus' ? { 'data-guide': 'check-formula' } : {})}>
      <SideFormula value={step[key]} where={`проверка · ${label.toLowerCase()}`} placeholder={placeholder} context={context} names={names}
        onSet={text => edit(at, draft => {
          const d = loose(draft);
          if (text) d[key] = { expr: text }; else delete d[key];
          if (key === 'value' && !readsRoll({ value: d.value }, context)) { delete d.succeedOn; delete d.failOn; }
        })} />
    </div>
  );
  const inside = insideFormula(step, context);
  const against = againstWords(step, context);
  return (
    <>
      <div className="field">
        <span className="field__label">{asIf ? 'Условие' : 'Проверка'}</span>
        <div className="check-line">
          {side('value', 'Что проверяем', 'бросок или число')}
          <span data-field="Знак" className="check-line__sign">
            <Select label="Знак" value={String(step.successWhen ?? 'atLeast')} options={SIGNS}
              onChange={next => edit(at, draft => setSuccessWhen(loose(draft), next))} />
          </span>
          {side('versus', 'С чем', 'порог: число, поле через лист или бросок соперника')}
        </div>
      </div>
      {against ? <span className="faint">{against}</span> : null}
      {inside ? <span className="faint">бросок «{inside}» стоит внутри формулы: «успех на кости», сдвиг порога и пересчёт правок «против» для каждой цели на такое сравнение не действуют</span> : null}
      <ContestLine step={step} roll={null} context={context} />
      <Fold title="ещё" summary={summary}>
        <Field label="Ступени" hint="Вместо «да/нет» исход читается ступенями: первая подходящая сверху. В условиях видны «успех», «степени» и шаги эффекта.">
          <DegreesEditor value={step.degrees} system={system} where="проверка · ступень" placeholder="степени >= 5"
            shared={{ extraNames: degreeNames, meanings: degreeMeanings, badges: inputBadges(context), ...(context.sheets ? { sheets: context.sheets } : {}) }}
            set={next => edit(at, draft => { const d = loose(draft); if (next === undefined) delete d.degrees; else d.degrees = next; })} />
        </Field>
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

const SIGNS = [['atLeast', 'не меньше  ≥'], ['over', 'больше  >'], ['notOver', 'не больше  ≤'], ['under', 'меньше  <'], ['equals', 'равно  =']] as const;

function SideFormula({ value, where, placeholder, context, names, onSet }: {
  value: unknown;
  where: string;
  placeholder: string;
  context: SlotContext;
  names: Map<string, string>;
  onSet: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const stored = String((value as { expr?: unknown } | undefined)?.expr ?? '');
  return (
    <>
      <FormulaField
        value={draft ?? stored}
        system={context.system}
        where={where}
        extraNames={names}
        whole
        {...(context.sheets ? { sheets: context.sheets } : {})}
        badges={inputBadges(context)}
        invalid={Boolean(trouble)}
        placeholder={placeholder}
        onChange={next => { setTrouble(null); setDraft(next); }}
        onCommit={typed => {
          const text = typed.trim();
          if (text === stored.trim()) { setDraft(null); setTrouble(null); return; }
          const bad = text ? badFormula({ expr: text }) : null;
          if (bad) { setTrouble(bad); return; }
          setDraft(null);
          setTrouble(null);
          onSet(text);
        }}
        onCancel={() => { setDraft(null); setTrouble(null); }}
      />
      {trouble ? <span className="field__error">{trouble}</span> : null}
    </>
  );
}

const exprText = (ref: unknown): string => String((ref as { expr?: unknown } | undefined)?.expr ?? '');

const throwsOf = (context: SlotContext): any[] =>
  ((context.effect.steps ?? []) as any[]).filter(one => one.type === 'roll' && one.id && (one.by || one.field));

const throwerOf = (roll: any): string | null =>
  /^\s*@([\p{L}\p{N}_]+)/u.exec(exprText(roll.field ?? roll.by))?.[1] ?? null;

const readsInside = (text: string, id: string): boolean =>
  new RegExp(`@${id}(?![\\p{L}\\p{N}_])`, 'u').test(text) && !new RegExp(`^@${id}(\\.[\\p{L}\\p{N}_.]+)?$`, 'u').test(text.trim());

function insideFormula(step: any, context: SlotContext): string | null {
  for (const roll of throwsOf(context)) {
    if (readsInside(exprText(step.value), roll.id) || readsInside(exprText(step.versus), roll.id)) return String(roll.id);
  }
  return null;
}

function againstWords(step: any, context: SlotContext): string | null {
  const rolls = throwsOf(context);
  const whole = (ref: unknown) => rolls.find(one => exprText(ref).trim() === `@${one.id}`);
  const mine = whole(step.value) ?? whole(step.versus);
  if (!mine) return null;
  const other = exprText(mine === whole(step.value) ? step.versus : step.value);
  const roller = throwerOf(mine);
  const found = new Set<string>();
  for (const [name] of context.sheets ?? []) {
    if (name !== 'стол' && name !== roller && new RegExp(`@${name}\\.`, 'u').test(other)) found.add(name);
  }
  const theirs = whole({ expr: other });
  const their = theirs ? throwerOf(theirs) : null;
  if (their && their !== roller) found.add(their);
  if (!found.size) return null;
  if (found.size > 1) return 'правки «против» на этом сравнении не действуют: в пороге назван не один лист';
  const [only] = [...found];
  return `правки «против» на этом сравнении — против: ${context.sheets?.get(only!) ?? only}`;
}

const moreSummary = (step: any, rolled: boolean, said: (text: string) => string): string => [
  step.degrees?.table || (Array.isArray(step.degrees) && step.degrees.length) ? 'исход ступенями' : '',
  rolled && step.succeedOn ? `успех от ${said(String(step.succeedOn.expr ?? ''))} на кости` : '',
  step.failIf ? 'есть условие провала' : '',
  step.passWith ? 'успех с запасом' : '',
  rolled && step.failOn ? `провал до ${said(String(step.failOn.expr ?? ''))}` : '',
].filter(Boolean).join(' · ');

const readsRoll = (step: any, context: SlotContext): boolean => {
  const name = /^@([\p{L}\p{N}_]+)$/u.exec(String(step.value?.expr ?? '').trim())?.[1];
  return Boolean(name && context.earlier.some(e => e.id === name && e.type === 'roll'));
};

const setSuccessWhen = (d: Record<string, unknown>, op: string): void => {
  if (op === 'atLeast') delete d.successWhen; else d.successWhen = op;
};

const loneRef = (ref: unknown): string | null =>
  /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr?: unknown } | undefined)?.expr ?? ''))?.[1] ?? null;

function ContestLine({ step, roll, context }: { step: any; roll: any | null; context: SlotContext }) {
  const steps = (context.effect.steps ?? []) as any[];
  const split = steps.findIndex(one => splitsTargets(one));
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
