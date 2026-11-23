import { Input } from '../../ui/primitives.tsx';
import { FormulaField } from '../../ui/formula-field.tsx';
import type { FormulaFieldProps } from '../../ui/formula-field.tsx';
import type { System } from '@vtt/schema';
import { useT, dataT } from '../../i18n/author.ts';

export interface Degree { label: string; if: { expr: string } }

export const OTHERWISE = 'true';

type Shared = Pick<FormulaFieldProps, 'extraNames' | 'meanings' | 'badges' | 'sheets'>;

export function DegreeList({ list, change, system, where, shared, placeholder: given }: {
  list: readonly Degree[];
  change: (apply: (draft: Degree[]) => void) => void;
  system: System;
  where: string;
  shared: Shared;
  placeholder?: string;
}) {
  const t = useT('fields');
  const td = dataT(system);
  const placeholder = given ?? t('degree.placeholder');
  const written = given ?? td('fields:degree.expr');
  const last = list[list.length - 1];
  return (
    <>
      {list.length > 1 ? <span className="faint">{t('degree.first')}</span> : null}
      {list.map((degree, at) => {
        const otherwise = at > 0 && at === list.length - 1 && degree.if.expr.trim() === OTHERWISE;
        return (
          <div key={at} className="roll-degree">
            <Input value={degree.label} placeholder={t('common:name.degree')}
              onChange={label => change(draft => { const one = draft[at]; if (one) one.label = label; })} />
            {otherwise ? (
              <span className="roll-degree__if roll-degree__if--else" title={t('degree.elseTip')}>{t('degree.else')}</span>
            ) : (
              <>
                <span className="roll-degree__if">{t('degree.if')}</span>
                <FormulaField value={degree.if.expr} system={system} where={where} {...shared} placeholder={placeholder}
                  onCommit={text => change(draft => { const one = draft[at]; if (one) one.if = { expr: text.trim() }; })} />
              </>
            )}
            <button type="button" className="chips__x" aria-label={t('degree.remove')}
              onClick={() => change(draft => { draft.splice(at, 1); })}>×</button>
          </div>
        );
      })}
      <span className="inline inline--tight">
        <button type="button" className="roll-form__add"
          onClick={() => change(draft => {
            const tail = draft[draft.length - 1];
            const fresh = { label: td('fields:degree.new'), if: { expr: written } };
            if (draft.length > 1 && tail?.if.expr.trim() === OTHERWISE) draft.splice(draft.length - 1, 0, fresh); else draft.push(fresh);
          })}>{t('degree.add')}</button>
        {last && last.if.expr.trim() !== OTHERWISE ? (
          <button type="button" className="roll-form__add"
            onClick={() => change(draft => { draft.push({ label: td('fields:degree.otherwise'), if: { expr: OTHERWISE } }); })}>{t('degree.addElse')}</button>
        ) : null}
      </span>
    </>
  );
}
