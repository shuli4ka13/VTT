import type { System, Effect, Param } from '@vtt/schema';
import { Select } from '../../ui/primitives.tsx';

const FROM_INPUT = ':вход:';
const NEW_INPUT = ':новый';

export const effectNameOf = (value: unknown): string => (typeof value === 'string' ? value : '');

const inputOf = (value: unknown): string => {
  const expr = value && typeof value === 'object' ? String((value as { expr?: unknown }).expr ?? '') : '';
  return /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(expr)?.[1] ?? '';
};

export function EffectPick({ value, onChange, system, only, inputs = [], onCreateParam, empty = '— какой эффект —' }: {
  value: unknown;
  onChange: (next: string | { expr: string } | null) => void;
  system: System;
  only?: (effect: Effect) => boolean;
  inputs?: readonly Param[];
  onCreateParam?: () => string;
  empty?: string;
}) {
  const named = effectNameOf(value);
  const input = inputOf(value);
  const effects = Object.entries(system.effects ?? {}).filter(([, effect]) => !only || only(effect));
  const fromInputs = inputs.filter(param => param.kind === 'effect');
  return (
    <Select<string>
      value={input ? `${FROM_INPUT}${input}` : named}
      options={[
        ['', empty],
        ...effects.map(([id, effect]) => [id, `«${effect.label ?? id}»`] as const),
        ...fromInputs.map(param => [`${FROM_INPUT}${param.key}`, `из входа «${param.label ?? param.key}»`] as const),
        ...(onCreateParam ? [[NEW_INPUT, 'из нового входа…'] as const] : []),
      ]}
      onChange={next => {
        if (!next) { onChange(null); return; }
        if (next === NEW_INPUT && onCreateParam) { onChange({ expr: `@${onCreateParam()}` }); return; }
        if (next.startsWith(FROM_INPUT)) { onChange({ expr: `@${next.slice(FROM_INPUT.length)}` }); return; }
        onChange(next);
      }}
    />
  );
}
