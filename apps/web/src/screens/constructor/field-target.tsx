import { useState, type ReactNode } from 'react';
import { BY_FORMULA } from './typed-pick.tsx';
import type { System } from '@vtt/schema';
import { Field, Select } from '../../ui/primitives.tsx';
import { FieldPick } from '../../ui/field-pick.tsx';
import { fieldsOf, cellSource, DESK_ID } from '@vtt/engine';
import type { SlotContext } from './slots.tsx';

const fieldTarget = (target: unknown): { sheet: string; tag: string } | null => {
  const expr = target && typeof target === 'object' && 'expr' in target ? String((target as { expr: unknown }).expr) : '';
  const found = /^\s*@([\p{L}\p{N}_]+)\.([\p{L}\p{N}_.]+)\s*$/u.exec(expr);
  return found ? { sheet: found[1]!, tag: found[2]! } : null;
};

const rowNamesOf = (context: SlotContext): { name: string; label: string; table: string }[] => [
  ...(context.effect.params ?? [])
    .filter(param => param.kind === 'choice' && typeof param.from === 'string' && !param.many)
    .map(param => ({ name: param.key, label: param.label ?? param.key, table: String(param.from) })),
  ...context.earlier.filter(step => step.table).map(step => ({ name: step.id, label: step.id, table: step.table! })),
];

const storedColumns = (system: System, table: string) => {
  const spec = system.tables?.[table];
  return (spec?.columns ?? []).filter(column => (spec?.rows ?? []).some(row => cellSource(column, row).kind === 'input'));
};

export function TargetPick({ target, context, onChange, formula }: {
  target: unknown;
  formula?: ReactNode;
  context: SlotContext;
  onChange: (next: { expr: string } | null) => void;
}) {
  const system = context.system;
  const picked = fieldTarget(target);
  const param = target && typeof target === 'object' && 'expr' in target && !picked ? String((target as { expr: unknown }).expr).replace(/^@/, '') : '';
  const sheets = [...(context.sheets ?? new Map<string, string>())];
  const desk = fieldsOf(system).some(f => f.lives === 'desk');
  const fieldParams = (context.effect.params ?? []).filter(p => p.kind === 'field');
  const [chosen, setChosen] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const byFormula = Boolean(formula) && (manual || (Boolean(param) && !fieldParams.some(p => p.key === param)));
  const owner = byFormula ? BY_FORMULA : picked?.sheet ?? (param ? `:${param}` : chosen ?? sheets[0]?.[0] ?? '');
  const options: (readonly [string, string])[] = [
    ...sheets.map(([name, label]) => [name, `«${label}»`] as const),
    ...(desk ? [[DESK_ID, 'стол'] as const] : []),
    ...fieldParams.map(p => [`:${p.key}`, `поле из входа «${p.label ?? p.key}»`] as const),
    ...(formula ? [[BY_FORMULA, 'формулой…'] as const] : []),
  ];
  const fields = fieldsOf(system).filter(f => f.value.kind === 'stored' && (owner === DESK_ID ? f.lives === 'desk' : f.lives !== 'desk'));
  const cells = rowNamesOf(context)
    .filter(row => (owner === DESK_ID ? system.tables?.[row.table]?.owner === 'desk' : system.tables?.[row.table]?.owner && system.tables?.[row.table]?.owner !== 'desk'))
    .flatMap(row => storedColumns(system, row.table).map(column => [`${row.name}.${column.key}`, `${row.label} · ${column.label ?? column.key}`] as const));
  return (
    <div className="row">
      <Field label="У кого" needed={!owner}>
        <Select<string>
          value={owner}
          options={options.length ? options : [['', '— у эффекта нет входов-листов —']]}
          onChange={next => {
            if (next === BY_FORMULA) { setManual(true); return; }
            setManual(false);
            if (next.startsWith(':')) { onChange({ expr: `@${next.slice(1)}` }); return; }
            setChosen(next);
            onChange(picked ? { expr: `@${next}.${picked.tag}` } : null);
          }}
        />
      </Field>
      {byFormula ? formula : owner.startsWith(':') ? null : (
        <Field label="Какое поле" needed={!picked}>
          <FieldPick
            system={system}
            value={picked?.tag ?? ''}
            fields={fields}
            extra={cells}
            onChange={next => onChange(next ? { expr: `@${owner}.${next}` } : null)}
          />
        </Field>
      )}
    </div>
  );
}
