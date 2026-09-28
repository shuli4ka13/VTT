import { useMemo, useState } from 'react';
import type { System } from '@vtt/schema';
import { Select } from '../../../../ui/primitives.tsx';
import { FieldRow } from '../../../../ui/field-row.tsx';
import type { RowField } from '../../../../ui/field-row.tsx';
import { SlotInput } from '../../slot-input.tsx';
import { FormulaField } from '../../../../ui/formula-field.tsx';
import { namesOf, refForName, inputBadges } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { badFormula } from '../../roll-expr.ts';
import { parseCheck, formatCheck } from '../../check-expr.ts';
import { tagWords } from '@vtt/engine/engine/roll-tags';

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

const loose = (draft: unknown): Record<string, any> => draft as Record<string, any>;


export function CheckBody({ step, context, edit, system }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const mode = step.type === 'compare' ? 'plain' : 'roll';
  const tables = Object.entries(system.tables ?? {});

  const setMode = (next: string) => edit(0, draft => {
    const d = loose(draft);
    if (next === 'roll') {
      draft.type = 'threshold';
      d.roll ??= { die: firstDie(system) ? { constant: firstDie(system) } : undefined };
      d.successWhen ??= 'atLeast'; d.continueOn ??= 'success';
    } else {
      draft.type = 'compare';
      d.breakIf ??= 'less';
    }
  });

  const modeField: RowField = {
    key: 'mode', label: 'Проверка', width: 130,
    node: <Select value={mode} options={[['roll', 'броском'], ['plain', 'без броска']] as const} onChange={setMode} />,
  };

  if (mode === 'plain') {
    return (
      <FieldRow
        id="check-plain"
        fields={[
          modeField,
          {
            key: 'value', label: 'Что сравниваем', width: 220,
            node: (
              <SlotInput
                where="сравнение · что сравниваем"
                value={step.value} context={context} allow={['ref']}
                onChange={next => edit(0, draft => { loose(draft).value = next ?? undefined; })}
              />
            ),
          },
          {
            key: 'breakIf', label: 'Обрыв, если', width: 200,
            node: (
              <Select
                value={String(step.breakIf ?? 'less')}
                options={[['less', '< меньше правого'], ['atMost', '≤ не больше правого'],
                  ['never', 'обрыва нет — разница идёт дальше']] as const}
                onChange={next => edit(0, draft => { loose(draft).breakIf = next; })}
              />
            ),
          },
          {
            key: 'versus', label: 'Против', width: 220,
            node: (
              <SlotInput
                where="проверка · против"
                value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']} side="target"
                onChange={next => edit(0, draft => { loose(draft).versus = next ?? undefined; })}
              />
            ),
          },
        ]}
      />
    );
  }

  return (
    <FieldRow
      id="check-roll"
      fields={[
        modeField,
        {
          key: 'formula', label: 'Формула', width: 420,
          hint: 'кинуть(кость, метки) + прибавка, знак и с чем сравнить. Метки — строки таблиц («атака», «ловкость») или вход; по ним правки находят бросок. Кость с @получатель — бросает получатель; справа можно встречное кинуть(…)',
          node: <CheckFormula step={step} context={context} edit={edit} />,
        },
        {
          key: 'continueOn', label: 'Дальше при', width: 140,
          hint: '«всегда» — дальше решают условия на шагах',
          node: (
            <Select
              value={String(step.continueOn ?? 'success')}
              options={[['success', 'успехе'], ['fail', 'провале'], ['always', 'всегда']] as const}
              onChange={next => edit(0, draft => { loose(draft).continueOn = next; })}
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
              onChange={next => edit(0, draft => {
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
              options={[['total', 'итогу броска'], ['margin', 'запасу против порога']] as const}
              onChange={next => edit(0, draft => { loose(draft).degrees.of = next; })}
            />
          ),
        }] : []),
      ]}
    />
  );
}

function CheckFormula({ step, context, edit }: { step: any; context: SlotContext; edit: EditFn }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const names = useMemo(() => {
    const out = namesOf(context);
    for (const word of tagWords(context.system).keys()) out.set(word, word);
    return out;
  }, [context]);

  const drop = () => { setDraft(null); setTrouble(null); };
  const commit = (text: string) => {
    const parsed = parseCheck(text, context.system, name => refForName(context, name));
    if ('error' in parsed) { setTrouble(parsed.error); return; }
    const opposed = (parsed.versus as { roll?: { bonus?: unknown } })?.roll;
    const bad = badFormula(parsed.roll.bonus) ?? badFormula(opposed ? opposed.bonus : parsed.versus);
    if (bad) { setTrouble(bad); return; }
    edit(0, target => {
      const d = loose(target);
      d.roll = {
        die: parsed.roll.die,
        ...(parsed.roll.count ? { count: parsed.roll.count } : {}),
        ...(parsed.roll.bonus ? { bonus: parsed.roll.bonus } : {}),
        ...(parsed.roll.tags.length ? { tags: parsed.roll.tags } : {}),
      };
      if (parsed.side) d.side = parsed.side; else delete d.side;
      d.successWhen = parsed.successWhen;
      d.versus = parsed.versus;
    });
    drop();
  };

  return (
    <>
      <FormulaField
        value={draft ?? formatCheck(step)}
        system={context.system}
        where="проверка"
        extraNames={names}
        owners
        badges={inputBadges(context)}
        invalid={Boolean(trouble)}
        placeholder="кинуть(@кость, @метка) + прибавка >= против"
        onChange={next => { setTrouble(null); setDraft(next); }}
        onCommit={commit}
        onCancel={drop}
      />
      {trouble ? <span className="field__error">{trouble}</span> : null}
    </>
  );
}
