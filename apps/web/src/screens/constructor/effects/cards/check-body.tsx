import type { System } from '@vtt/schema';
import { Field, Segmented, Select } from '../../../../ui/primitives.tsx';
import { Extras } from './extras.tsx';
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

  return (
    <>
      {}
      <Segmented
        value={mode}
        options={[{ key: 'roll', label: 'броском' }, { key: 'plain', label: 'без броска' }]}
        onChange={next => edit(0, draft => {
          const d = loose(draft);
          if (next === 'roll') {
            draft.type = 'threshold';
            d.roll ??= { die: firstDie(system) ? { constant: firstDie(system) } : undefined, check: null };
            d.successWhen ??= 'atLeast'; d.continueOn ??= 'success';
          } else {
            draft.type = 'compare';
            d.breakIf ??= 'less';
          }
        })}
      />

      {}
      {mode === 'roll' ? (
        <div className="row">
          <RollExprInput step={step} context={context} edit={edit} />
          <Field label="успех">
            <Select
              value={String(step.successWhen ?? 'atLeast')}
              options={[['atLeast', '≥'], ['notOver', '≤'],
                ['over', '>'], ['under', '<'], ['equals', '=']] as const}
              onChange={next => edit(0, draft => { loose(draft).successWhen = next; })}
            />
          </Field>
          <Field label="против">
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
          </Field>
          {opposed ? (
            <>
              <Field label="кость второй стороны">
                <Select
                  value={String(opposed.die?.constant ?? '')}
                  options={dieOptions(system) as never}
                  onChange={next => edit(0, draft => { loose(draft).versus.roll.die = { constant: next }; })}
                />
              </Field>
              <Field label="прибавка второй стороны">
                <SlotInput
                  value={opposed.bonus} context={context} allow={['expr', 'const', 'param']}
                  onChange={next => edit(0, draft => {
                    const roll = loose(draft).versus.roll;
                    if (next) roll.bonus = next; else delete roll.bonus;
                  })}
                />
              </Field>
              <Field label="какой это бросок у второй стороны" hint="Вид броска из словаря — чтобы её правила («преимущество на защиту») знали, куда целиться.">
                <Select
                  value={String(opposed.check ?? '')}
                  options={[['', '— просто бросок —'], ...(system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
                  onChange={next => edit(0, draft => { loose(draft).versus.roll.check = next || null; })}
                />
              </Field>
            </>
          ) : (
            <Field label="число">
              <SlotInput
                value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']} side="target"
                onChange={next => edit(0, draft => { loose(draft).versus = next ?? undefined; })}
              />
            </Field>
          )}
        </div>
      ) : (
        <div className="row">
          <Field label="что сравниваем">
            <SlotInput
              value={step.value} context={context} allow={['ref']}
              onChange={next => edit(0, draft => { loose(draft).value = next ?? undefined; })}
            />
          </Field>
          <Field label="обрыв, если">
            <Select
              value={String(step.breakIf ?? 'less')}
              options={[['less', '< меньше правого'], ['atMost', '≤ не больше правого'],
                ['never', 'обрыва нет — разница идёт дальше']] as const}
              onChange={next => edit(0, draft => { loose(draft).breakIf = next; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']} side="target"
              onChange={next => edit(0, draft => { loose(draft).versus = next ?? undefined; })}
            />
          </Field>
        </div>
      )}

      {mode === 'roll' ? (
        <Extras
          items={[
            {
              key: 'side', label: 'кто бросает', on: step.side !== undefined,
              add: () => edit(0, draft => { loose(draft).side = 'target'; }),
              drop: () => edit(0, draft => { delete loose(draft).side; }),
              node: (
                <Field label="кто бросает">
                  <Select
                    value={String(step.side ?? 'source')}
                    options={[['source', 'отправитель'], ['target', 'получатель']] as const}
                    onChange={next => edit(0, draft => {
                      const d = loose(draft);
                      if (next === 'target') d.side = 'target'; else delete d.side;
                    })}
                  />
                </Field>
              ),
            },
            {
              key: 'continueOn', label: 'дальше при', on: (step.continueOn ?? 'success') !== 'success',
              add: () => edit(0, draft => { loose(draft).continueOn = 'fail'; }),
              drop: () => edit(0, draft => { loose(draft).continueOn = 'success'; }),
              node: (
                <Field label="дальше при">
                  <Select
                    value={String(step.continueOn ?? 'success')}
                    options={[['success', 'успехе'], ['fail', 'провале'],
                      ['always', 'всегда — дальше решают условия на шагах']] as const}
                    onChange={next => edit(0, draft => { loose(draft).continueOn = next; })}
                  />
                </Field>
              ),
            },
            {
              key: 'check', label: 'какой это бросок', on: !!step.roll?.check,
              add: () => edit(0, draft => {
                const first = (system.rolls ?? [])[0]?.tag;
                if (first) (loose(draft).roll ??= {}).check = first;
              }),
              drop: () => edit(0, draft => { (loose(draft).roll ??= {}).check = null; }),
              node: (
                <Field label="какой это бросок" hint="Вид броска из словаря — чтобы правило «преимущество на атаки» знало, куда целиться.">
                  <Select
                    value={String(step.roll?.check ?? '')}
                    options={[['', '— просто бросок: только общие правки —'],
                      ...(context.system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
                    onChange={next => edit(0, draft => { (loose(draft).roll ??= {}).check = next || null; })}
                  />
                </Field>
              ),
            },
            ...(tables.length ? [{
              key: 'degrees', label: 'степени успеха', on: !!step.degrees?.table,
              add: () => edit(0, draft => { loose(draft).degrees = { table: tables[0]![0], of: 'total' }; }),
              drop: () => edit(0, draft => { delete loose(draft).degrees; }),
              node: (
                <>
                  <Field label="степени успеха" hint="Вместо «да/нет» исход читается ступенями по таблице: «провал / успех с ценой / полный успех».">
                    <Select
                      value={String(step.degrees?.table ?? '')}
                      options={tables.map(([key, t]) => [key, t.label || key] as const) as never}
                      onChange={next => edit(0, draft => {
                        const d = loose(draft);
                        d.degrees = { table: next, of: d.degrees?.of ?? 'total' };
                      })}
                    />
                  </Field>
                  {step.degrees?.table ? (
                    <Field label="ступень по">
                      <Select
                        value={String(step.degrees.of ?? 'total')}
                        options={[['total', 'итогу броска'], ['margin', 'запасу против порога']] as const}
                        onChange={next => edit(0, draft => { loose(draft).degrees.of = next; })}
                      />
                    </Field>
                  ) : null}
                </>
              ),
            }] : []),
          ]}
        />
      ) : null}

    </>
  );
}
