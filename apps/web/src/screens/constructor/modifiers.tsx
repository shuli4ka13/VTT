import type { System, Modifier, Stage } from '@vtt/schema';
import { paramStages, targetStages } from '@vtt/engine/engine/stages';
import { modifierSentence, rowNamesOf } from './modifier-words.ts';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Card, CardHead, Field, Input, Select, Button, DangerButton } from '../../ui/primitives.tsx';
import { WhileWhenRow, WhileWhenEmpty } from './effects/while-when.tsx';
import { FormulaInput } from '../../ui/formula.tsx';
import { targets } from '@vtt/engine/engine/targets';
import { installMethod, recipesToInstall } from '@vtt/engine/model/advantage-methods';
import { tagsOf, tagTablesOf, listOf as rowsFrom, amountParamOf } from '@vtt/engine/model/lists';
import { calledOf } from '@vtt/engine/engine/effects';
import { ROLL_CALL, CALL_WORDS } from '@vtt/engine/words/calls';
import { TagsField } from './tags-field.tsx';
import { callNamesOf, holderConditionOf } from '@vtt/engine/model/references';
import { ConditionField } from './condition-field.tsx';
import { AddendPick } from './effects/cards/die-pick.tsx';
import { rowPicks } from './row-picks.ts';

const OPS = [
  ['add', 'прибавить'],
  ['mul', 'умножить'],
  ['set', 'задать'],
  ['floor', 'не меньше'],
  ['cap', 'не больше'],
] as const;

const RECIPE = 'recipe:';

type Loose = Record<string, unknown>;

function StagePick({ stages, value, onChange }: {
  stages: readonly Stage[];
  value: string | undefined;
  onChange: (stage: string | undefined) => void;
}) {
  if (stages.length < 2 && value === undefined) return null;
  return (
    <Field label="Этап" needed={stages.length > 1 && !value}>
      <Select
        value={value ?? ''}
        options={[['', '— выберите этап —'], ...stages.map(stage => [stage.key, stage.label || stage.key] as const)] as never}
        onChange={stage => onChange(stage || undefined)}
      />
    </Field>
  );
}

type ModifierRowsProps = {
  system: System;
  modifiers: Modifier[];
  onEdit: (change: (draft: Modifier[]) => void) => void;
  editSystem?: (change: (draft: System) => void) => void;
  table?: string;
  named?: boolean;
};

export type ModifierAdd = { field: () => void; call: () => void };

export function useModifierRows({ system, modifiers, onEdit, editSystem, table, named = false }: ModifierRowsProps): { rows: ReactNode[]; add: ModifierAdd } {
  const names = rowNamesOf(system, table);
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

  const [opened, setOpened] = useState<number[]>([]);
  const isOpen = (index: number) => opened.includes(index);
  const openAt = (index: number) => setOpened(now => (now.includes(index) ? now : [...now, index]));
  const closeAt = (index: number) => setOpened(now => now.filter(at => at !== index));

  const add: ModifierAdd = {
    field: () => { openAt(modifiers.length); onEdit(draft => {
      draft.push({ kind: 'value', target: valueTargets[0]?.tag ?? '', op: 'add', value: { expr: '1' } });
    }); },
    call: () => { openAt(modifiers.length); onEdit(draft => {
      const holder = holderConditionOf(system, ROLL_CALL);
      draft.push({ kind: 'edit', call: ROLL_CALL, param: 'edits', edit: edits[0]?.[0] ?? '', ...(holder ? { if: { expr: holder } } : {}) });
    }); },
  };

  const rows = modifiers.map((modifier, index) => {
    const picks = modifier.kind === 'value' ? rowPicks(system, modifier.target, names) : null;
    return (
    <div key={index} className="mod-item">
      {isOpen(index) ? (
        <Card className="mod-card">
          <CardHead
            title={modifier.kind === 'value' ? 'Правит поле' : 'Правка вызова'}
            actions={<>
              <Button size="sm" variant="ghost" ariaLabel={`свернуть «${modifierSentence(system, modifier, table)}»`} onClick={() => closeAt(index)}>свернуть</Button>
              <DangerButton size="sm" onConfirm={() => { closeAt(index); onEdit(draft => { draft.splice(index, 1); }); }}>Удалить</DangerButton>
            </>}
          />

          {modifier.kind === 'value' ? (
            <div className="row">
              <Field label="Что правим" needed={!modifier.target}>
                <Select
                  value={modifier.target}
                  options={[['', '— выберите, что правим —'],
                    ...valueTargets.map(t => [t.tag, t.label] as const)] as never}
                  onChange={target => onEdit(draft => { const d = draft[index] as { target: string; stage?: string }; d.target = target; delete d.stage; })}
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
                  {...(picks ? { extraNames: picks.names, options: picks.options } : names ? { extraNames: names } : {})}
                  value={modifier.value?.expr ?? ''}
                  onChange={expr => onEdit(draft => {
                    (draft[index] as { value: { expr: string } }).value = { expr };
                  })}
                />
              </Field>
              <StagePick
                stages={targetStages(system, String(modifier.target ?? ''))}
                value={(modifier as { stage?: string }).stage}
                onChange={stage => onEdit(draft => {
                  const target = draft[index] as { stage?: string };
                  if (stage === undefined) delete target.stage; else target.stage = stage;
                })}
              />
            </div>
          ) : modifier.kind === 'edit' ? (
            <EditBody
              system={system} modifier={modifier} calls={calls} edits={edits} recipes={recipes} names={names}
              onChange={change => onEdit(draft => { change(draft[index] as Loose); })}
              onPickEdit={value => pickEdit(index, value)}
            />
          ) : null}

          {modifier.kind === 'value' ? (
            <ConditionField
              value={modifier.if?.expr}
              onChange={expr => onEdit(draft => {
                const d = draft[index] as { if?: { expr: string } };
                if (expr) d.if = { expr }; else delete d.if;
              })}
              system={system}
              {...(picks ? { names: picks.names, phrases: picks.phrases } : names ? { names } : {})}
              where="модификатор · только когда"
              placeholder="например: @тяжёлая_броня"
              ruleHint="На листе носителя. Не сошлось — правка не действует."
            />
          ) : (
            <Concern system={system} modifier={modifier as Loose} names={names} onChange={change => onEdit(draft => { change(draft[index] as Loose); })} />
          )}
        </Card>
      ) : (
        <WhileWhenRow
          when={false} named={named}
          label={`развернуть «${modifierSentence(system, modifier, table)}»`}
          onOpen={() => openAt(index)}
          onRemove={() => onEdit(draft => { draft.splice(index, 1); })}
        >
          {modifierSentence(system, modifier, table)}
        </WhileWhenRow>
      )}
    </div>
    );
  });

  return { rows, add };
}

export function AddModifiers({ add }: { add: ModifierAdd }) {
  return (
    <>
      <Button size="sm" onClick={add.field}>
        + правит поле
      </Button>
      <Button
        size="sm"
        title="Правит вызов: бросок (преимущество, прибавка) или вход эффекта (урон вдвое по огню)"
        onClick={add.call}
      >
        + правка вызова
      </Button>
    </>
  );
}

export function ModifiersEditor({ system, modifiers, onEdit, title, empty, editSystem, table }: ModifierRowsProps & {
  title?: string;
  empty?: { title: string; hint: string };
}) {
  const { rows, add } = useModifierRows({ system, modifiers, onEdit, editSystem, ...(table ? { table } : {}) });
  return (
    <>
      {title === ''
        ? <div className="inline"><span className="spacer" /><AddModifiers add={add} /></div>
        : <CardHead title={title ?? 'Что правит'} actions={<AddModifiers add={add} />} />}

      {modifiers.length === 0 ? (
        <WhileWhenEmpty title={empty?.hint ?? 'Пассивный эффект правит цифры: даёт бонус к полю или вешает преимущество на бросок.'}>
          {empty?.title ?? 'Эффект пока ничего не делает'}
        </WhileWhenEmpty>
      ) : null}

      {rows.length ? <div className="mod-table">{rows}</div> : null}
    </>
  );
}

function EditBody({ system, modifier, calls, edits, recipes, names, onChange, onPickEdit }: {
  system: System;
  modifier: Modifier;
  calls: [string, { label?: string; params?: { key: string; label?: string; role?: string }[] }][];
  edits: [string, { label?: string }][];
  recipes: ReturnType<typeof recipesToInstall>;
  names: Map<string, string> | undefined;
  onChange: (change: (draft: Loose) => void) => void;
  onPickEdit: (value: string) => void;
}) {
  const m = modifier as Loose;
  const call = String(m.call ?? '');
  const isRoll = call === ROLL_CALL;
  const effect = isRoll ? undefined : system.effects[call];
  const amount = amountParamOf(effect);
  const tagsParam = isRoll && m.param === 'tags';
  const pickCall = (next: string) => onChange(d => {
    if (next === d.call) return;
    for (const key of ['edit', 'op', 'value', 'die', 'count', 'minus', 'stage', 'as', 'tags', 'anyTags', 'notTags', 'where']) delete d[key];
    d.call = next;
    const holder = holderConditionOf(system, next);
    if (holder) d.if = { expr: holder }; else delete d.if;
    if (next === ROLL_CALL) { d.param = 'edits'; d.edit = edits[0]?.[0] ?? ''; return; }
    d.param = amountParamOf(system.effects[next])?.key ?? '';
    Object.assign(d, { op: 'mul', value: { expr: '0.5' } });
  });
  const pickParam = (next: string) => onChange(d => {
    for (const key of ['edit', 'op', 'value', 'die', 'count', 'minus', 'stage']) delete d[key];
    d.param = next;
    if (next === 'edits') d.edit = edits[0]?.[0] ?? '';
    else if (next === 'tags') d.value = { expr: '"метка"' };
    else Object.assign(d, { op: 'add', value: { expr: '1' } });
  });
  const number = (
    <>
      {isRoll ? null : (
        <Field label="Как">
          <Select value={String(m.op ?? 'add')} options={OPS} onChange={op => onChange(d => { d.op = op; })} />
        </Field>
      )}
      {isRoll && m.param === 'bonus' ? (
        <Field label="Сколько">
          <AddendPick source={m} system={system} where="правка броска · прибавка" onChange={onChange} />
        </Field>
      ) : (
        <Field label={tagsParam ? 'Какая метка' : 'На сколько'} hint={tagsParam ? 'Формула, дающая текст метки, например «без Преимущества».' : undefined}>
          <FormulaInput
            where={tagsParam ? 'правка броска · какая метка' : 'правка вызова · на сколько'} system={system}
            {...(names ? { extraNames: names } : {})}
            {...(tagsParam ? { placeholder: 'например: "без Преимущества"' } : {})}
            value={(m.value as { expr?: string } | undefined)?.expr ?? ''}
            onChange={expr => onChange(d => { d.value = { expr }; })}
          />
        </Field>
      )}
<StagePick
        stages={isRoll ? [] : paramStages(effect?.params, String(m.param ?? ''))}
        value={m.stage as string | undefined}
        onChange={stage => onChange(d => { if (stage === undefined) delete d.stage; else d.stage = stage; })}
      />
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
            <TagsField
              system={system}
              value={(m.tags as string[] | undefined)}
              empty="любой бросок"
              onChange={tags => onChange(d => { const list = tags.filter((t): t is string => typeof t === 'string'); if (list.length) d.tags = list; else delete d.tags; })}
            />
          </Field>
          <Field label="С любой из меток" hint="Хватит одной из них. Пусто — не смотрим.">
            <TagsField
              system={system}
              value={(m.anyTags as string[] | undefined)}
              empty="не смотрим"
              onChange={tags => onChange(d => { const list = tags.filter((t): t is string => typeof t === 'string'); if (list.length) d.anyTags = list; else delete d.anyTags; })}
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
  const words = (raw: unknown): string[] => (Array.isArray(raw) ? raw.map(String) : []);

  return (
    <>
      <Field label="По меткам" hint="Пусто — по любой метке.">
        <TagsField
          system={system} value={words(m.anyTags)} known={known} empty="любая метка"
          onChange={next => onChange(d => { const list = next.filter((t): t is string => typeof t === 'string'); if (list.length) d.anyTags = list; else delete d.anyTags; })}
        />
      </Field>
      <Field label="Кроме меток">
        <TagsField
          system={system} value={words(m.notTags)} known={known} empty="+ кроме метки…"
          onChange={next => onChange(d => { const list = next.filter((t): t is string => typeof t === 'string'); if (list.length) d.notTags = list; else delete d.notTags; })}
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

function Concern({ system, modifier, names, onChange }: {
  system: System;
  modifier: Loose;
  names: Map<string, string> | undefined;
  onChange: (change: (draft: Loose) => void) => void;
}) {
  const call = String(modifier.call ?? ROLL_CALL);
  const params = new Map((system.effects[call]?.params ?? []).map(p => [p.key, p.label ?? p.key]));
  const words: Record<string, string> = { бросающий: 'бросает носитель', против: 'бросают против носителя' };
  const holders = callNamesOf(system, call).sheets.map(name => [name, words[name] ?? `«${params.get(name) ?? name}» — носитель`] as const);
  return (
    <div className="row">
      <ConditionField
        value={(modifier.if as { expr?: string } | undefined)?.expr}
        onChange={expr => onChange(d => { if (expr) d.if = { expr }; else delete d.if; })}
        system={system}
        {...(names ? { names } : {})}
        holders={holders}
        where="правка · только если"
        placeholder="например: @носитель.ярость > 0"
        holderHint="Носитель — лист, на котором висит эта правка."
      />
    </div>
  );
}
