import { Input } from '../../ui/primitives.tsx';

export type Bound = number | { expr: string };

export const boundText = (bound: unknown): string =>
  (bound === undefined || bound === null ? '' : typeof bound === 'number' ? String(bound) : String((bound as { expr?: unknown }).expr ?? ''));

export const boundOf = (text: string): Bound | null =>
  (!text.trim() ? null : /^-?\d+(\.\d+)?$/.test(text.trim()) ? Number(text.trim()) : { expr: text.trim() });

export function BoundField({ value, onChange, placeholder = 'число или формула' }: {
  value: unknown;
  onChange: (next: Bound | null) => void;
  placeholder?: string;
}) {
  return <Input mono value={boundText(value)} placeholder={placeholder} onChange={text => onChange(boundOf(text))} />;
}
