import type { System } from '@vtt/schema';
import { Select } from '../../../../ui/primitives.tsx';
import { FieldRow } from '../../../../ui/field-row.tsx';
import type { RowField } from '../../../../ui/field-row.tsx';
import { SlotInput } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { RollExprInput } from './roll-expr-input.tsx';

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

const loose = (draft: unknown): Record<string, any> => draft as Record<string, any>;

const dieOptions = (system: System) => Object.entries(system.constants ?? {})
  .filter(([, c]) => (c as { kind?: string }).kind === 'die')
  .map(([key, c]) => [key, (c as { label?: string }).label || key] as const);

export function CheckBody({ step, context, edit, system }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const mode = step.type === 'compare' ? 'plain' : 'roll';
  const opposed = step.versus && typeof step.versus === 'object' && 'roll' in step.versus ? step.versus.roll : null;
  const otherSide = step.side === 'target' ? 'отправителя' : 'получателя';
  const tables = Object.entries(system.tables ?? {});

  const setMode = (next: string) => edit(0, draft => {
    const d = loose(draft);
    if (next === 'roll') {
      draft.type = 'threshold';
      d.roll ??= { die: firstDie(system) ? { constant: firstDie(system) } : undefined, check: null };
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

  const versusFields: RowField[] = opposed ? [
    {
      key: 'otherDie', label: 'Кость второй стороны', width: 150,
      node: (
        <Select
          value={String(opposed.die?.constant ?? '')}
          options={dieOptions(system) as never}
          onChange={next => edit(0, draft => { loose(draft).versus.roll.die = { constant: next }; })}
        />
      ),
    },
    {
      key: 'otherBonus', label: 'Прибавка второй стороны', width: 200,
      node: (
        <SlotInput
          where="проверка · прибавка второй стороны"
          value={opposed.bonus} context={context} allow={['expr', 'const', 'param']}
          onChange={next => edit(0, draft => {
            const roll = loose(draft).versus.roll;
            if (next) roll.bonus = next; else delete roll.bonus;
          })}
        />
      ),
    },
    {
      key: 'otherCheck', label: 'Какой бросок у второй стороны', width: 190,
      hint: 'Вид броска из словаря — чтобы её правила («преимущество на защиту») знали, куда целиться',
      node: (
        <Select
          value={String(opposed.check ?? '')}
          options={[['', '— просто бросок —'], ...(system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
          onChange={next => edit(0, draft => { loose(draft).versus.roll.check = next || null; })}
        />
      ),
    },
  ] : [
    {
      key: 'versus', label: 'Число', width: 190,
      node: (
        <SlotInput
          where="проверка · число"
          value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']} side="target"
          onChange={next => edit(0, draft => { loose(draft).versus = next ?? undefined; })}
        />
      ),
    },
  ];

  return (
    <FieldRow
      id="check-roll"
      fields={[
        modeField,
        { key: 'roll', label: 'Бросок', width: 220, node: <RollExprInput step={step} context={context} edit={edit} /> },
        {
          key: 'successWhen', label: 'Успех', width: 80,
          node: (
            <Select
              value={String(step.successWhen ?? 'atLeast')}
              options={[['atLeast', '≥'], ['notOver', '≤'], ['over', '>'], ['under', '<'], ['equals', '=']] as const}
              onChange={next => edit(0, draft => { loose(draft).successWhen = next; })}
            />
          ),
        },
        {
          key: 'against', label: 'Против', width: 150,
          node: (
            <Select
              value={opposed ? 'roll' : 'value'}
              options={[['value', 'числа'], ['roll', `встречного броска ${otherSide}`]] as const}
              onChange={next => edit(0, draft => {
                const d = loose(draft);
                d.versus = next === 'roll'
                  ? { roll: { die: firstDie(system) ? { constant: firstDie(system) } : undefined, check: null } }
                  : undefined;
              })}
            />
          ),
        },
        ...versusFields,
        {
          key: 'side', label: 'Кто бросает', width: 140,
          node: (
            <Select
              value={String(step.side ?? 'source')}
              options={[['source', 'отправитель'], ['target', 'получатель']] as const}
              onChange={next => edit(0, draft => { const d = loose(draft); if (next === 'target') d.side = 'target'; else delete d.side; })}
            />
          ),
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
        {
          key: 'check', label: 'Какой это бросок', width: 180,
          hint: 'Вид броска из словаря — чтобы правило «преимущество на атаки» знало, куда целиться',
          node: (
            <Select
              value={String(step.roll?.check ?? '')}
              options={[['', '— просто бросок —'],
                ...(context.system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
              onChange={next => edit(0, draft => { (loose(draft).roll ??= {}).check = next || null; })}
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
