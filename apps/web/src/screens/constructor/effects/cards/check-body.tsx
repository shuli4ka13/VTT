import { useMemo, useState } from 'react';
import type { System } from '@vtt/schema';
import { Select } from '../../../../ui/primitives.tsx';
import { FieldRow } from '../../../../ui/field-row.tsx';
import type { RowField } from '../../../../ui/field-row.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { namesOf, refForName, inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { badFormula } from '../../roll-expr.ts';
import { parseCheck, formatCheck } from '../../check-expr.ts';
import { tagWords } from '@vtt/engine/engine/roll-tags';
import { rowTables } from '@vtt/engine/model/tables';

const loose = (draft: unknown): Record<string, any> => draft as Record<string, any>;

const lone = (ref: unknown): string => /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr?: unknown } | undefined)?.expr ?? ''))?.[1] ?? '';

const SUCCESS = [['atLeast', 'не меньше порога'], ['over', 'строго больше'], ['notOver', 'не больше порога'], ['under', 'строго меньше'], ['equals', 'ровно порог']] as const;

export function CheckBody({ step, roll, context, edit, system }: {
  step: any;
  roll: any | null;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const at = roll ? 1 : 0;
  const tables = rowTables(system);
  const sheets = [...(context.sheets ?? new Map<string, string>())];
  const sheetOptions = sheets.map(([name, label]) => [name, `«${label}»`] as const);

  const fields: RowField[] = [
    {
      key: 'formula', label: 'Проверка', width: 420,
      hint: roll
        ? 'кинуть(кость, метки) + прибавка, знак и порог. Метки — строки таблиц («атака», «ловкость»); по ним правки находят бросок. Поля — через лист: @цель.кд'
        : 'Число, знак и порог: @носитель.ки >= 1',
      node: <CheckFormula step={step} roll={roll} context={context} edit={edit} />,
    },
    ...(roll ? [{
      key: 'by', label: 'Бросает', width: 170,
      hint: 'Чей это бросок: на него действуют правки броска и «кости выпали» этого листа.',
      node: (
        <Select<string>
          value={lone(roll.by)}
          options={[['', '— какой лист —'], ...sheetOptions]}
          onChange={next => edit(0, draft => { if (next) loose(draft).by = { expr: `@${next}` }; else delete loose(draft).by; })}
        />
      ),
    }, {
      key: 'against', label: 'Против кого', width: 170,
      hint: 'Для правок «по носителю»: «Ослеплён» даёт преимущество тем, кто бросает против него.',
      node: (
        <Select<string>
          value={lone(roll.against)}
          options={[['', 'ни против кого'], ...sheetOptions]}
          onChange={next => edit(0, draft => { if (next) loose(draft).against = { expr: `@${next}` }; else delete loose(draft).against; })}
        />
      ),
    }] : []),
    {
      key: 'continueOn', label: 'Дальше при', width: 140,
      hint: '«всегда» — дальше решают условия на шагах',
      node: (
        <Select
          value={String(step.continueOn ?? 'success')}
          options={[['success', 'успехе'], ['fail', 'провале'], ['always', 'всегда']] as const}
          onChange={next => edit(at, draft => { loose(draft).continueOn = next; })}
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
            if (next) d.degrees = { table: next, of: d.degrees?.of ?? 'total' }; else delete d.degrees;
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
          onChange={next => edit(at, draft => { loose(draft).degrees.of = next; })}
        />
      ),
    }] : []),
  ];
  return <FieldRow id={roll ? 'check-roll' : 'check-plain'} fields={fields} />;
}

function CheckFormula({ step, roll, context, edit }: { step: any; roll: any | null; context: SlotContext; edit: EditFn }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const names = useMemo(() => {
    const out = namesOf(context);
    for (const word of tagWords(context.system).keys()) out.set(word, word);
    return out;
  }, [context]);

  const drop = () => { setDraft(null); setTrouble(null); };
  const commit = (text: string) => {
    if (!roll) {
      const match = /^(.*?)(>=|<=|==|>|<)(.*)$/su.exec(text.trim());
      if (!match) { setTrouble('проверка — это сравнение: «@носитель.ки >= 1»'); return; }
      const ops: Record<string, string> = { '>=': 'atLeast', '<=': 'notOver', '==': 'equals', '>': 'over', '<': 'under' };
      edit(0, target => {
        const d = loose(target);
        d.value = { expr: match[1]!.trim() };
        d.versus = { expr: match[3]!.trim() };
        d.successWhen = ops[match[2]!];
      });
      drop();
      return;
    }
    const parsed = parseCheck(text, context.system, name => refForName(context, name));
    if ('error' in parsed) { setTrouble(parsed.error); return; }
    const bad = badFormula(parsed.roll.bonus) ?? badFormula(parsed.versus);
    if (bad) { setTrouble(bad); return; }
    edit(0, target => {
      const d = loose(target);
      d.die = parsed.roll.die;
      if (parsed.roll.count) d.count = parsed.roll.count; else delete d.count;
      if (parsed.roll.bonus) d.bonus = parsed.roll.bonus; else delete d.bonus;
      if (parsed.roll.tags.length) d.tags = parsed.roll.tags; else delete d.tags;
    });
    edit(1, target => {
      const d = loose(target);
      d.successWhen = parsed.successWhen;
      d.versus = parsed.versus;
    });
    drop();
  };

  return (
    <>
      <FormulaField
        value={draft ?? formatCheck(roll, step)}
        system={context.system}
        where="проверка"
        extraNames={names}
        {...(context.sheets ? { sheets: context.sheets } : {})}
        badges={inputBadges(context)}
        invalid={Boolean(trouble)}
        placeholder={roll ? 'кинуть(@кость, @метка) + прибавка >= @цель.кд' : '@носитель.ки >= 1'}
        onChange={next => { setTrouble(null); setDraft(next); }}
        onCommit={commit}
        onCancel={drop}
      />
      {trouble ? <span className="field__error">{trouble}</span> : null}
    </>
  );
}

export { SUCCESS };
