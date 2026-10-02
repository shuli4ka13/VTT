import type { System, Modifier } from '@vtt/schema';
import { Card, CardHead, Field, Input, Select, Button, Empty, Fold, DangerButton } from '../../ui/primitives.tsx';
import { FormulaInput, formulaAsLabels } from '../../ui/formula.tsx';
import { targets } from '@vtt/engine/engine/targets';
import { installMethod, recipesToInstall } from '@vtt/engine/model/advantage-methods';
import { tagsOf, tagTablesOf, listOf as rowsFrom, amountParamOf } from '@vtt/engine/model/lists';
import { calledOf } from '@vtt/engine/engine/effects';
import { ROLL_CALL, CALL_WORDS } from '@vtt/engine/words/calls';
import { TagPick, type Tag } from './tag-pick.tsx';
import { RollTagsPick } from './roll-tags-pick.tsx';
import { callNamesOf } from '@vtt/engine/model/references';
import { holderPhrase, splitIf, joinIf } from './effects/names.ts';

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
  const valueTargets = all.filter(t => t.kind === 'value' || t.kind === 'cell');
  const calls = calledOf(system).filter(([, effect]) => amountParamOf(effect));
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
          + правит поле
        </Button>
        <Button
          size="sm"
          title="Правит вызов: бросок (преимущество, прибавка) или вход эффекта (урон вдвое по огню)"
          onClick={() => onEdit(draft => {
            draft.push({ kind: 'edit', call: ROLL_CALL, param: 'edits', edit: edits[0]?.[0] ?? '' });
          })}
        >
          + правка вызова
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
            title={modifier.kind === 'value' ? 'Правит поле' : 'Правка вызова'}
            actions={
              <DangerButton size="sm" onConfirm={() => onEdit(draft => { draft.splice(index, 1); })}>Удалить</DangerButton>
            }
          />

          {modifier.kind === 'value' ? (
            <div className="row">
              <Field label="Что правим" needed={!modifier.target}>
                <Select
                  value={modifier.target}
                  options={[['', '— выберите, что правим —'],
                    ...valueTargets.map(t => [t.tag, t.label] as const)] as never}
                  onChange={target => onEdit(draft => { (draft[index] as { target: string }).target = target; })}
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
            </div>
          ) : modifier.kind === 'edit' ? (
            <EditBody
              system={system} modifier={modifier} calls={calls} edits={edits} recipes={recipes}
              onChange={change => onEdit(draft => { change(draft[index] as Loose); })}
              onPickEdit={value => pickEdit(index, value)}
            />
          ) : null}

          {modifier.kind === 'value' ? (
            <Fold title="Только если" summary={modifier.condition?.expr ? `если ${formulaAsLabels(system, modifier.condition.expr)}` : 'всегда'}>
              <Field label="Условие" hint="На листе носителя. Пусто — всегда.">
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
            </Fold>
          ) : (
            <Concern system={system} modifier={modifier as Loose} onChange={change => onEdit(draft => { change(draft[index] as Loose); })} />
          )}
        </Card>
      ))}
    </>
  );
}

function EditBody({ system, modifier, calls, edits, recipes, onChange, onPickEdit }: {
  system: System;
  modifier: Modifier;
  calls: [string, { label?: string; params?: { key: string; label?: string; role?: string }[] }][];
  edits: [string, { label?: string }][];
  recipes: ReturnType<typeof recipesToInstall>;
  onChange: (change: (draft: Loose) => void) => void;
  onPickEdit: (value: string) => void;
}) {
  const m = modifier as Loose;
  const call = String(m.call ?? '');
  const isRoll = call === ROLL_CALL;
  const effect = isRoll ? undefined : system.effects[call];
  const amount = amountParamOf(effect);
  const pickCall = (next: string) => onChange(d => {
    for (const key of ['edit', 'op', 'value', 'stacking', 'as', 'tags', 'anyTags', 'notTags', 'where', 'when']) delete d[key];
    d.call = next;
    if (next === ROLL_CALL) { d.param = 'edits'; d.edit = edits[0]?.[0] ?? ''; return; }
    d.param = amountParamOf(system.effects[next])?.key ?? '';
    Object.assign(d, { op: 'mul', value: { expr: '0.5' }, stacking: 'sum' });
  });
  const pickParam = (next: string) => onChange(d => {
    for (const key of ['edit', 'op', 'value', 'stacking']) delete d[key];
    d.param = next;
    if (next === 'edits') d.edit = edits[0]?.[0] ?? '';
    else Object.assign(d, { op: 'add', value: { expr: '1' }, stacking: 'sum' });
  });
  const number = (
    <>
      {isRoll ? null : (
        <Field label="Как">
          <Select value={String(m.op ?? 'add')} options={OPS} onChange={op => onChange(d => { d.op = op; })} />
        </Field>
      )}
      <Field label="На сколько">
        <FormulaInput
          where="правка вызова · на сколько" system={system}
          value={(m.value as { expr?: string } | undefined)?.expr ?? ''}
          onChange={expr => onChange(d => { d.value = { expr }; })}
        />
      </Field>
      <Field label="Если таких несколько">
        <Select
          value={String(m.stacking ?? 'sum')}
          options={m.op === 'mul' ? STACKING.map(([key, label]) => [key, key === 'sum' ? 'перемножаются' : label] as const) : STACKING}
          onChange={stacking => onChange(d => { d.stacking = stacking; })}
        />
      </Field>
    </>
  );

  return (
    <div className="row">
      <Field label="Чей вызов" needed={!call}>
        <Select
          value={call}
          options={[[ROLL_CALL, CALL_WORDS.roll.label], ...calls.map(([id, e]) => [id, e.label || id] as const)] as never}
          onChange={pickCall}
        />
      </Field>
      {isRoll ? (
        <>
          <Field label="Что правим">
            <Select
              value={String(m.param ?? 'edits')}
              options={Object.entries(CALL_WORDS.roll.params) as never}
              onChange={pickParam}
            />
          </Field>
          <Field label="С метками" hint="Бросок должен нести все метки. Пусто — любой бросок.">
            <RollTagsPick
              system={system}
              value={(m.tags as string[] | undefined)}
              onChange={tags => onChange(d => { if (tags.length) d.tags = tags; else delete d.tags; })}
            />
          </Field>
          {m.param === 'edits' ? (
            <Field
              label="Какая правка" needed={!m.edit}
              hint={recipes.length ? 'Готовые механизмы приедут в словарь «Правки броска» со всеми словами.' : undefined}
            >
              <Select
                value={String(m.edit ?? '')}
                options={[['', '— выберите правку —'],
                  ...edits.map(([key, e]) => [key, e.label || key] as const),
                  ...recipes.map(({ method, recipe }) =>
                    [`${RECIPE}${method.id}:${recipe.key}`, `+ ${recipe.label} · ${method.label}`] as const),
                ] as never}
                onChange={onPickEdit}
              />
            </Field>
          ) : number}
        </>
      ) : (
        <>
          <Field label="Что правим">
            <span>{amount ? amount.label || amount.key : '— у эффекта нет величины —'}</span>
          </Field>
          {number}
          <EventCondition system={system} effect={effect} modifier={modifier} onChange={onChange} />
        </>
      )}
      <Field
        label="Только если по вызову"
        hint={isRoll ? 'Формула над броском: @вызов.метки — его метки. Пусто — всегда.' : `Формула над тем, что пришло в вызов: ${(effect?.params ?? []).map(p => `@вызов.${p.key}`).join(', ') || 'входов нет'}. Пусто — всегда.`}
      >
        <FormulaInput
          where="правка вызова · только если по вызову"
          system={system}
          extraNames={new Map(isRoll ? [['вызов.метки', 'метки броска']] : (effect?.params ?? []).map(p => [`вызов.${p.key}`, `вызов → ${p.label || p.key}`]))}
          value={(m.when as { expr?: string } | undefined)?.expr ?? ''}
          onChange={expr => onChange(d => { if (expr.trim()) d.when = { expr }; else delete d.when; })}
          placeholder={isRoll ? 'например: есть(@вызов.метки, "атака")' : 'например: @вызов.сколько >= 10'}
        />
      </Field>
    </div>
  );
}

function EventCondition({ system, effect, modifier, onChange }: {
  system: System;
  effect: System['effects'][string] | undefined;
  modifier: Modifier;
  onChange: (change: (draft: Loose) => void) => void;
}) {
  const m = modifier as Loose;
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
          value={words(m.anyTags)} known={known} fromRecord={[]}
          onChange={next => onChange(d => { const list = next.map(String); if (list.length) d.anyTags = list; else delete d.anyTags; })}
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

function Concern({ system, modifier, onChange }: {
  system: System;
  modifier: Loose;
  onChange: (change: (draft: Loose) => void) => void;
}) {
  const call = String(modifier.call ?? ROLL_CALL);
  const names = callNamesOf(system, call).sheets;
  const words: Record<string, string> = { бросающий: 'бросает носитель', против: 'бросают против носителя' };
  const phrases = names.map(name => [holderPhrase(name), words[name] ?? `«${name}» — носитель`] as const);
  const written = (modifier.if as { expr?: string } | undefined)?.expr;
  const { holder, rest } = splitIf(written, phrases.map(([expr]) => expr));
  const set = (nextHolder: string, nextRest: string) => onChange(d => {
    const expr = joinIf(nextHolder, nextRest);
    if (expr) d.if = { expr }; else delete d.if;
  });
  return (
    <div className="row">
      <Field label="Кого касается" hint="Носитель — лист, на котором висит эта правка.">
        <Select<string>
          value={holder}
          options={[['', 'всех — без условия'], ...phrases]}
          onChange={next => set(next, rest)}
        />
      </Field>
      <Fold title="Только если" summary={rest ? `если ${formulaAsLabels(system, rest)}` : 'больше условий нет'}>
        <Field label="Условие" hint="Поля пишутся через лист: @носитель.поле. Входы вызова — по имени.">
          <FormulaInput
            where="правка · только если"
            system={system}
            value={rest}
            onChange={expr => set(holder, expr)}
            placeholder="например: @носитель.ярость > 0"
          />
        </Field>
      </Fold>
    </div>
  );
}
