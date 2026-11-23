import { useMemo, useState } from 'react';
import type { Step } from '@vtt/schema';
import { Select } from '../../../../ui/primitives.tsx';
import { Combo, type ComboOption } from '../../../../ui/combo.tsx';
import { useFormulaBar } from '../../../../store/formula-bar.ts';
import { sheetChoices } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import { formulaAsLabels } from '../../../../ui/formula-labels.ts';
import type { EditFn } from '../words.ts';
import { Extras } from './extras.tsx';
import { SlotFormula } from './die-pick.tsx';
import type { Extra } from './extras.tsx';
import { RollTags } from './roll-line.tsx';
import { useStepName } from './step-name.tsx';
import { dieSaid } from '../../readback.ts';
import { resultsOf, stepSaid, withoutYesNo } from '@vtt/engine';
import { ResultChips } from './result-chips.tsx';
import { rollSaid } from '../../rules/rolls.ts';
import { t as tg, useT } from '../../../../i18n/author.ts';
import {
  DIE, EXPR, FIELD, OWN_DIE, OWN_FIELD, anyPair, headOf, inputDice, isPair, rollableFields, setDie, setField, setSecond, setWho, tailOf, whatOf, whatOptions,
} from './roll-what.ts';

type Loose = Record<string, unknown>;

const loose = (draft: unknown): Loose => draft as Loose;

const exprOf = (value: unknown): string => String((value as { expr?: unknown } | undefined)?.expr ?? '');

const nobody = (): string => tg('rollCards:nobody');

function ownDieSaid(context: SlotContext, text: string): string {
  const named = inputDice(context.system, context.effect).find(([key]) => key === `${EXPR}${text.trim()}`);
  return named
    ? tg('rollCards:ownDie.fromInput', { name: named[1] })
    : tg('rollCards:ownDie.written', { name: formulaAsLabels(context.system, text.replace(/['"]/g, ''), context.names) });
}

const asCombo = (options: readonly (readonly [string, string] | readonly [string, string, string])[]): ComboOption[] =>
  options.map(([value, label, group]) => ({ value, label, ...(group ? { group } : {}) }));

export function RollBody({ step, context, edit, takenNames }: {
  step: Step;
  context: SlotContext;
  edit: EditFn;
  takenNames?: readonly string[];
}) {
  const t = useT('rollCards');
  const read = loose(step);
  const current = typeof read.id === 'string' ? read.id : '';
  const name = useStepName({ step: read, context, edit, takenNames });
  const [hand, setHand] = useState<typeof OWN_DIE | typeof OWN_FIELD | null>(null);

  const fielded = read.field !== undefined;
  const { singles } = sheetChoices(context);
  const firstSheet = [...singles.keys()][0];
  const who = fielded ? headOf(exprOf(read.field)) : exprOf(read.by).trim();
  const sheets: (readonly [string, string])[] = [...singles].map(([key, label]) => [`@${key}`, label] as const);
  const stray = who !== '' && !sheets.some(([value]) => value === who);
  const people: (readonly [string, string])[] = [
    ...(who === '' && fielded ? [['', t('who.ask')] as const] : []),
    ...(stray ? [[who, t('who.stray', { name: formulaAsLabels(context.system, who, context.names) })] as const] : []),
    ...sheets,
    ...(fielded ? [] : [['', nobody()] as const]),
  ];

  const options = useMemo(() => whatOptions(context.system, context.effect), [context.system, context.effect, t]);
  const stored = whatOf(read, options);
  const what = hand ?? stored;
  const set = (change: (it: Loose) => void) => edit(0, target => change(loose(target)));

  const pickWhat = (next: string) => {
    if (next === OWN_DIE || next === OWN_FIELD) {
      setHand(next);
      if (next === OWN_FIELD && !fielded) set(it => setField(it, '', firstSheet));
      return;
    }
    setHand(null);
    if (next.startsWith(FIELD)) {
      const tail = next.slice(FIELD.length);
      set(it => { setField(it, tail, firstSheet); if (!isPair(context.system, context.effect, tail)) delete it.second; });
    }
    else if (next.startsWith(DIE)) set(it => setDie(it, next.slice(DIE.length)));
    else if (next.startsWith(EXPR)) set(it => setDie(it, { expr: next.slice(EXPR.length) }));
  };

  const secondTail = tailOf(exprOf(read.second));
  const pairing = fielded && (what === OWN_FIELD ? anyPair(context.system) : isPair(context.system, context.effect, tailOf(exprOf(read.field))));
  const fieldOptions = options.filter(([key]) => key.startsWith(FIELD));
  const secondWhat = !secondTail ? '' : fieldOptions.some(([key]) => key === `${FIELD}${secondTail}`) ? `${FIELD}${secondTail}` : OWN_FIELD;
  const [secondHand, setSecondHand] = useState(false);
  const secondShown = secondHand ? OWN_FIELD : secondWhat;
  const pickSecond = (next: string) => {
    if (next === OWN_FIELD) { setSecondHand(true); return; }
    setSecondHand(false);
    set(it => setSecond(it, next.startsWith(FIELD) ? next.slice(FIELD.length) : ''));
  };

  const slot = (key: string, label: string, where: string, placeholder: string): Extra => ({
    key,
    label: label.toLowerCase(),
    on: read[key] !== undefined && read[key] !== null,
    add: () => {},
    drop: () => set(it => { delete it[key]; }),
    node: (
      <div className="field">
        <span className="field__label">{label}</span>
        <SlotFormula value={read[key]} label={label} system={context.system} where={where} placeholder={placeholder} context={context}
          onSet={text => set(it => { if (text) it[key] = { expr: text }; else delete it[key]; })} />
      </div>
    ),
  });

  const several = typeof read.die === 'string' && ((context.system.constants?.[read.die] as { dice?: unknown[] } | undefined)?.dice ?? []).length > 1;
  const picked = fielded ? rollableFields(context.system, context.effect).find(one => one.tail === tailOf(exprOf(read.field))) : undefined;
  const rule = picked ? context.system.rolls?.[picked.roll] : undefined;
  const constant = typeof read.die === 'string' ? context.system.constants?.[read.die] : undefined;
  const die = constant ? dieSaid(constant, context.system, read.count !== undefined && read.count !== null, context.names) : null;
  const keepExtra: Extra = {
    key: 'keep',
    label: t('keep.extra'),
    on: read.keep !== undefined && read.keep !== null,
    add: () => {},
    drop: () => set(it => { delete it.keep; delete it.keepWorst; }),
    node: (
      <div className="field">
        <span className="field__label">{t('keep.label')}</span>
        <div className="inline inline--tight">
          <SlotFormula value={read.keep} label={t('keep.count.label')} system={context.system} where={t('keep.count.where')} placeholder={t('keep.count.placeholder')} context={context}
            onSet={text => set(it => { if (text) it.keep = { expr: text }; else { delete it.keep; delete it.keepWorst; } })} />
          <Select label={t('keep.which')} value={read.keepWorst === true ? 'worst' : ''} options={[['', t('keep.best')], ['worst', t('keep.worst')]] as const}
            onChange={next => set(it => { if (next === 'worst') it.keepWorst = true; else delete it.keepWorst; })} />
        </div>
      </div>
    ),
  };
  const extras: Extra[] = fielded
    ? [
      slot('shift', t('slot.shift.label'), t('slot.shift.where'), t('slot.shift.placeholder')),
      slot('bonus', t('slot.bonusTotal.label'), t('slot.bonus.where'), t('slot.bonus.placeholder')),
    ]
    : [
      ...(several && (read.count === undefined || read.count === null) ? [] : [slot('count', t('slot.count.label'), t('slot.count.where'), t('slot.count.placeholder'))]),
      ...(read.die !== undefined && read.die !== null ? [slot('times', t('slot.times.label'), t('slot.times.where'), t('slot.times.placeholder')), keepExtra] : []),
      slot('bonus', t('slot.bonus.label'), t('slot.bonus.where'), t('slot.bonus.placeholder')),
    ];

  return (
    <>
      <div className="inline inline--tight number-line">
        {name.input}
        <span className="number-line__eq">=</span>
        <div data-field={t('roll.field')} className={`number-line__formula roll-formula${pairing ? ' roll-formula--pair' : ''}`}>
          <span data-field={t('who.label')} className="roll-who">
            <Combo
              className={`roll-by${who === '' ? ' roll-by--none' : ''}`}
              label={t('who.label')}
              title={t('who.title')}
              value={who}
              blank={people.find(([value]) => value === '')?.[1] ?? nobody()}
              options={asCombo(people)}
              onFocus={() => useFormulaBar.getState().commit()}
              onChange={next => { if (next !== who) set(it => setWho(it, next)); }}
            />
          </span>
          <span className="number-line__eq">{t('roll.verb')}</span>
          <span data-field={t('what.label')} className="roll-what"><Combo label={t('what.label')} value={what} blank={t('what.blank')} options={asCombo(options)} onChange={pickWhat} /></span>
          {what === OWN_DIE ? (
            <SlotFormula value={read.die && typeof read.die === 'object' ? read.die : undefined} label={t('own.die.label')} system={context.system} where={t('own.die.where')} placeholder={t('own.die.placeholder')} context={context}
              onSet={text => { if (text) { setHand(null); set(it => setDie(it, { expr: text })); } }} />
          ) : null}
          {what === OWN_FIELD ? (
            <SlotFormula value={read.field} label={t('own.field.label')} system={context.system} where={t('own.field.where')} placeholder={t('own.field.placeholder')} context={context}
              onSet={text => { if (text) { setHand(null); set(it => { it.field = { expr: text }; }); } }} />
          ) : null}
          {pairing ? (
            <div className="roll-second">
              <span className="number-line__eq">{t('roll.and')}</span>
              <span data-field={t('second.label')} className="roll-what">
                <Combo label={t('second.label')} value={secondShown} blank={t('second.same')} options={asCombo([['', t('second.same')], ...fieldOptions, [OWN_FIELD, t('what.ownField'), t('what.group.other')]])} onChange={pickSecond} />
              </span>
              {secondShown === OWN_FIELD ? (
                <SlotFormula value={read.second} label={t('second.address.label')} system={context.system} where={t('second.address.where')} placeholder={t('own.field.placeholder')} context={context}
                  onSet={text => { setSecondHand(false); set(it => { if (text) it.second = { expr: text }; else delete it.second; }); }} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {name.trouble}
      {read.fixed !== undefined && read.fixed !== null ? <span className="field__error">{t('fixed', { expr: exprOf(read.fixed) })}</span> : null}
      {picked && rule ? <span className="faint">{t('rule', { rule: picked.rule, said: rollSaid(context.system, rule, `«${picked.label}»`) })}</span> : null}
      {constant && die ? <span className="faint">{t('constant', { name: constant.label || String(read.die), said: die })}</span> : null}
      {!fielded && !constant && read.die && typeof read.die === 'object' ? <span className="faint">{ownDieSaid(context, exprOf(read.die))}</span> : null}
      {!fielded && who === '' ? <span className="faint">{t('nobodyNote')}</span> : null}
      <div className="roll-extras"><Extras items={extras} /></div>
      {current ? (
        <ResultChips name={stepSaid(read)} system={context.system} nameSlot={<span className="result-row__name" title={t('result.nameTitle')}>{stepSaid(read)}</span>}
          outputs={resultsOf(context.system, context.effect.params ?? [], step as never).map(one => ({ key: one.path.slice(1) || 'whole', label: withoutYesNo(one.label), kind: one.kind }))} />
      ) : null}
      <RollTags label={fielded ? t('tags.more') : t('tags.label')} roll={read} system={context.system} {...(context.names ? { names: context.names } : {})} onRoll={change => set(change)} />
    </>
  );
}
