import type { System, Effect, Param, Binding } from '@vtt/schema';
import type { RecordKind } from '@vtt/engine/model/owned';
import { tableOf } from '@vtt/engine/model/buttons';
import { paramsOf } from '@vtt/engine/model/inherit';
import { Card, CardHead, Field, Fold, Select, LabelInput, DangerButton } from '../../ui/primitives.tsx';
import { CallEditor } from './call-editor.tsx';

export function ButtonEditor({ binding, system, recordKind, onEdit, onDelete, onFillWithProp }: {
  binding: Binding;
  system: System;

  recordKind: RecordKind;
  onEdit: (change: (draft: Binding) => void) => void;
  onDelete: () => void;

  onFillWithProp?: (param: Param) => void;
}) {
  const effect = system.effects[binding.effect];
  const implicit = new Set((recordKind.columns ?? []).map(prop => prop.key));
  const closed = (key: string) => binding.args?.[key] !== undefined || implicit.has(key);
  const buttons = Object.entries(system.effects).filter(([, e]) => (e.activation ?? 'manual') !== 'passive');

  return (
    <Card tone="flat">
      <CardHead
        title={<LabelInput value={binding.label ?? ''} placeholder="как назвать кнопку" onCommit={label => onEdit(draft => { draft.label = label; })} />}
        actions={<DangerButton size="sm" onConfirm={onDelete}>Удалить</DangerButton>}
      />
      <CallEditor
        system={system}
        effect={binding.effect}
        effects={buttons}
        onEffect={next => onEdit(draft => { if (typeof next === 'string') draft.effect = next; })}
        args={binding.args as Record<string, unknown> | undefined}
        fromProps={implicit}
        filled={effect ? tableOf(binding, { params: paramsOf(system, effect) }) : {}}
        context={{ system, effect: effect ?? ({ label: '' } as Effect), earlier: [], recordKind }}
        where={binding.label || effect?.label || binding.effect}
        allow={['prop', 'table']}
        grouped
        names={namesOf(recordKind, system)}
        onArg={(key, next) => onEdit(draft => {
          draft.args ??= {};
          if (next) draft.args[key] = next as never; else delete draft.args[key];
          if (!Object.keys(draft.args).length) delete draft.args;
        })}
        extraFor={param => [
          ...(closed(param.key) || !onFillWithProp ? [] : [{
            group: 'Завести', label: `новое свойство «${param.label ?? param.key}»`,
            onPick: () => onFillWithProp(param),
          }]),
          ...sourcesFor(param, recordKind, system).map(source => ({ group: 'Свойства записи', label: source.label, formula: source.formula })),
        ]}
      />
      {effect ? <WhoFills binding={binding} params={paramsOf(system, effect)} onEdit={onEdit} /> : null}
    </Card>
  );
}

function WhoFills({ binding, params, onEdit }: { binding: Binding; params: Param[]; onEdit: (change: (draft: Binding) => void) => void }) {
  const sheets = params.filter(param => param.kind === 'sheet');
  if (!sheets.length) return null;
  const current = tableOf(binding, { params });
  return (
    <Fold title="ещё" summary={binding.table ? 'кто действует и цели заданы явно' : 'кто действует и цели — по входам'}>
      <div className="row">
        {sheets.map(param => (
          <Field key={param.key} label={param.label ?? param.key}>
            <Select<string>
              value={current[param.key] ?? ''}
              options={[['', 'не заполняет'], ['actor', 'кто нажал кнопку'], ['targets', 'цели, выбранные за столом']]}
              onChange={next => onEdit(draft => {
                const table = { ...tableOf(draft, { params }) };
                if (next) table[param.key] = next as 'actor' | 'targets'; else delete table[param.key];
                draft.table = table;
              })}
            />
          </Field>
        ))}
      </div>
    </Fold>
  );
}

export function namesOf(kind: RecordKind, system: System): Map<string, string> {
  const out = new Map<string, string>();
  for (const prop of kind.columns ?? []) {
    const label = prop.label ?? prop.key;
    out.set(prop.key, label);
    const table = prop.kind === 'choice' && prop.from ? system.tables?.[prop.from] : undefined;
    for (const column of table?.columns ?? []) out.set(`${prop.key}.${column.key}`, `${label} · ${column.label || column.key}`);
  }
  return out;
}

const FITS: Record<string, string[]> = {
  number: ['number'],
  dice: ['dice'],
  text: ['text'],
  effect: ['effect'],
  record: ['record'],
};

function sourcesFor(param: Param, kind: RecordKind, system: System): { label: string; formula: string }[] {
  const props = kind.columns ?? [];
  const want = String(param.kind ?? 'number');
  const own = props
    .filter(prop => (want === 'choice'
      ? prop.kind === 'choice' && prop.from === param.from
      : (FITS[want] ?? []).includes(String(prop.kind ?? 'number'))))
    .map(prop => ({ label: `свойство «${prop.label ?? prop.key}»`, formula: `@${prop.key}` }));
  if (want !== 'number') return own;
  const viaTable = props
    .filter(prop => prop.kind === 'choice' && prop.from && system.tables?.[prop.from]?.columns?.length)
    .flatMap(prop => (system.tables![prop.from!]!.columns ?? [])
      .filter(column => String(column.kind ?? 'number') === 'number')
      .map(column => ({
        label: `${prop.label ?? prop.key} · ${column.label || column.key}`,
        formula: `@${prop.key}.${column.key}`,
      })));
  return [...own, ...viaTable];
}

