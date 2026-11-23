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
import { tagWords, stepSaid, splitsTargets, NAMES, NAME_LABELS, DESK_ID } from '@vtt/engine';
import { tagSaid, tagsSaid } from '../../tag-said.ts';
import { t as tg, useT } from '../../../../i18n/author.ts';

const loose = (draft: unknown): Record<string, any> => draft as Record<string, any>;

const successSigns = () => [['atLeast', tg('rollCards:success.atLeast')], ['over', tg('rollCards:success.over')], ['notOver', tg('rollCards:success.notOver')], ['under', tg('rollCards:success.under')], ['equals', tg('rollCards:success.equals')]] as const;

export function CheckBody({ step, context, edit, system, asIf = false }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  system: System;
  asIf?: boolean;
}) {
  const t = useT('rollCards');
  const at = 0;

  const names = useMemo(() => {
    const out = namesOf(context);
    for (const word of tagWords(context.system).keys()) out.set(word, tagSaid(context.system, word));
    return out;
  }, [context]);
  const shared = { extraNames: names, badges: inputBadges(context), ...(context.sheets ? { sheets: context.sheets } : {}) };
  const forced = (key: 'succeedOn' | 'failOn') => (
    <FormulaField
      value={String((step[key] as { expr?: unknown } | undefined)?.expr ?? '')}
      system={system}
      where={t(`where.${key}`)}
      {...shared}
      placeholder={t(`placeholder.${key}`)}
      onCommit={text => edit(at, draft => { const d = loose(draft); if (text.trim()) d[key] = { expr: text.trim() }; else delete d[key]; })}
    />
  );
  const always = (key: 'failIf' | 'passWith') => (
    <FormulaField
      value={String((step[key] as { expr?: unknown } | undefined)?.expr ?? '')}
      system={system}
      where={t(`where.${key}`)}
      {...shared}
      placeholder={t(`placeholder.${key}`)}
      onCommit={text => edit(at, draft => { const d = loose(draft); if (text.trim()) d[key] = { expr: text.trim() }; else delete d[key]; })}
    />
  );
  const degreeNames = useMemo(() => new Map([...names, [NAMES.success, NAME_LABELS.success], [NAMES.margin, NAME_LABELS.margin]]), [names]);
  const degreeMeanings = useMemo(() => new Map([[NAMES.success, t('meaning.success')], [NAMES.margin, t('meaning.margin')]]), [t]);
  const rolled = readsRoll(step, context);
  const summary = moreSummary(step, rolled, text => formulaWords(system, text, names));
  const side = (key: 'value' | 'versus') => (
    <div data-field={t(`side.${key}.label`)} className="check-line__side" {...(key === 'versus' ? { 'data-guide': 'check-formula' } : {})}>
      <SideFormula value={step[key]} where={t(`side.${key}.where`)} placeholder={t(`side.${key}.placeholder`)} context={context} names={names}
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
        <span className="field__label">{asIf ? t('field.if') : t('field.check')}</span>
        <div className="check-line">
          {side('value')}
          <span data-field={t('sign.label')} className="check-line__sign">
            <Select label={t('sign.label')} value={String(step.successWhen ?? 'atLeast')} options={signs()}
              onChange={next => edit(at, draft => setSuccessWhen(loose(draft), next))} />
          </span>
          {side('versus')}
        </div>
      </div>
      {against ? <span className="faint">{against}</span> : null}
      {inside ? <span className="faint">{t('inside', { name: inside })}</span> : null}
      <ContestLine step={step} roll={null} context={context} />
      <Fold title={t('common:more')} summary={summary}>
        <Field label={t('degrees.label')} hint={t('degrees.hint')}>
          <DegreesEditor value={step.degrees} system={system} where={t('degrees.where')} placeholder={t('degrees.placeholder')}
            shared={{ extraNames: degreeNames, meanings: degreeMeanings, badges: inputBadges(context), ...(context.sheets ? { sheets: context.sheets } : {}) }}
            set={next => edit(at, draft => { const d = loose(draft); if (next === undefined) delete d.degrees; else d.degrees = next; })} />
        </Field>
        {rolled ? (
          <div className="row">
            <Field label={t('succeedOn.label')} hint={t('succeedOn.hint')}>{forced('succeedOn')}</Field>
            <Field label={t('failOn.label')} hint={t('failOn.hint')}>{forced('failOn')}</Field>
          </div>
        ) : null}
        <div className="row">
          <Field label={t('failIf.label')} hint={t('failIf.hint')}>{always('failIf')}</Field>
          <Field label={t('passWith.label')} hint={t('passWith.hint')}>{always('passWith')}</Field>
        </div>
      </Fold>
    </>
  );
}

const signs = () => [['atLeast', tg('rollCards:sign.atLeast')], ['over', tg('rollCards:sign.over')], ['notOver', tg('rollCards:sign.notOver')], ['under', tg('rollCards:sign.under')], ['equals', tg('rollCards:sign.equals')]] as const;

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
    if (readsInside(exprText(step.value), roll.id) || readsInside(exprText(step.versus), roll.id)) return stepSaid(roll);
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
    if (name !== DESK_ID && name !== roller && new RegExp(`@${name}\\.`, 'u').test(other)) found.add(name);
  }
  const theirs = whole({ expr: other });
  const their = theirs ? throwerOf(theirs) : null;
  if (their && their !== roller) found.add(their);
  if (!found.size) return null;
  if (found.size > 1) return tg('rollCards:against.many');
  const [only] = [...found];
  return tg('rollCards:against.one', { name: context.sheets?.get(only!) ?? only });
}

const moreSummary = (step: any, rolled: boolean, said: (text: string) => string): string => [
  step.degrees?.table || (Array.isArray(step.degrees) && step.degrees.length) ? tg('rollCards:more.degrees') : '',
  rolled && step.succeedOn ? tg('rollCards:more.succeedOn', { said: said(String(step.succeedOn.expr ?? '')) }) : '',
  step.failIf ? tg('rollCards:more.failIf') : '',
  step.passWith ? tg('rollCards:more.passWith') : '',
  rolled && step.failOn ? tg('rollCards:more.failOn', { said: said(String(step.failOn.expr ?? '')) }) : '',
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
  const t = useT('rollCards');
  const steps = (context.effect.steps ?? []) as any[];
  const split = steps.findIndex(one => splitsTargets(one));
  const find = (name: string | null) => (name ? steps.findIndex(one => one.id === name && one.type === 'roll' && one.by) : -1);
  const mineAt = roll ? steps.indexOf(roll) : find(loneRef(step.value));
  const theirsAt = find(loneRef(step.versus));
  if (mineAt < 0 || theirsAt < 0) return null;
  const part = (at: number) => {
    const one = steps[at];
    const tags = ((one.tags ?? []) as unknown[]).filter((tag): tag is string => typeof tag === 'string');
    const what = tags.length ? `«${tagsSaid(context.system, tags)}»` : `«${stepSaid(one)}»`;
    const when = split >= 0 && at < split ? t('contest.shared') : split >= 0 ? t('contest.each') : '';
    return <span className="contest__side">{t('contest.rolls', { who: whoOf(context.effect, one.by), what })}{when ? <span className="faint"> — {when}</span> : null}</span>;
  };
  return (
    <p className="contest" title={t('contest.title')}>
      <span className="contest__mark" aria-hidden>⇄</span>
      {part(mineAt)}
      <span className="contest__vs">{t('contest.vs')}</span>
      {part(theirsAt)}
    </p>
  );
}

export { successSigns };
