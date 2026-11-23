import type { System } from '@vtt/schema';
import { fieldsOf, rowTables, onSheet } from '@vtt/engine';
import type { Field as FieldModel } from '@vtt/engine';
import { Card, CardHead, Field, Select, Button } from '../../../ui/primitives.tsx';
import { FieldPick } from '../../../ui/field-pick.tsx';
import { freeId } from '../../../store/world.ts';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];

const isNumber = (field: FieldModel): boolean =>
  field.lives !== 'desk' && (field.value.kind === 'formula' || (field.value.type === 'number' && !field.value.many));

export const healthNumbers = (system: System): FieldModel[] => fieldsOf(system).filter(isNumber);

export const stepTables = (system: System): [string, string][] =>
  rowTables(system).filter(([, table]) => !onSheet(table)).map(([key, table]) => [key, table.label || key]);

export const STEP_ROWS: readonly (readonly [string, number])[] = [['цел', 100], ['ранен', 50], ['тяжело ранен', 0]];

export function addStepTable(draft: System): void {
  if (!draft.health) return;
  const key = freeId(Object.keys(draft.tables ?? {}), 'health_steps');
  (draft.tables ??= {})[key] = {
    label: 'Ступени здоровья', key: 'word',
    columns: [{ key: 'from', label: 'От доли, %', kind: 'number' }, { key: 'state', label: 'При состоянии', kind: 'effect' }],
    rows: STEP_ROWS.map(([label, from]) => ({ value: label, cells: { from } })),
  };
  draft.health.steps = { table: key, from: 'from', state: 'state' };
}

export function HealthSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const health = system.health;
  const numbers = healthNumbers(system);
  const tables = stepTables(system);
  const steps = health?.steps;
  const columns = steps ? system.tables?.[steps.table]?.columns ?? [] : [];
  const pick = (kind: string) => columns.filter(column => (column.kind ?? 'number') === kind).map(column => [column.key, column.label || column.key] as const);
  return (
    <Card>
      <CardHead
        title="Здоровье"
        sub="Какие поля листа — здоровье и его предел. По ним стол показывает полосу, долю и ступень: «цел», «ранен», «без сознания»."
        actions={health ? null : (
          <Button size="sm" disabled={!numbers.length} onClick={() => editSystem(draft => {
            const [first, second] = healthNumbers(draft);
            if (first) draft.health = { value: first.tag, max: (second ?? first).tag };
          })}>+ здоровье</Button>
        )}
      />
      {health ? (
        <>
          <div className="row">
            <Field label="Здоровье">
              <FieldPick system={system} label="поле здоровья" value={health.value} fields={numbers}
                onChange={tag => editSystem(draft => { if (draft.health && tag) draft.health.value = tag; })} />
            </Field>
            <Field label="Предел">
              <FieldPick system={system} label="поле предела здоровья" value={health.max} fields={numbers}
                onChange={tag => editSystem(draft => { if (draft.health && tag) draft.health.max = tag; })} />
            </Field>
          </div>
          <Field label="Ступени" hint="Таблица: строка — ступень. Читается сверху вниз: сначала состояния, потом доли от большей к меньшей.">
            <div className="inline inline--tight">
              <Select<string> label="таблица ступеней" value={steps?.table ?? ''}
                options={[['', '— без ступеней —'], ...tables]}
                onChange={next => editSystem(draft => {
                  if (!draft.health) return;
                  if (!next) { delete draft.health.steps; return; }
                  const own = draft.tables?.[next]?.columns ?? [];
                  const from = own.find(column => (column.kind ?? 'number') === 'number')?.key ?? '';
                  const state = own.find(column => column.kind === 'effect')?.key;
                  draft.health.steps = { table: next, from, ...(state ? { state } : {}) };
                })} />
              {steps ? null : <Button size="sm" variant="ghost" onClick={() => editSystem(addStepTable)}>+ таблица ступеней</Button>}
            </div>
          </Field>
          {steps ? (
            <div className="row">
              <Field label="Колонка «от доли, %»">
                <Select<string> label="колонка доли" value={steps.from}
                  options={[...(pick('number').some(([key]) => key === steps.from) ? [] : [[steps.from, steps.from ? `${steps.from} — нет такой` : '— не выбрана —'] as const]), ...pick('number')]}
                  onChange={next => editSystem(draft => { if (draft.health?.steps) draft.health.steps.from = next; })} />
              </Field>
              <Field label="Колонка «при состоянии»">
                <Select<string> label="колонка состояния" value={steps.state ?? ''}
                  options={[['', '— нет —'], ...pick('effect')]}
                  onChange={next => editSystem(draft => {
                    if (!draft.health?.steps) return;
                    if (next) draft.health.steps.state = next; else delete draft.health.steps.state;
                  })} />
              </Field>
            </div>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => editSystem(draft => { delete draft.health; })}>убрать здоровье</Button>
        </>
      ) : null}
    </Card>
  );
}
