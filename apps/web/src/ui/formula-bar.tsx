import type { System } from '@vtt/schema';
import { useFormulaBar } from '../store/formula-bar.ts';
import { FormulaChips } from './formula-chips.tsx';
import { Button } from './primitives.tsx';

export function FormulaBar({ system }: { system: System }) {
  const target = useFormulaBar(s => s.target);
  const write = useFormulaBar(s => s.write);
  const close = useFormulaBar(s => s.close);
  if (!target) return null;

  return (
    <div className="formula-bar" role="region" aria-label="строка формул">
      <span className="formula-bar__fx" aria-hidden>ƒ</span>
      <span className="formula-bar__where" title={target.where}>{target.where}</span>
      <FormulaChips
        key={target.id}
        value={target.value}
        system={system}
        placeholder="формула — наберите @ и начало названия"
        calculator
        onChange={write}
        onKeyDown={e => { if (e.key === 'Escape') close(); }}
      />
      <Button size="sm" variant="ghost" onClick={close}>готово</Button>
    </div>
  );
}
