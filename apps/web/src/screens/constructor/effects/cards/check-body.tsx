import { RollLine } from './roll-line.tsx';
import { useMemo, useState } from 'react';
import type { System } from '@vtt/schema';
import { Select, Input, Fold, Field } from '../../../../ui/primitives.tsx';
import { FieldRow } from '../../../../ui/field-row.tsx';
import type { RowField } from '../../../../ui/field-row.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { namesOf, inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { badFormula } from '../../roll-expr.ts';
import { parseCheckFormula, formatCheckFormula, compare } from '../../roll-formula.ts';
import { tagWords } from '@vtt/engine/engine/roll-tags';
import { rowTables } from '@vtt/engine/model/tables';

const loose = (draft: unknown): Record<string, any> => draft as Record<string, any>;

const SUCCESS = [['atLeast', 'не меньше порога'], ['over', 'строго больше'], ['notOver', 'не больше порога'], ['under', 'строго меньше'], ['equals', 'ровно порог']] as const;

export function CheckBody({ step, roll, context, edit, system, onUnpair }: {
  step: any;
  roll: any | null;
  context: SlotContext;
  edit: EditFn;
  system: System;
  onUnpair?: () => void;
}) {
  const at = roll ? 1 : 0;
  const tables = rowTables(system);

  const fields: RowField[] = [
    {
      key: 'formula', label: 'Проверка', width: 420,
      hint: roll
        ? 'кинуть(кость[, сколько костей]) + прибавка, знак и порог. Поля — через лист: @цель.кд. Кто бросает, против кого и метки — строкой ниже'
        : 'Число, знак и порог: @носитель.ки >= 1',
      node: <CheckFormula step={step} roll={roll} context={context} edit={edit} {...(onUnpair ? { onUnpair } : {})} />,
    },
  ];
  const more: RowField[] = [
    {
      key: 'continueOn', label: 'Шаги ниже идут при', width: 160,
      hint: '«всегда» — дальше решают условия на шагах',
      node: (
        <Select
          value={String(step.continueOn ?? 'success')}
          options={[['success', 'успехе'], ['fail', 'провале'], ['always', 'всегда']] as const}
          onChange={next => edit(at, draft => { if (next === 'success') delete loose(draft).continueOn; else loose(draft).continueOn = next; })}
        />
      ),
    },
    ...(tables.length ? [{
      key: 'degrees', label: 'Степени успеха', width: 170,
      hint: 'Вместо «да/нет» исход читается ступенями по таблице: «провал / успех с ценой / полный успех»',
      node: (
        <Select
          value={String(step.degrees?.table ?? '')}
          options={[['', '— нет, да/нет —'], ...tables.map(([key, t]) => [key, t.label || key] as const)] as never}
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
    {
      key: 'note', label: 'Что сказать при остановке', width: 220,
      hint: 'Текст в журнал, когда проверка оборвала цепочку: «не хватает ячейки». Начните с @ — будет формула.',
      node: <NoteField value={step.note} onChange={next => edit(at, draft => { if (next) loose(draft).note = next; else delete loose(draft).note; })} />,
    },
  ];
  const forced = (key: 'succeedOn' | 'failOn') => (
    <FormulaField
      value={String((step[key] as { expr?: unknown } | undefined)?.expr ?? '')}
      system={system}
      where={`проверка · ${key === 'succeedOn' ? 'всегда успех' : 'всегда провал'}`}
      placeholder={key === 'succeedOn' ? 'например: 20' : 'например: 1'}
      onCommit={text => edit(at, draft => { const d = loose(draft); if (text.trim()) d[key] = { expr: text.trim() }; else delete d[key]; })}
    />
  );
  return (
    <>
      <FieldRow id={roll ? 'check-roll' : 'check-plain'} fields={fields} />
      {roll ? <RollLine roll={roll} context={context} system={system} keep onRoll={change => edit(0, draft => change(loose(draft)))} /> : null}
      <Fold title="ещё" summary={moreSummary(step, Boolean(roll || readsRoll(step, context)))}>
        <FieldRow id="check-more" fields={more} />
        {roll || readsRoll(step, context) ? (
          <div className="row">
            <Field label="Всегда успех, если на кости не меньше" hint="Натуральная 20: что бы ни прибавили, это успех.">{forced('succeedOn')}</Field>
            <Field label="Всегда провал, если на кости не больше" hint="Натуральная 1: что бы ни прибавили, это провал.">{forced('failOn')}</Field>
          </div>
        ) : null}
      </Fold>
    </>
  );
}

const CONTINUE_WORDS: Record<string, string> = { success: 'при провале шаги ниже не идут', fail: 'шаги ниже идут только при провале', always: 'шаги ниже идут всегда' };

const moreSummary = (step: any, rolled: boolean): string => [
  CONTINUE_WORDS[String(step.continueOn ?? 'success')] ?? '',
  step.degrees?.table ? 'исход ступенями' : '',
  step.note ? 'есть запись в журнал' : '',
  rolled && (step.succeedOn || step.failOn) ? 'есть «всегда успех / провал»' : '',
].filter(Boolean).join(' · ');

const readsRoll = (step: any, context: SlotContext): boolean => {
  const name = /^@([\p{L}\p{N}_]+)$/u.exec(String(step.value?.expr ?? '').trim())?.[1];
  return Boolean(name && context.earlier.some(e => e.id === name && e.type === 'roll'));
};

const setSuccessWhen = (d: Record<string, unknown>, op: string): void => {
  if (op === 'atLeast') delete d.successWhen; else d.successWhen = op;
};

const quoted = (text: string): string => (text.includes('"') ? `'${text}'` : `"${text}"`);

function NoteField({ value, onChange }: { value: unknown; onChange: (next: { expr: string } | null) => void }) {
  const expr = value && typeof value === 'object' ? String((value as { expr?: unknown }).expr ?? '') : '';
  const literal = /^(["'])(.*)\1$/su.exec(expr.trim());
  const shown = literal ? literal[2]! : expr;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (!text) { onChange(null); return; }
    if (text.startsWith('@') || text.includes('(')) { onChange({ expr: text }); return; }
    if (text.includes('"') && text.includes("'")) { onChange({ expr: quoted(text.replace(/"/g, '«').replace(/'/g, '»')) }); return; }
    onChange({ expr: quoted(text) });
  };
  return <Input value={draft ?? shown} placeholder="например: не хватает ячейки" onChange={setDraft} onBlur={commit} />;
}

function CheckFormula({ step, roll, context, edit, onUnpair }: { step: any; roll: any | null; context: SlotContext; edit: EditFn; onUnpair?: () => void }) {
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

  return (
    <>
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
      {trouble ? <span className="field__error">{trouble}</span> : null}
    </>
  );
}

export { SUCCESS };
