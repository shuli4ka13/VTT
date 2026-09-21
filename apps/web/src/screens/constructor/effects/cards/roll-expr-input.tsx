import { useMemo, useState } from 'react';
import { Field } from '../../../../ui/primitives.tsx';
import { parseRollExpr, formatRollExpr, notationOf } from '../../roll-expr.ts';
import { compile } from '@vtt/engine/formula';
import { FormulaChips } from '../../../../ui/formula-chips.tsx';
import { namesOf, refForName } from '../../slots.tsx';
import type { SlotContext } from '../../slots.tsx';
import type { EditFn } from '../words.ts';

export function RollExprInput({ step, context, edit }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);

  const [picked, setPicked] = useState<string | null>(null);
  const names = useMemo(() => namesOf(context), [context]);
  const shown = draft ?? formatRollExpr(step.roll, context.system);

  const commit = () => {
    if (draft === null) return;
    if (!draft.trim()) {
      edit(0, target => { delete ((target as any).roll ??= {}).bonus; });
      setDraft(null); setTrouble(null); setPicked(null);
      return;
    }
    const parsed = parseRollExpr(draft, context.system, picked, name => refForName(context, name));
    if (parsed.error) { setTrouble(parsed.error); return; }
    const bad = badFormula(parsed.bonus);
    if (bad) { setTrouble(bad); return; }
    edit(0, target => {
      const roll = ((target as any).roll ??= {});
      roll.die = parsed.die;
      if (parsed.bonus === null) delete roll.bonus; else roll.bonus = parsed.bonus;
    });
    setDraft(null);
    setTrouble(null);
    setPicked(null);
  };

  return (
    <Field label="бросок" error={trouble}>
      <FormulaChips
        value={shown}
        system={context.system}
        extraNames={names}
        side={step.side === 'target' ? 'target' : 'self'}
        placeholder="1к20 + @поле"
        calculator
        extraOptions={Object.entries(context.system.constants ?? {})
          .filter(([, c]) => c.kind === 'die')
          .map(([key, c]) => ({
            group: 'кость системы',
            label: c.label || key,

            onPick: (insert: (piece: string) => string) => {
              setPicked(key);
              setDraft(insert(notationOf(context.system, key)));
            },
          }))}
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(null); setTrouble(null); setPicked(null); }
        }}
      />
    </Field>
  );
}

export function badFormula(bonus: unknown): string | null {
  if (!bonus || typeof bonus !== 'object' || !('expr' in (bonus as object))) return null;
  const text = String((bonus as { expr: unknown }).expr ?? '').trim();
  if (!text) return null;
  try { compile(text); return null; } catch (err) {
    return (err as Error).message;
  }
}

export function exprText(bonus: unknown): string {
  if (!bonus || typeof bonus !== 'object') return '';
  const b = bonus as Record<string, unknown>;
  if ('expr' in b) return String(b.expr ?? '');
  if ('const' in b) return String(b.const ?? '');
  return '';
}
