import { useEffect } from 'react';
import { useFormulaBar } from '../store/formula-bar.ts';
import type { BarApi } from '../store/formula-bar.ts';
import { FormulaChips } from './formula-chips.tsx';
import { useLookup } from '../store/lookup.ts';
import { Button } from './primitives.tsx';

export function FormulaBar() {
  const target = useFormulaBar(s => s.target);
  const write = useFormulaBar(s => s.write);
  const commit = useFormulaBar(s => s.commit);
  const cancel = useFormulaBar(s => s.cancel);
  const host = useFormulaBar(s => s.host);
  useEffect(() => host(), [host]);
  if (!target) return null;

  const api: BarApi = { write, dismiss: useFormulaBar.getState().dismiss };

  return (
    <div className="formula-bar" role="region" aria-label="строка формул">
      <span className="formula-bar__fx" aria-hidden>ƒ</span>
      <span className="formula-bar__where" title={target.where}>{target.where}</span>
      <FormulaChips
        key={target.id}
        value={target.value}
        system={target.system}
        {...(target.table ? { table: target.table } : {})}
        {...(target.names ? { names: target.names } : {})}
        {...(target.extraNames ? { extraNames: target.extraNames } : {})}
        {...(target.badges ? { badges: target.badges } : {})}
        {...(target.sheets ? { sheets: target.sheets } : {})}
        placeholder={target.placeholder ?? 'формула — наберите @ и начало названия'}
        calculator
        autoFocus
        extraOptions={(target.options ?? []).map(option => ({
          group: option.group,
          label: option.label,
          ...(option.name ? { name: option.name } : {}),
          onPick: (insert: (piece: string) => string) => option.onPick(insert, api),
        }))}
        onChange={write}
        onChipPick={(name, label) => useLookup.getState().show({ name, label, where: target.where, ...(target.table ? { table: target.table } : {}) })}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
      />
      <span data-guide="formula-done"><Button size="sm" variant="ghost" onClick={commit}>готово</Button></span>
    </div>
  );
}
