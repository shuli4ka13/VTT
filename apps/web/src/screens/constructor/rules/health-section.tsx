import type { System } from '@vtt/schema';
import { fieldsOf, rowTables, onSheet } from '@vtt/engine';
import type { Field as FieldModel } from '@vtt/engine';
import { Card, CardHead, Field, Select, Button } from '../../../ui/primitives.tsx';
import { FieldPick } from '../../../ui/field-pick.tsx';
import { freeId } from '../../../store/world.ts';
import type { WorldState } from '../../../store/world.ts';
import { useT, dataT } from '../../../i18n/author.ts';

type EditSystem = WorldState['editSystem'];

const isNumber = (field: FieldModel): boolean =>
  field.lives !== 'desk' && (field.value.kind === 'formula' || (field.value.type === 'number' && !field.value.many));

export const healthNumbers = (system: System): FieldModel[] => fieldsOf(system).filter(isNumber);

export const stepTables = (system: System): [string, string][] =>
  rowTables(system).filter(([, table]) => !onSheet(table)).map(([key, table]) => [key, table.label || key]);

export const stepRows = (system: System): readonly (readonly [string, string, number])[] => {
  const td = dataT(system);
  return [['whole', td('rolls:new.healthWhole'), 100], ['hurt', td('rolls:new.healthHurt'), 50], ['badly_hurt', td('rolls:new.healthBadlyHurt'), 0]];
};

export function addStepTable(draft: System): void {
  if (!draft.health) return;
  const td = dataT(draft);
  const key = freeId(Object.keys(draft.tables ?? {}), 'health_steps');
  (draft.tables ??= {})[key] = {
    label: td('rolls:new.healthSteps'), key: 'word',
    columns: [{ key: 'from', label: td('rolls:new.healthFrom'), kind: 'number' }, { key: 'state', label: td('rolls:new.healthState'), kind: 'effect' }],
    rows: stepRows(draft).map(([value, label, from]) => ({ value, label, cells: { from } })),
  };
  draft.health.steps = { table: key, from: 'from', state: 'state' };
}

export function HealthSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const t = useT('rolls');
  const health = system.health;
  const numbers = healthNumbers(system);
  const tables = stepTables(system);
  const steps = health?.steps;
  const columns = steps ? system.tables?.[steps.table]?.columns ?? [] : [];
  const pick = (kind: string) => columns.filter(column => (column.kind ?? 'number') === kind).map(column => [column.key, column.label || column.key] as const);
  return (
    <Card>
      <CardHead
        title={t('health.title')}
        sub={t('health.sub')}
        actions={health ? null : (
          <Button size="sm" disabled={!numbers.length} onClick={() => editSystem(draft => {
            const [first, second] = healthNumbers(draft);
            if (first) draft.health = { value: first.tag, max: (second ?? first).tag };
          })}>{t('health.add')}</Button>
        )}
      />
      {health ? (
        <>
          <div className="row">
            <Field label={t('health.value')}>
              <FieldPick system={system} label={t('health.valueLabel')} value={health.value} fields={numbers}
                onChange={tag => editSystem(draft => { if (draft.health && tag) draft.health.value = tag; })} />
            </Field>
            <Field label={t('health.max')}>
              <FieldPick system={system} label={t('health.maxLabel')} value={health.max} fields={numbers}
                onChange={tag => editSystem(draft => { if (draft.health && tag) draft.health.max = tag; })} />
            </Field>
          </div>
          <Field label={t('health.steps')} hint={t('health.stepsHint')}>
            <div className="inline inline--tight">
              <Select<string> label={t('health.stepsTable')} value={steps?.table ?? ''}
                options={[['', t('health.noSteps')], ...tables]}
                onChange={next => editSystem(draft => {
                  if (!draft.health) return;
                  if (!next) { delete draft.health.steps; return; }
                  const own = draft.tables?.[next]?.columns ?? [];
                  const from = own.find(column => (column.kind ?? 'number') === 'number')?.key ?? '';
                  const state = own.find(column => column.kind === 'effect')?.key;
                  draft.health.steps = { table: next, from, ...(state ? { state } : {}) };
                })} />
              {steps ? null : <Button size="sm" variant="ghost" onClick={() => editSystem(addStepTable)}>{t('health.addTable')}</Button>}
            </div>
          </Field>
          {steps ? (
            <div className="row">
              <Field label={t('health.fromColumn')}>
                <Select<string> label={t('health.fromLabel')} value={steps.from}
                  options={[...(pick('number').some(([key]) => key === steps.from) ? [] : [[steps.from, steps.from ? t('health.missing', { name: steps.from }) : t('health.notPicked')] as const]), ...pick('number')]}
                  onChange={next => editSystem(draft => { if (draft.health?.steps) draft.health.steps.from = next; })} />
              </Field>
              <Field label={t('health.stateColumn')}>
                <Select<string> label={t('health.stateLabel')} value={steps.state ?? ''}
                  options={[['', t('health.none')], ...pick('effect')]}
                  onChange={next => editSystem(draft => {
                    if (!draft.health?.steps) return;
                    if (next) draft.health.steps.state = next; else delete draft.health.steps.state;
                  })} />
              </Field>
            </div>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => editSystem(draft => { delete draft.health; })}>{t('health.drop')}</Button>
        </>
      ) : null}
    </Card>
  );
}
