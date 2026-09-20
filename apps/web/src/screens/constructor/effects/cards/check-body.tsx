import type { System } from '@vtt/schema';
import { Field, Fold, Segmented, Select } from '../../../../ui/primitives.tsx';
import { SlotInput } from '../../slot-input.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';
import { RollExprInput } from './roll-expr-input.tsx';

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

export function CheckBody({ step, context, edit, system }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const mode = step.type === 'compare' ? 'plain' : 'roll';
  const tables = Object.entries(system.tables ?? {});

  return (
    <>
      {}
      <Segmented
        value={mode}
        options={[{ key: 'roll', label: 'броском' }, { key: 'plain', label: 'без броска' }]}
        onChange={next => edit(0, draft => {
          const d = draft as any;
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
              onChange={next => edit(0, draft => { (draft as any).successWhen = next; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']} side="target"
              onChange={next => edit(0, draft => { (draft as any).versus = next ?? undefined; })}
            />
          </Field>
        </div>
      ) : (
        <div className="row">
          <Field label="что сравниваем">
            <SlotInput
              value={step.value} context={context} allow={['ref']}
              onChange={next => edit(0, draft => { (draft as any).value = next ?? undefined; })}
            />
          </Field>
          <Field label="обрыв, если">
            <Select
              value={String(step.breakIf ?? 'less')}
              options={[['less', '< меньше правого'], ['atMost', '≤ не больше правого'],
                ['never', 'обрыва нет — разница идёт дальше']] as const}
              onChange={next => edit(0, draft => { (draft as any).breakIf = next; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']} side="target"
              onChange={next => edit(0, draft => { (draft as any).versus = next ?? undefined; })}
            />
          </Field>
        </div>
      )}

      {mode === 'roll' ? (
        <Fold title="Тонкости">
          <Field label="кто бросает">
            <Select
              value={String(step.side ?? 'source')}
              options={[['source', 'отправитель'], ['target', 'цель']] as const}
              onChange={next => edit(0, draft => {
                const d = draft as any;
                if (next === 'target') d.side = 'target'; else delete d.side;
              })}
            />
          </Field>
          <Field label="дальше при">
            <Select
              value={String(step.continueOn ?? 'success')}
              options={[['success', 'успехе'], ['fail', 'провале'],
                ['always', 'всегда — дальше решают условия на шагах']] as const}
              onChange={next => edit(0, draft => { (draft as any).continueOn = next; })}
            />
          </Field>
          {}
          <Field label="какой это бросок" hint="Вид броска из словаря — чтобы правило «преимущество на атаки» знало, куда целиться. Правки «на любой бросок» этот бросок поймает в любом случае.">
            <Select
              value={String(step.roll?.check ?? '')}
              options={[['', '— просто бросок: только общие правки —'],
                ...(context.system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
              onChange={next => edit(0, draft => { ((draft as any).roll ??= {}).check = next || null; })}
            />
          </Field>
          {}
          <Field
            label="степени успеха"
            hint={tables.length
              ? 'Вместо «да/нет» исход читается ступенями по таблице: «провал / успех с ценой / полный успех».'
              : 'Сначала заведите таблицу ступеней в «Словарях».'}
          >
            <Select
              value={String(step.degrees?.table ?? '')}
              options={[['', '— не считать, просто да/нет —'],
                ...tables.map(([key, t]) => [key, t.label || key] as const)] as never}
              onChange={next => edit(0, draft => {
                const d = draft as any;
                if (!next) delete d.degrees;
                else d.degrees = { table: next, of: d.degrees?.of ?? 'total' };
              })}
            />
          </Field>
          {step.degrees?.table ? (
            <Field label="ступень по">
              <Select
                value={String(step.degrees.of ?? 'total')}
                options={[['total', 'итогу броска'], ['margin', 'запасу против порога']] as const}
                onChange={next => edit(0, draft => { (draft as any).degrees.of = next; })}
              />
            </Field>
          ) : null}
        </Fold>
      ) : null}
    </>
  );
}
