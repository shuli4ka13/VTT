import type { ReactNode } from 'react';
import type { System, Param, SlotRef } from '@vtt/schema';
import { Field, Select } from '../../ui/primitives.tsx';
import { SlotInput, type SlotOption } from './slot-input.tsx';
import type { SlotContext, SlotKind } from './slots.tsx';
import { listOf } from '@vtt/engine/model/lists';
import { paramsOf } from '@vtt/engine/model/inherit';

export interface CallInput {
  param: Param;
  value: unknown;
  fromProp: boolean;
}

function rowsAsOptions(system: System, need: Param): SlotOption[] {
  if (need.kind !== 'choice' || !need.from) return [];
  const group = `«${system.tables?.[need.from]?.label || need.from}»`;
  return (listOf(system, need.from) ?? []).map(row => ({ group, label: row.label, ref: { expr: JSON.stringify(row.value) } as SlotRef }));
}

function status(input: CallInput): { text: string; bad: boolean } {
  if (input.value !== undefined && input.value !== null) return { text: '', bad: false };
  if (input.fromProp) return { text: `берётся из свойства «${input.param.label ?? input.param.key}»`, bad: false };
  if (input.param.ask) return { text: input.param.ask.by === 'gm' ? 'спросят ведущего' : 'спросят игрока', bad: false };
  if (input.param.optional) return { text: 'можно не заполнять', bad: false };
  return { text: 'не заполнено', bad: true };
}

export function CallEditor({ system, effect, effects, onEffect, args, fromProps, onArg, context, where, allow, extraFor, headAction, children }: {
  system: System;
  effect: string;
  effects: [string, { label?: string }][];
  onEffect: (id: string) => void;
  args: Record<string, unknown> | undefined;
  fromProps?: ReadonlySet<string>;
  onArg: (key: string, next: SlotRef | null) => void;
  context: SlotContext;
  where: string;
  allow?: SlotKind[];
  extraFor?: (param: Param) => SlotOption[];
  headAction?: ReactNode;
  children?: ReactNode;
}) {
  const called = system.effects[effect];
  const params = called ? paramsOf(system, called) : [];
  const inputs: CallInput[] = params.map(param => ({
    param, value: args?.[param.key], fromProp: Boolean(fromProps?.has(param.key)),
  }));

  return (
    <div className="stack stack--tight">
      <Field label="Какой эффект" needed={!effect}>
        <Select
          value={effect}
          options={[['', '— какой эффект —'], ...effects.map(([id, e]) => [id, e.label || id] as const)] as never}
          onChange={onEffect}
        />
      </Field>
      {children}
      {effect ? (
        <div className="stack stack--tight call-args">
          <div className="call-args__head">
            <span className="field__label">Что отправляем</span>
            {headAction}
          </div>
          {inputs.length ? null : <span className="faint">«{called?.label || effect}» ничего не принимает.</span>}
          {inputs.map(input => {
            const shown = status(input);
            return (
              <div className="pair" key={input.param.key}>
                <span className="call-args__name">{input.param.label ?? input.param.key}</span>
                <SlotInput
                  where={`${where} · ${input.param.label ?? input.param.key}`}
                  value={input.value as never}
                  context={context}
                  {...(allow ? { allow } : {})}
                  extraOptions={[...(extraFor?.(input.param) ?? []), ...rowsAsOptions(system, input.param)]}
                  onChange={next => onArg(input.param.key, next)}
                />
                <span className={shown.bad ? 'need' : 'faint'}>{shown.text}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
