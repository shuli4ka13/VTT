import type { ReactNode } from 'react';
import { Button, Input, NumInput } from '../../ui/primitives.tsx';
import type { Control, StoredValue, FieldOption } from '@vtt/schema';

export interface ControlProps {
  value: StoredValue;
  min?: number;
  max?: number;
  label: string;
  options?: FieldOption[];
  onChange: (value: StoredValue) => void;
}

export const CONTROLS: Record<Control, string> = {
  stepper: 'Кнопки минус и плюс',
  pips: 'Кружки-отметки',
  toggle: 'Да или нет',
  ring: 'Кружок владения',
  bar: 'Полоса запаса',
  die: 'Кость',
  choice: 'Выбор из вариантов',
};

const clamp = (value: number, min?: number, max?: number): number => {
  const low = typeof min === 'number' ? Math.max(min, value) : value;
  return typeof max === 'number' ? Math.min(max, low) : low;
};

export function Stepper({ value, min, max, onChange }: ControlProps) {
  const now = Number(value ?? 0);
  return (
    <div className="inline inline--tight control control--stepper">
      <Button size="sm" title="минус" disabled={min !== undefined && now <= min}
        onClick={() => onChange(clamp(now - 1, min, max))}>−</Button>
      <NumInput value={now} onCommit={next => onChange(clamp(next, min, max))} />
      <Button size="sm" title="плюс" disabled={max !== undefined && now >= max}
        onClick={() => onChange(clamp(now + 1, min, max))}>+</Button>
    </div>
  );
}

export function Pips({ value, min = 0, max = 3, label, onChange }: ControlProps) {
  const now = Number(value ?? 0);
  const slots = Math.max(1, Math.min(12, max));
  return (
    <div className="inline inline--tight control control--pips" role="group" aria-label={label}>
      {Array.from({ length: slots }, (_, at) => at + 1).map(step => (
        <button
          key={step}
          type="button"
          className={`pip${step <= now ? ' pip--on' : ''}`}
          aria-pressed={step <= now}
          title={`${step} из ${slots}`}
          onClick={() => onChange(clamp(step === now ? step - 1 : step, min, max))}
        >
          {step <= now ? '●' : '○'}
        </button>
      ))}
      <span className="faint">{now} из {slots}</span>
    </div>
  );
}

export function Toggle({ value, label, onChange }: ControlProps) {
  const on = Boolean(value);
  return (
    <Button variant={on ? 'primary' : undefined} title={label} onClick={() => onChange(!on)}>
      {on ? 'да' : 'нет'}
    </Button>
  );
}

const STEPS: FieldOption[] = [
  { value: 0, label: 'нет' }, { value: 1, label: 'владение' }, { value: 2, label: 'мастерство' },
];

export function Ring({ value, label, options, onChange }: ControlProps) {
  const steps = options?.length ? options : STEPS;
  const at = Math.max(0, steps.findIndex(step => step.value === (value ?? 0)));
  const next = steps[(at + 1) % steps.length]!;
  const marks = ['○', '◑', '●', '◉'];
  return (
    <Button
      title={`${label}: ${steps[at]?.label ?? ''}. Клик — следующая ступень.`}
      variant={at ? 'primary' : undefined}
      onClick={() => onChange(next.value)}
    >
      {marks[Math.min(at, marks.length - 1)]} {steps[at]?.label ?? ''}
    </Button>
  );
}

export function Choice({ value, label, options, onChange }: ControlProps) {
  const list = options ?? [];
  if (!list.length) return <span className="faint">вариантов ещё нет</span>;
  return (
    <div className="inline inline--tight control control--choice" role="radiogroup" aria-label={label}>
      {list.map(option => (
        <Button
          key={String(option.value)}
          size="sm"
          variant={option.value === value ? 'primary' : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function Bar({ value, min = 0, max, label, onChange }: ControlProps) {
  const now = Number(value ?? 0);
  const top = typeof max === 'number' && max > 0 ? max : Math.max(now, 1);
  const share = Math.max(0, Math.min(100, Math.round((now / top) * 100)));
  return (
    <div className="control control--bar">
      <div className="bar" title={`${label}: ${now} из ${top}`}>
        <div className="bar__fill" style={{ width: `${share}%` }} />
        <span className="bar__text">{now} / {top}</span>
      </div>
      <div className="inline inline--tight">
        <Button size="sm" title="минус" onClick={() => onChange(clamp(now - 1, min, max))}>−</Button>
        <NumInput value={now} onCommit={next => onChange(clamp(next, min, max))} />
        <Button size="sm" title="плюс" onClick={() => onChange(clamp(now + 1, min, max))}>+</Button>
      </div>
    </div>
  );
}

export function Die({ value, onChange }: ControlProps) {
  return <Input value={String(value ?? '')} placeholder="1к6" mono onChange={next => onChange(next)} />;
}

export const CONTROL_VIEWS: Record<Control, (props: ControlProps) => ReactNode> = {
  stepper: Stepper,
  pips: Pips,
  toggle: Toggle,
  ring: Ring,
  bar: Bar,
  die: Die,
  choice: Choice,
};
