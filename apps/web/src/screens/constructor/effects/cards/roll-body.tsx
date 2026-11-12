import { useMemo, useState } from 'react';
import type { Step } from '@vtt/schema';
import { Select } from '../../../../ui/primitives.tsx';
import { useFormulaBar } from '../../../../store/formula-bar.ts';
import { sheetChoices } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import { loneSheet } from '../../sheet-pick.tsx';
import type { EditFn } from '../words.ts';
import { Extras } from './extras.tsx';
import { SlotFormula } from './die-pick.tsx';
import type { Extra } from './extras.tsx';
import { RollTags } from './roll-line.tsx';
import { useStepName } from './step-name.tsx';
import { dieSaid } from '../../readback.ts';
import { resultsOf } from '@vtt/engine/model/names-at';
import { ResultChips } from './result-chips.tsx';
import { rollSaid } from '../../rules/rolls.ts';
import {
  DIE, EXPR, FIELD, OWN_DIE, OWN_FIELD, anyPair, headOf, isPair, rollableFields, setDie, setField, setSecond, setWho, tailOf, whatOf, whatOptions,
} from './roll-what.ts';

type Loose = Record<string, unknown>;

const loose = (draft: unknown): Loose => draft as Loose;

const exprOf = (value: unknown): string => String((value as { expr?: unknown } | undefined)?.expr ?? '');

const NOBODY = 'никто — кости ничьи';

function ownDieSaid(context: SlotContext, text: string): string {
  const input = /^@([\p{L}\p{N}_]+)$/u.exec(text.trim())?.[1];
  const param = input ? (context.effect.params ?? []).find(one => one.key === input) : undefined;
  const source = param ? `кость из входа «${param.label ?? param.key}»` : `кость «${text.replace(/['"]/g, '')}»`;
  return `${source}: выпавшие грани складываются, правила успеха у неё нет`;
}

export function RollBody({ step, context, edit, takenNames, onRename }: {
  step: Step;
  context: SlotContext;
  edit: EditFn;
  takenNames?: readonly string[];
  onRename?: (from: string, to: string) => void;
}) {
  const read = loose(step);
  const current = typeof read.id === 'string' ? read.id : '';
  const name = useStepName({ current, context, edit, takenNames, onRename });
  const [hand, setHand] = useState<typeof OWN_DIE | typeof OWN_FIELD | null>(null);

  const fielded = read.field !== undefined;
  const { singles } = sheetChoices(context);
  const firstSheet = [...singles.keys()][0];
  const who = fielded ? headOf(exprOf(read.field)) : exprOf(read.by).trim();
  const sheets: (readonly [string, string])[] = [...singles].map(([key, label]) => [`@${key}`, label] as const);
  const stray = who !== '' && !sheets.some(([value]) => value === who);
  const people: (readonly [string, string])[] = [
    ...(who === '' && fielded ? [['', 'кто бросает?'] as const] : []),
    ...(stray ? [[who, `${loneSheet({ expr: who }) || who} — такого листа здесь нет`] as const] : []),
    ...sheets,
    ...(fielded ? [] : [['', NOBODY] as const]),
  ];

  const options = useMemo(() => whatOptions(context.system, context.effect), [context.system, context.effect]);
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
        <SlotFormula value={read[key]} label={label} system={context.system} where={`бросок · ${where}`} placeholder={placeholder} context={context}
          onSet={text => set(it => { if (text) it[key] = { expr: text }; else delete it[key]; })} />
      </div>
    ),
  });

  const several = typeof read.die === 'string' && ((context.system.constants?.[read.die] as { dice?: unknown[] } | undefined)?.dice ?? []).length > 1;
  const picked = fielded ? rollableFields(context.system, context.effect).find(one => one.tail === tailOf(exprOf(read.field))) : undefined;
  const rule = picked ? context.system.rolls?.[picked.roll] : undefined;
  const constant = typeof read.die === 'string' ? context.system.constants?.[read.die] : undefined;
  const die = constant ? dieSaid(constant, context.system, read.count !== undefined && read.count !== null) : null;
  const keepExtra: Extra = {
    key: 'keep',
    label: 'оставить',
    on: read.keep !== undefined && read.keep !== null,
    add: () => {},
    drop: () => set(it => { delete it.keep; delete it.keepWorst; }),
    node: (
      <div className="field">
        <span className="field__label">Оставить</span>
        <div className="inline inline--tight">
          <SlotFormula value={read.keep} label="Сколько оставить" system={context.system} where="бросок · сколько оставить" placeholder="сколько костей" context={context}
            onSet={text => set(it => { if (text) it.keep = { expr: text }; else { delete it.keep; delete it.keepWorst; } })} />
          <Select label="Какие оставить" value={read.keepWorst === true ? 'worst' : ''} options={[['', 'лучших'], ['worst', 'худших']] as const}
            onChange={next => set(it => { if (next === 'worst') it.keepWorst = true; else delete it.keepWorst; })} />
        </div>
      </div>
    ),
  };
  const extras: Extra[] = fielded
    ? [
      slot('shift', 'Поправка к числу поля', 'поправка', 'например +20 за лёгкую задачу'),
      slot('bonus', 'Прибавка к итогу', 'прибавка', 'нет'),
    ]
    : [
      ...(several && (read.count === undefined || read.count === null) ? [] : [slot('count', 'Сколько костей', 'сколько костей', 'как у кости')]),
      ...(read.die !== undefined && read.die !== null ? [slot('times', 'Сколько раз', 'сколько раз', 'один раз'), keepExtra] : []),
      slot('bonus', 'Прибавка', 'прибавка', 'нет'),
    ];

  return (
    <>
      <div className="inline inline--tight number-line">
        {name.input}
        <span className="number-line__eq">=</span>
        <div data-field="Бросок" className={`number-line__formula roll-formula${pairing ? ' roll-formula--pair' : ''}`}>
          <select
            className={`roll-by${who === '' ? ' roll-by--none' : ''}`}
            data-field="Кто бросает"
            aria-label="Кто бросает"
            title="Кто бросает — на его бросок действуют правки (преимущество, «Благословение») и вопросы «увидев кости»."
            value={who}
            onFocus={() => useFormulaBar.getState().commit()}
            onChange={event => { const next = event.target.value; if (next !== who) set(it => setWho(it, next)); }}
          >
            {people.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="number-line__eq">бросает</span>
          <span data-field="Что бросает" className="roll-what"><Select label="Что бросает" value={what} options={options} onChange={pickWhat} /></span>
          {what === OWN_DIE ? (
            <SlotFormula value={read.die && typeof read.die === 'object' ? read.die : undefined} label="Своя кость" system={context.system} where="бросок · кость" placeholder="2к6 или формула кости" context={context}
              onSet={text => { if (text) { setHand(null); set(it => setDie(it, { expr: text })); } }} />
          ) : null}
          {what === OWN_FIELD ? (
            <SlotFormula value={read.field} label="Адрес поля" system={context.system} where="бросок поля · какое поле" placeholder="наберите @ и выберите поле" context={context}
              onSet={text => { if (text) { setHand(null); set(it => { it.field = { expr: text }; }); } }} />
          ) : null}
          {pairing ? (
            <div className="roll-second">
              <span className="number-line__eq">и</span>
              <span data-field="Второе поле" className="roll-what">
                <Select label="Второе поле" value={secondShown} options={[['', 'то же поле', ''], ...fieldOptions, [OWN_FIELD, 'поле своим адресом…', 'Другое']] as never} onChange={pickSecond} />
              </span>
              {secondShown === OWN_FIELD ? (
                <SlotFormula value={read.second} label="Адрес второго поля" system={context.system} where="бросок поля · второе поле" placeholder="наберите @ и выберите поле" context={context}
                  onSet={text => { setSecondHand(false); set(it => { if (text) it.second = { expr: text }; else delete it.second; }); }} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {name.trouble}
      {read.fixed !== undefined && read.fixed !== null ? <span className="field__error">в шаге осталась формула «{exprOf(read.fixed)}» — она снимется, когда выберете, что бросают</span> : null}
      {picked && rule ? <span className="faint">по правилу «{picked.rule}» из «Правил → Броски»: {rollSaid(context.system, rule)}</span> : null}
      {constant && die ? <span className="faint">{constant.label || String(read.die)}: {die}</span> : null}
      {!fielded && !constant && read.die && typeof read.die === 'object' ? <span className="faint">{ownDieSaid(context, exprOf(read.die))}</span> : null}
      {!fielded && who === '' ? <span className="faint">кости ничьи: правки броска и вопросы «увидев кости» на них не действуют</span> : null}
      <div className="roll-extras"><Extras items={extras} /></div>
      {current ? (
        <ResultChips name={current} system={context.system} nameSlot={<span className="result-row__name" title="так итог броска зовётся в формулах: @имя, а через точку — его части">{current}</span>}
          outputs={resultsOf(context.system, context.effect.params ?? [], step as never).map(one => ({ key: one.path.slice(1) || 'целиком', label: one.label.replace(/^да или нет: /, ''), kind: one.kind }))} />
      ) : null}
      <RollTags label={fielded ? 'Ещё метки' : 'Метки'} roll={read} system={context.system} onRoll={change => set(change)} />
    </>
  );
}
