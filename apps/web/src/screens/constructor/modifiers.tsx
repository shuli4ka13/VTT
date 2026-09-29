import type { System, Modifier } from '@vtt/schema';
import { Card, CardHead, Field, Input, Select, Button, Empty } from '../../ui/primitives.tsx';
import { FormulaInput } from '../../ui/formula.tsx';
import { targets } from '@vtt/engine/engine/targets';
import { installMethod, recipesToInstall } from '@vtt/engine/model/advantage-methods';
import { tagsOf, tagTablesOf, listOf as rowsFrom } from '@vtt/engine/model/lists';
import { TagPick, type Tag } from './tag-pick.tsx';
import { RollTagsPick } from './roll-tags-pick.tsx';

const OPS = [
  ['add', 'прибавить'],
  ['mul', 'умножить'],
  ['set', 'задать'],
  ['floor', 'не меньше'],
  ['cap', 'не больше'],
] as const;

const RECIPE = 'recipe:';

type Loose = Record<string, unknown>;

const STACKING = [
  ['sum', 'складываются'],
  ['max', 'берётся наибольший'],
  ['override', 'последний перебивает'],
] as const;

export function ModifiersEditor({ system, modifiers, onEdit, title, empty, editSystem }: {
  system: System;
  modifiers: Modifier[];
  onEdit: (change: (draft: Modifier[]) => void) => void;

  title?: string;

  empty?: { title: string; hint: string };

  editSystem?: (change: (draft: System) => void) => void;
}) {
  const all = targets(system) as { tag: string; label: string; kind: string; group?: string }[];
  const valueTargets = all.filter(t => t.kind === 'value' || t.kind === 'incoming' || t.kind === 'event' || t.kind === 'cell');
  const isEvent = (tag: string) => all.find(t => t.tag === tag)?.kind === 'event';
  const rollTargets = all.filter(t => t.kind === 'roll');
  const edits = Object.entries(system.roll_edits ?? {});
  const recipes = editSystem ? recipesToInstall(system) : [];
  const pickEdit = (index: number, value: string) => {
    if (value.startsWith(RECIPE) && editSystem) {
      const [methodId, key] = value.slice(RECIPE.length).split(':');
      editSystem(draft => { installMethod(draft, String(methodId)); });
      onEdit(draft => { (draft[index] as { edit: string }).edit = String(key); });
      return;
    }
    onEdit(draft => { (draft[index] as { edit: string }).edit = value; });
  };

  return (
    <>
      <div className="inline">
        {}
        {title === '' ? null : (
          <span className="screen-title" style={{ fontSize: 'var(--fs-5)' }}>{title ?? 'Что правит'}</span>
        )}
        <span className="spacer" />
        <Button size="sm" onClick={() => onEdit(draft => {
          draft.push({ kind: 'value', target: valueTargets[0]?.tag ?? '', op: 'add', value: { expr: '1' }, stacking: 'sum' });
        })}>
          + правит значение
        </Button>
        <Button
          size="sm"
          onClick={() => onEdit(draft => {
            draft.push({
              kind: 'roll', target: rollTargets[0]?.tag ?? '',
              edit: edits[0]?.[0] ?? '',
            });
          })}
          disabled={rollTargets.length === 0 || (edits.length === 0 && !editSystem)}
          title={edits.length === 0 && !editSystem ? 'Сначала заведите правку в словаре «Правки броска»' : undefined}
        >
          + правит бросок
        </Button>
      </div>

      {modifiers.length === 0 ? (
        <Empty
          title={empty?.title ?? 'Эффект пока ничего не делает'}
          hint={empty?.hint ?? 'Пассивный эффект правит цифры: даёт бонус к полю или вешает преимущество на бросок.'}
        />
      ) : null}

      {modifiers.map((modifier, index) => (
        <Card key={index}>
          <CardHead
            title={modifier.kind === 'value' ? 'Правит значение' : 'Правит бросок'}
            actions={
              <Button size="sm" variant="danger" onClick={() => onEdit(draft => { draft.splice(index, 1); })}>×</Button>
            }
          />

          {modifier.kind === 'value' ? (
            <div className="row">
              <Field label="Что правим" needed={!modifier.target}>
                <Select
                  value={modifier.target}
                  options={[['', '— выберите, что правим —'],
                    ...valueTargets.map(t => [t.tag, t.kind === 'incoming' ? `${t.label}` : t.label] as const)] as never}
                  onChange={target => onEdit(draft => { (draft[index] as Modifier).target = target; })}
                />
              </Field>
              <Field label="Как">
                <Select
                  value={String(modifier.op)}
                  options={OPS}
                  onChange={op => onEdit(draft => { (draft[index] as { op: string }).op = op; })}
                />
              </Field>
              <Field label="На сколько">
                <FormulaInput
                  where="модификатор · на сколько"
                  system={system}
                  value={modifier.value?.expr ?? ''}
                  onChange={expr => onEdit(draft => {
                    (draft[index] as { value: { expr: string } }).value = { expr };
                  })}
                />
              </Field>
              <Field label="Если таких несколько">
                <Select
                  value={String(modifier.stacking ?? 'sum')}
                  options={modifier.op === 'mul'
                    ? STACKING.map(([key, label]) => [key, key === 'sum' ? 'перемножаются' : label] as const)
                    : STACKING}
                  onChange={stacking => onEdit(draft => { (draft[index] as { stacking?: string }).stacking = stacking; })}
                />
              </Field>
              {isEvent(modifier.target) ? (
                <EventCondition
                  system={system}
                  modifier={modifier}
                  onChange={change => onEdit(draft => { change(draft[index] as Loose); })}
                />
              ) : null}
            </div>
          ) : (
            <div className="row">
              <Field label="Чей бросок" needed={!modifier.target}>
                <Select
                  value={modifier.target}
                  options={[['', '— выберите бросок —'],
                    ...rollTargets.map(t => [t.tag, t.label] as const)] as never}
                  onChange={target => onEdit(draft => { (draft[index] as Modifier).target = target; })}
                />
              </Field>
              <Field label="С метками" hint="Бросок должен нести все метки. Пусто — любой бросок.">
                <RollTagsPick
                  system={system}
                  value={(modifier as { tags?: string[] }).tags }
                  onChange={tags => onEdit(draft => {
                    const d = draft[index] as { tags?: string[] };
                    if (tags.length) d.tags = tags; else delete d.tags;
                  })}
                />
              </Field>
              <Field
                label="Какая правка"
                needed={!modifier.edit}
                hint={recipes.length ? 'Готовые механизмы приедут в словарь «Правки броска» со всеми словами.' : undefined}
              >
                <Select
                  value={String(modifier.edit ?? '')}
                  options={[['', '— выберите правку —'],
                    ...edits.map(([key, e]) => [key, e.label || key] as const),
                    ...recipes.map(({ method, recipe }) =>
                      [`${RECIPE}${method.id}:${recipe.key}`, `+ ${recipe.label} · ${method.label}`] as const),
                  ] as never}
                  onChange={edit => pickEdit(index, edit)}
                />
              </Field>
            </div>
          )}

          <Field
            label="Только когда"
            hint="Условие на листе владельца. Пусто — всегда."
          >
            <FormulaInput
              where="модификатор · только когда"
              system={system}
              value={modifier.condition?.expr ?? ''}
              onChange={expr => onEdit(draft => {
                const d = draft[index] as { condition?: { expr: string } };
                if (expr.trim()) d.condition = { expr }; else delete d.condition;
              })}
              placeholder="например: @тяжёлая броня"
            />
          </Field>
        </Card>
      ))}
    </>
  );
}

function EventCondition({ system, modifier, onChange }: {
  system: System;
  modifier: Modifier;
  onChange: (change: (draft: Loose) => void) => void;
}) {
  const m = modifier as Loose;
  const eventId = String(m.target).slice('event:'.length);
  const effect = system.effects[eventId];
  const known = effect ? tagsOf(system, effect) : [];
  const tagTables = tagTablesOf(effect);
  const columns = tagTables.flatMap(table => (system.tables?.[table]?.columns ?? [])
    .map(c => ({ ...c, table, pick: `${table}\u0000${c.key}`, name: tagTables.length > 1 ? `${system.tables?.[table]?.label || table} → ${c.label || c.key}` : (c.label || c.key) })));
  const where = m.where as { table: string; column: string; is: unknown } | undefined;
  const column = columns.find(c => c.table === where?.table && c.key === where?.column);
  const values = column?.kind === 'choice' ? (rowsFrom(system, column.from) ?? []) : [];
  const words = (raw: unknown): Tag[] => (Array.isArray(raw) ? raw.map(String) : []);

  return (
    <>
      <Field label="По меткам" hint="Пусто — по любой метке.">
        <TagPick
          value={words(m.tags)} known={known} fromRecord={[]}
          onChange={next => onChange(d => { const list = next.map(String); if (list.length) d.tags = list; else delete d.tags; })}
        />
      </Field>
      <Field label="Кроме меток">
        <TagPick
          value={words(m.notTags)} known={known} fromRecord={[]}
          onChange={next => onChange(d => { const list = next.map(String); if (list.length) d.notTags = list; else delete d.notTags; })}
        />
      </Field>
      {columns.length ? (
        <Field label="Где у метки" hint="Смотрит в строку метки в таблице: один факт вместо перечня меток.">
          <div className="inline inline--tight">
            <Select
              value={column?.pick ?? ''}
              options={[['', '— без условия —'], ...columns.map(c => [c.pick, c.name] as const)] as never}
              onChange={next => onChange(d => {
                const picked = columns.find(c => c.pick === next);
                if (!picked) { delete d.where; return; }
                d.where = { table: picked.table, column: picked.key, is: '' };
              })}
            />
            {where ? (
              <>
                <span className="faint">=</span>
                {values.length ? (
                  <Select
                    value={String(where.is ?? '')}
                    options={[['', '— что —'], ...values.map(o => [String(o.value), o.label] as const)] as never}
                    onChange={next => onChange(d => { (d.where as Loose).is = next; })}
                  />
                ) : (
                  <Input value={String(where.is ?? '')} onChange={next => onChange(d => { (d.where as Loose).is = next; })} />
                )}
              </>
            ) : null}
          </div>
        </Field>
      ) : null}
    </>
  );
}
