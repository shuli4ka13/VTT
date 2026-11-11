import { Input } from '../../ui/primitives.tsx';
import { FormulaField } from '../../ui/formula-field.tsx';
import type { FormulaFieldProps } from '../../ui/formula-field.tsx';
import type { System } from '@vtt/schema';

export interface Degree { label: string; if: { expr: string } }

export const OTHERWISE = 'да';

type Shared = Pick<FormulaFieldProps, 'extraNames' | 'meanings' | 'badges' | 'sheets'>;

export function DegreeList({ list, change, system, where, shared, placeholder = '@выпало <= @число' }: {
  list: readonly Degree[];
  change: (apply: (draft: Degree[]) => void) => void;
  system: System;
  where: string;
  shared: Shared;
  placeholder?: string;
}) {
  const last = list[list.length - 1];
  return (
    <>
      {list.length > 1 ? <span className="faint">Берётся первая подходящая сверху.</span> : null}
      {list.map((degree, at) => {
        const otherwise = at > 0 && at === list.length - 1 && degree.if.expr.trim() === OTHERWISE;
        return (
          <div key={at} className="roll-degree">
            <Input value={degree.label} placeholder="как зовётся ступень"
              onChange={label => change(draft => { const one = draft[at]; if (one) one.label = label; })} />
            {otherwise ? (
              <span className="roll-degree__if roll-degree__if--else" title="все исходы, которые не подошли ступеням выше">иначе</span>
            ) : (
              <>
                <span className="roll-degree__if">если</span>
                <FormulaField value={degree.if.expr} system={system} where={where} {...shared} placeholder={placeholder}
                  onCommit={text => change(draft => { const one = draft[at]; if (one) one.if = { expr: text.trim() }; })} />
              </>
            )}
            <button type="button" className="chips__x" aria-label="убрать ступень"
              onClick={() => change(draft => { draft.splice(at, 1); })}>×</button>
          </div>
        );
      })}
      <span className="inline inline--tight">
        <button type="button" className="roll-form__add"
          onClick={() => change(draft => {
            const tail = draft[draft.length - 1];
            const fresh = { label: 'Новая ступень', if: { expr: placeholder } };
            if (draft.length > 1 && tail?.if.expr.trim() === OTHERWISE) draft.splice(draft.length - 1, 0, fresh); else draft.push(fresh);
          })}>+ ступень</button>
        {last && last.if.expr.trim() !== OTHERWISE ? (
          <button type="button" className="roll-form__add"
            onClick={() => change(draft => { draft.push({ label: 'Иначе', if: { expr: OTHERWISE } }); })}>+ иначе</button>
        ) : null}
      </span>
    </>
  );
}
