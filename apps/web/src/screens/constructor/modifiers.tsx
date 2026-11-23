import type { System, Modifier, Stage } from '@vtt/schema';
import { paramStages, targetStages, targets, installMethod, recipesToInstall, tagsOf, tagTablesOf, listOf as rowsFrom, amountParamOf, calledOf, ROLL_CALL, CALL_WORDS, placesMatching, wordFits, cancels, callNamesOf, holderConditionOf, NAMES } from '@vtt/engine';
import { pathSaid } from '../../ui/formula-labels.ts';
import { modifierSentence, rowNamesOf, inputNamesOf, targetLabel } from './modifier-words.ts';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Card, CardHead, Field, Input, Select, Button, DangerButton } from '../../ui/primitives.tsx';
import { WhileWhenRow, WhileWhenEmpty } from './effects/while-when.tsx';
import { FormulaInput } from '../../ui/formula.tsx';
import { TagsField } from './tags-field.tsx';
import { RollsPick } from './rolls-pick.tsx';
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

const NUMBER_GROUP = 'число — складывается';
const WORD_GROUP = 'слово из «Правил» — одно на бросок';
const WORD_GROUP_STACKS = 'слово из «Правил» — считается, как задано там';
const MORE_GROUP = 'ещё';

const ROLL_PARAMS = [
  ['count', CALL_WORDS.roll.params.count, NUMBER_GROUP],
  ['bonus', CALL_WORDS.roll.params.bonus, NUMBER_GROUP],
  ['threshold', CALL_WORDS.roll.params.threshold, NUMBER_GROUP],
  ['edits', CALL_WORDS.roll.params.edits, WORD_GROUP],
  ['tags', CALL_WORDS.roll.params.tags, MORE_GROUP],
] as const;

const rollParams = (system: System) => {
  const words = Object.values(system.roll_edits ?? {}).some(edit => edit.stacks) ? WORD_GROUP_STACKS : WORD_GROUP;
  return ROLL_PARAMS.map(([key, label, group]) => [key, label, group === WORD_GROUP ? words : group] as const);
};

function wordHint(system: System, key: string): string {
  const dictionary = system.roll_edits ?? {};
  const word = dictionary[key];
  if (!word) return 'Как слово считается и с чем гасится — задано в «Правилах → Правки броска».';
  const name = `«${word.label || key}»`;
  const count = word.stacks
    ? `${name} считается по разу от каждого разного эффекта; копии одного эффекта — один раз.`
    : `${name} действует на бросок один раз, сколько бы эффектов его ни дали.`;
  const rivals = Object.keys(dictionary).filter(other => cancels(dictionary, key, other));
  if (!rivals.length) return count;
  const byOne = word.stacks && rivals.every(other => dictionary[other]!.stacks);
  return `${count} Встретится с ${rivals.map(other => `«${dictionary[other]!.label || other}»`).join(', ')} — погасят друг друга${byOne ? ' по одному' : ''}.`;
}

const FIT_GROUP = 'подходят этим броскам';
const MISFIT_GROUP = 'не подходят этим броскам';

function wordOptions(system: System, edits: [string, { label?: string; ops?: unknown[] }][], m: Loose): (readonly [string, string] | readonly [string, string, string])[] {
  const targeted = Boolean((m.tags as unknown[] | undefined)?.length || (m.anyTags as unknown[] | undefined)?.length);
  const matched = targeted ? placesMatching(system, { tags: m.tags, anyTags: m.anyTags }) : [];
  if (!matched.length) return edits.map(([key, e]) => [key, e.label || key] as const);
  const fits = (e: { ops?: unknown[] }) => wordFits(e as never, matched);
  return [
    ...edits.filter(([, e]) => fits(e)).map(([key, e]) => [key, e.label || key, FIT_GROUP] as const),
    ...edits.filter(([, e]) => !fits(e)).map(([key, e]) => [key, e.label || key, MISFIT_GROUP] as const),
  ];
}

const ROLL_PARAM_HINTS: Record<string, string> = {
  count: 'Складывается: каждый висящий эффект и каждая его копия дают своё число.',
  bonus: 'Складывается: каждый висящий эффект и каждая его копия дают своё число.',
  threshold: 'Складывается: каждый висящий эффект и каждая его копия дают своё число.',
  tags: 'Бросок получает метку один раз, сколько бы эффектов её ни дали.',
};

type Loose = Record<string, unknown>;

function StagePick({ system, stages, value, onChange }: {
  system: System;
  stages: readonly Stage[];
  value: string | undefined;
  onChange: (stage: string | undefined) => void;
}) {
  if (stages.length < 2 && value === undefined) return null;
  return (
    <Field label="Этап" needed={stages.length > 1 && !value}>
      <Select
        value={value ?? ''}
        options={[['', '— выберите этап —'], ...(value && !stages.some(stage => stage.key === value) ? [[value, pathSaid(system, value) ?? value] as const] : []),
          ...stages.map(stage => [stage.key, stage.label || stage.key] as const)] as never}
        onChange={stage => onChange(stage || undefined)}
      />
    </Field>
  );
}

type ModifierRowsProps = {
  fieldsOnly?: boolean;
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
                    ...(modifier.target && !valueTargets.some(t => t.tag === modifier.target) ? [[modifier.target, targetLabel(system, modifier.target, table)] as const] : []),
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
                system={system}
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
              system={system} modifier={modifier} calls={calls} edits={edits} recipes={recipes} names={inputNamesOf(system, String(modifier.call ?? ''), names)}
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
              placeholder="например: тяжёлая броня"
              ruleHint="На листе носителя. Не сошлось — правка не действует."
            />
          ) : (
            <Concern system={system} modifier={modifier as Loose} names={inputNamesOf(system, String((modifier as Loose).call ?? ''), names)} onChange={change => onEdit(draft => { change(draft[index] as Loose); })} />
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

export function AddModifiers({ add, fieldsOnly = false, fieldLabel = '+ правит поле' }: { add: ModifierAdd; fieldsOnly?: boolean; fieldLabel?: string }) {
  return (
    <>
      <Button size="sm" onClick={add.field}>
        {fieldLabel}
      </Button>
      {fieldsOnly ? null : <Button
        size="sm"
        title="Правит вызов: бросок (преимущество, прибавка) или вход эффекта (урон вдвое по огню)"
        onClick={add.call}
      >
        + правка вызова
      </Button>}
    </>
  );
}

export function ModifiersEditor({ system, modifiers, onEdit, title, empty, editSystem, table, fieldsOnly = false, fieldLabel }: ModifierRowsProps & {
  title?: string;
  fieldLabel?: string;
  empty?: { title: string; hint: string };
}) {
  const { rows, add } = useModifierRows({ system, modifiers, onEdit, editSystem, ...(table ? { table } : {}) });
  return (
    <>
      {title === ''
        ? <div className="inline"><span className="spacer" /><AddModifiers add={add} fieldsOnly={fieldsOnly} {...(fieldLabel ? { fieldLabel } : {})} /></div>
        : <CardHead title={title ?? 'Что правит'} actions={<AddModifiers add={add} fieldsOnly={fieldsOnly} {...(fieldLabel ? { fieldLabel } : {})} />} />}

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
  const sheets = new Map<string, string>([
    ...callNamesOf(system, call).sheets.map(name => [name, name] as const),
    ...(effect?.params ?? []).filter(p => p.kind === 'sheet').map(p => [p.key, p.label ?? p.key] as const),
  ]);
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
            {...(sheets.size ? { sheets } : {})}
            {...(tagsParam ? { placeholder: 'например: "без Преимущества"' } : {})}
            value={(m.value as { expr?: string } | undefined)?.expr ?? ''}
            onChange={expr => onChange(d => { d.value = { expr }; })}
          />
        </Field>
      )}
<StagePick
        system={system}
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
          <Field label="Что правим" hint={String(m.param ?? 'edits') === 'edits' ? wordHint(system, String(m.edit ?? '')) : ROLL_PARAM_HINTS[String(m.param)]}>
            <Select
              value={String(m.param ?? 'edits')}
              options={rollParams(system) as never}
              onChange={pickParam}
            />
          </Field>
          <RollsPick
            system={system}
            value={{ tags: m.tags as string[] | undefined, anyTags: m.anyTags as string[] | undefined, notTags: m.notTags as string[] | undefined }}
            onChange={(key, list) => onChange(d => { if (list.length) d[key] = list; else delete d[key]; })}
          />
          {m.param === 'edits' ? (
            <Field
              label="Какое слово" needed={!m.edit}
              hint={recipes.length ? 'Готовые механизмы приедут в словарь «Правки броска» со всеми словами.' : undefined}
            >
              <Select
                value={String(m.edit ?? '')}
                options={[['', '— выберите слово —'],
                  ...wordOptions(system, edits, m),
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
  const words: Record<string, string> = { [NAMES.roller]: 'бросает носитель', [NAMES.against]: 'бросают против носителя' };
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
        placeholder="например: носитель.ярость > 0"
        holderHint="Носитель — лист, на котором висит эта правка."
      />
    </div>
  );
}
