import { useMemo, useState } from 'react';
import type { Step } from '@vtt/schema';
import { Select } from '../../../../ui/primitives.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { useFormulaBar } from '../../../../store/formula-bar.ts';
import { namesOf, inputBadges, sheetChoices } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import { loneSheet } from '../../sheet-pick.tsx';
import type { EditFn } from '../words.ts';
import { Extras } from './extras.tsx';
import type { Extra } from './extras.tsx';
import { RollTags } from './roll-line.tsx';
import { useStepName } from './step-name.tsx';
import {
  DIE, EXPR, FIELD, OWN_DIE, OWN_FIELD, headOf, rollableFields, setDie, setField, setWho, tailOf, whatOf, whatOptions,
} from './roll-what.ts';

type Loose = Record<string, unknown>;

const loose = (draft: unknown): Loose => draft as Loose;

const exprOf = (value: unknown): string => String((value as { expr?: unknown } | undefined)?.expr ?? '');

const NOBODY = 'никто — кости ничьи';

function SlotFormula({ value, label, where, placeholder, context, onSet }: {
  value: unknown;
  label: string;
  where: string;
  placeholder: string;
  context: SlotContext;
  onSet: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const names = useMemo(() => namesOf(context), [context]);
  const stored = exprOf(value);
  return (
    <div data-field={label}>
      <FormulaField
        value={draft ?? stored}
        system={context.system}
        where={where}
        extraNames={names}
        {...(context.sheets ? { sheets: context.sheets } : {})}
        badges={inputBadges(context)}
        placeholder={placeholder}
        onChange={next => setDraft(next)}
        onCommit={typed => { setDraft(null); if (typed.trim() !== stored.trim()) onSet(typed.trim()); }}
        onCancel={() => setDraft(null)}
      />
    </div>
  );
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
    if (next.startsWith(FIELD)) set(it => setField(it, next.slice(FIELD.length), firstSheet));
    else if (next.startsWith(DIE)) set(it => setDie(it, next.slice(DIE.length)));
    else if (next.startsWith(EXPR)) set(it => setDie(it, { expr: next.slice(EXPR.length) }));
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
        <SlotFormula value={read[key]} label={label} where={`бросок · ${where}`} placeholder={placeholder} context={context}
          onSet={text => set(it => { if (text) it[key] = { expr: text }; else delete it[key]; })} />
      </div>
    ),
  });

  const rule = fielded ? rollableFields(context.system, context.effect).find(one => one.tail === tailOf(exprOf(read.field)))?.rule : undefined;
  const extras: Extra[] = fielded
    ? [
      slot('shift', 'Поправка к числу поля', 'поправка', 'например +20 за лёгкую задачу'),
      ...(read.bonus !== undefined && read.bonus !== null ? [slot('bonus', 'Прибавка к итогу', 'прибавка', 'нет')] : []),
    ]
    : [
      slot('count', 'Сколько костей', 'сколько костей', 'как у кости'),
      slot('bonus', 'Прибавка', 'прибавка', 'нет'),
    ];

  return (
    <>
      <div className="inline inline--tight number-line">
        {name.input}
        <span className="number-line__eq">=</span>
        <div data-field="Бросок" className="number-line__formula roll-formula">
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
            <SlotFormula value={read.die && typeof read.die === 'object' ? read.die : undefined} label="Своя кость" where="бросок · кость" placeholder="2к6 или формула кости" context={context}
              onSet={text => { if (text) { setHand(null); set(it => setDie(it, { expr: text })); } }} />
          ) : null}
          {what === OWN_FIELD ? (
            <SlotFormula value={read.field} label="Адрес поля" where="бросок поля · какое поле" placeholder="наберите @ и выберите поле" context={context}
              onSet={text => { if (text) { setHand(null); set(it => { it.field = { expr: text }; }); } }} />
          ) : null}
        </div>
      </div>
      {name.trouble}
      {read.fixed !== undefined && read.fixed !== null ? <span className="field__error">в шаге осталась формула «{exprOf(read.fixed)}» — она снимется, когда выберете, что бросают</span> : null}
      {rule ? <span className="faint">по правилу «{rule}» из «Правил → Броски»: кость, успех и степени — оттуда</span> : null}
      {!fielded && who === '' ? <span className="faint">кости ничьи: правки броска и вопросы «увидев кости» на них не действуют</span> : null}
      <Extras items={extras} />
      <RollTags label={fielded ? 'Ещё метки' : 'Метки'} roll={read} system={context.system} onRoll={change => set(change)} />
    </>
  );
}
