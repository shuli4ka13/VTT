import type { System } from '@vtt/schema';
import { FormulaField } from '../../ui/formula-field.tsx';
import type { SheetNames } from '../../ui/formula-chips.tsx';
import type { BarOption, BarApi } from '../../store/formula-bar.ts';

export const loneSheet = (ref: unknown): string =>
  /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String((ref as { expr?: unknown } | undefined)?.expr ?? ''))?.[1] ?? '';

export function SheetPick({ value, onChange, sheets, system, empty = '— какой лист —', where, extra = [], known }: {
  value: unknown;
  onChange: (next: { expr: string } | null) => void;
  sheets: SheetNames | undefined;
  system: System;
  empty?: string;
  where: string;
  extra?: readonly (readonly [string, string])[];
  known?: ReadonlyMap<string, string>;
}) {
  const expr = String((value as { expr?: unknown } | undefined)?.expr ?? '').trim();
  const list = [...(sheets ?? new Map<string, string>())];
  const names = new Map([...list, ...(known ?? [])]);
  const options: BarOption[] = [
    ...list.map(([name, label]) => ({ group: 'листы', label, name, onPick: (insert: (piece: string) => string, bar: BarApi) => bar.write(insert(`@${name}`)) })),
    ...extra.filter(([formula]) => formula !== '').map(([formula, label]) => ({ group: 'ещё', label, onPick: (_insert: (piece: string) => string, bar: BarApi) => bar.write(formula) })),
  ];
  return (
    <FormulaField
      value={expr}
      system={system}
      where={where}
      {...(sheets ? { sheets } : {})}
      extraNames={names}
      options={options}
      placeholder={empty}
      onCommit={text => onChange(text.trim() ? { expr: text.trim() } : null)}
    />
  );
}
