import { choiceTables } from '@vtt/engine/model/tables';
import { useWorld, freeId, slugOf, useBook } from '../../store/world.ts';
import { useUsage, usersOf } from './usage.ts';
import { LiveValue } from './live-value.tsx';
import { optionsOf, choiceTableOf } from '@vtt/engine/model/lists';
import { kindsFor } from '@vtt/engine/words/kinds';
import { FieldPreview } from './field-preview.tsx';
import { CONTROLS } from '../../sheet/controls/index.tsx';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { useLookupPane } from './lookup-panel.tsx';
import {
  Card, CardHead, Field, Input, Select, Button, Empty, Fold, Verdict, Chip, DangerButton, NumInput,
} from '../../ui/primitives.tsx';
import { FormulaInput, formulaAsLabels } from '../../ui/formula.tsx';
import { compile } from '@vtt/engine/formula';
import { DonorPalette } from './donors.tsx';
import { useFreshKeys } from '../../store/fresh.ts';
import { newField } from './factory.ts';
import { GroupEditor } from './group-editor.tsx';
import { BlockPick } from './block-pick.tsx';
import { effectiveDefault, sameValue } from './groups.ts';
import { blockTree, BlockBranches } from './block-tree.tsx';
import type { Field as FieldModel, FieldValue, System } from '@vtt/schema';
import { RollTagsPick } from './roll-tags-pick.tsx';
import { dieEntries } from './rules/dice-section.tsx';
import { tableCallOf, writeTableCall } from '@vtt/engine/model/amounts';
import type { TableCall } from '@vtt/engine/model/amounts';

const KINDS = [
  ['stored', 'вводит игрок'],
  ['formula', 'считается формулой'],
  ['table', 'берётся из таблицы'],
] as const;

type ValueMode = typeof KINDS[number][0];

const modeOf = (value: FieldValue): ValueMode =>
  (value.kind === 'formula' && tableCallOf(value.expr) ? 'table' : value.kind);

const TYPES = kindsFor('field');

export function SheetTab() {
  const system = useWorld(s => s.system);
  const activeTag = useWorld(s => s.activeFieldTag);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const activeGroup = useWorld(s => s.activeGroupName);

  const tree = blockTree<FieldModel>(system, system.fields, field => field.group);
  const active = system.fields.find(f => f.tag === activeTag) ?? null;

  const addField = (group: string) => {
    const made = newField(system, group);
    editSystem(draft => { draft.fields.push(made.value); });
    pick({ activeFieldTag: made.key, activeGroupName: null });
  };


  const right = useLookupPane({ head: 'Готовое из образцов', body: <DonorPalette kind="blocks" /> });
  const freshFields = useFreshKeys('field');

  return (
    <Columns
      left={{
        head: 'Блоки и поля',
        tools: <Button size="sm" onClick={() => addField('Новый блок')}>+ блок</Button>,
        body: tree.length === 0
          ? <Empty title="Лист пуст" hint="Возьмите готовый кусок справа или заведите поле кнопкой «+ блок»." />
          : (
            <List>
              <BlockBranches
                list="sheet"
                nodes={tree}
                isActive={field => field.tag === activeTag}
                isFresh={field => freshFields.has(field.tag)}
                activeBlock={active ? null : activeGroup}
                onPickBlock={name => pick({ activeGroupName: name, activeFieldTag: null })}
                addTo={addField}
                render={field => (
                  <ListItem
                    key={field.tag}
                    icon={field.value.kind === 'stored' ? undefined : '='}
                    name={field.label}
                    meta={metaOf(system, field.value, field)}
                    active={field.tag === activeTag}
                    fresh={freshFields.has(field.tag)}
                    onClick={() => pick({ activeFieldTag: field.tag, activeGroupName: null })}
                  />
                )}
              />
            </List>
          ),
      }}
      main={{
        body: active
          ? <FieldEditor field={active} system={system} />
          : activeGroup
            ? <GroupEditor name={activeGroup} system={system} />
            : <Empty
                title="Выберите поле слева"
                hint="Или добавьте новое. Поле — это то, что бывает у персонажа: характеристика, навык, ресурс. Клик по заголовку блока откроет его настройки."
              />,
      }}
      right={right}
    />
  );
}

function FieldEditor({ field, system }: { field: FieldModel; system: System }) {
  const compendium = useBook();
  const editSystem = useWorld(s => s.editSystem);
  const editField = useWorld(s => s.editField);
  const pick = useWorld(s => s.pick);

  const edit = (change: (draft: FieldModel) => void) => editField(field.tag, change);

  const setKind = (kind: ValueMode) => edit(draft => {
    draft.value = kind === 'stored' ? { kind: 'stored', type: 'number', default: 0 }
      : kind === 'formula' ? { kind: 'formula', expr: '' }
        : { kind: 'formula', expr: writeTableCall({ table: Object.keys(system.tables ?? {})[0] ?? '', arg: '', column: null }) };
  });
  const lookup = field.value.kind === 'formula' ? tableCallOf(field.value.expr) : null;
  const from = choiceTableOf(field);
  const setLookup = (change: Partial<TableCall>) => edit(draft => {
    const now = draft.value.kind === 'formula' ? tableCallOf(draft.value.expr) : null;
    if (now) draft.value = { kind: 'formula', expr: writeTableCall({ ...now, ...change }) };
  });

  const usage = useUsage();
  const users = usersOf(usage, 'field', field.tag, system);
  const preset = effectiveDefault(system, field.group ?? 'Без блока');
  const follows = preset !== undefined && sameValue(field.value, preset);

  if (field.cell) {
    const table = system.tables?.[field.cell.table];
    const column = table?.columns?.find(c => c.key === field.cell!.column);
    return (
      <Card>
        <CardHead
          title={field.label || field.tag}
          sub={`Колонка «${column?.label ?? field.cell.column}» таблицы «${table?.label ?? field.cell.table}» — правится там, сразу для всех строк.`}
          actions={<Button size="sm" onClick={() => pick({ activeTab: 'dictionaries', activeTableId: field.cell!.table })}>Открыть таблицу</Button>}
        />
        {field.value.kind === 'formula'
          ? <LiveValue system={system} compendium={compendium} tag={field.tag} source={field.value.expr} />
          : null}
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHead
          title={field.label || 'Без имени'}
          actions={
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { draft.fields = draft.fields.filter(f => f.tag !== field.tag); });
              pick({ activeFieldTag: null });
            }}>
              Удалить
            </DangerButton>
          }
        />

        <div className="row">
          <Field label="Название">
            <Input
              value={field.label}
              onChange={next => {

                const state = useWorld.getState();
                const world = JSON.stringify({ s: state.system, c: state.compendium, sh: state.sheets });
                const virgin = (/^field(_\d+)?$/.test(field.tag) || field.tag === slugOf(field.label))
                  && world.split(`"${field.tag}"`).length - 1 <= 1
                  && !new RegExp(`[@#]${field.tag}(?![\\p{L}\\p{N}_])`, 'u').test(world);
                if (virgin && slugOf(next)) {
                  const fresh = freeId(
                    state.system.fields.filter(f => f.tag !== field.tag).map(f => f.tag), next);
                  editSystem(draft => {
                    const target = draft.fields.find(f => f.tag === field.tag);
                    if (target) { target.label = next; target.tag = fresh; }
                  });
                  pick({ activeFieldTag: fresh });
                } else {
                  edit(draft => { draft.label = next; });
                }
              }}
            />
          </Field>
          <Field label="Где лежит" hint={field.lives === 'desk' ? 'Одно значение на всю комнату: кость эскалации, пул Страха, часы. В формулах эффектов — @стол.…'
            : field.lives === 'group' ? 'Одно значение на группу листов: общий счётчик отряда, Жара банды. Лист без группы хранит своё.' : undefined}>
            <Select
              value={field.lives ?? 'sheet'}
              options={[['sheet', 'на листе персонажа'], ['group', 'в группе — одно на отряд или банду'], ['desk', 'на столе — одно на всю комнату']] as const}
              onChange={next => edit(draft => { if (next === 'sheet') delete draft.lives; else draft.lives = next; })}
            />
          </Field>
          <Field label="Блок">
            <BlockPick
              of="fields"
              system={system}
              value={field.group}
              onChange={next => edit(draft => {
                if (next) draft.group = next; else delete draft.group;
              })}
            />
          </Field>
          {field.value.kind === 'stored' ? (
            <Field label="Как выглядит на листе" hint="Обычное поле подойдёт всегда; остальное — для счётчиков и запасов.">
              <Select
                value={field.control ?? ''}
                options={[['', 'обычное поле'],
                  ...(Object.keys(CONTROLS) as (keyof typeof CONTROLS)[])
                    .map(key => [key, CONTROLS[key]] as const)] as never}
                onChange={next => edit(draft => {
                  if (next) draft.control = next as typeof draft.control; else delete draft.control;
                })}
              />
              <FieldPreview key={`${field.tag}:${field.control ?? ''}`} field={field} system={system} compendium={compendium} />
            </Field>
          ) : null}

          <Field label="Откуда значение">
            <Select value={modeOf(field.value)} options={KINDS} onChange={setKind} />
          </Field>
        </div>
        {follows ? (
          <p className="faint">
            Значение совпадает с умолчанием блока и поменяется вместе с ним.
            Отредактируйте его здесь — и поле отвяжется.
          </p>
        ) : null}
      </Card>

      {field.value.kind === 'stored' ? (
        <Card>
          <CardHead title="Значение вводит игрок" />
          <div className="row">
            <Field label="Тип" hint={from ? 'Игрок выбирает строку таблицы; формулы идут по ней дальше: @поле.колонка.' : undefined}>
              <Select
                value={field.value.type}
                options={TYPES as never}
                onChange={type => edit(draft => {
                  if (draft.value.kind !== 'stored') return;
                  if (type === 'choice') {
                    const first = choiceTables(system)[0];
                    if (!first) return;
                    draft.value = { kind: 'stored', type: 'choice', from: first[0], default: '' };
                    return;
                  }
                  const next = type as 'number' | 'text' | 'boolean';
                  draft.value = { kind: 'stored', type: next, default: next === 'number' ? 0 : next === 'boolean' ? false : '' };
                })}
              />
            </Field>
            {from ? (
              <Field label="Из какой таблицы">
                <div className="inline inline--tight">
                  <Select
                    value={from}
                    options={choiceTables(system).map(([key, list]) => [key, list.label || key] as const) as never}
                    onChange={next => edit(draft => {
                      if (draft.value.kind !== 'stored') return;
                      draft.value = { kind: 'stored', type: 'choice', from: next, default: '' };
                    })}
                  />
                  <Button size="sm" variant="ghost" onClick={() => pick({ activeTab: 'dictionaries', activeTableId: from })}>
                    открыть таблицу →
                  </Button>
                </div>
              </Field>
            ) : null}
            <Field label="По умолчанию">
              {from ? (
                <Select
                  value={String(field.value.default ?? '')}
                  options={[['', '— не выбрано —'], ...optionsOf(system, field).map(o => [String(o.value), o.label] as const)] as never}
                  onChange={next => edit(draft => {
                    if (draft.value.kind !== 'stored') return;
                    const picked = optionsOf(system, field).find(o => String(o.value) === next);
                    draft.value.default = picked ? picked.value : '';
                  })}
                />
              ) : field.value.type === 'number' ? (
                <NumInput
                  value={Number(field.value.default) || 0}
                  onCommit={n => edit(draft => {
                    if (draft.value.kind === 'stored') draft.value.default = n;
                  })}
                />
              ) : (
                <Input
                  value={String(field.value.default)}
                  onChange={next => edit(draft => {
                    if (draft.value.kind !== 'stored') return;
                    draft.value.default = draft.value.type === 'boolean' ? next === 'true' : next;
                  })}
                />
              )}
            </Field>
          </div>
          {from ? (
            <p className="faint">
              Строки: {optionsOf(system, field).map(o => o.label).join(', ') || 'таблица пока пустая'}
            </p>
          ) : null}
          {field.value.type === 'number' ? (

            <div className="row">
              <Field label="Не ниже" hint="Пусто — границы нет. Число или формула."
                error={boundProblem(field.value.min, system)}>
                <BoundInput
                  value={field.value.min}
                  invalid={Boolean(boundProblem(field.value.min, system))}
                  onChange={min => edit(draft => {
                    if (draft.value.kind === 'stored') draft.value.min = min;
                  })}
                />
              </Field>
              <Field label="Не выше" hint="Потолок лечения — ссылка на поле максимума."
                error={boundProblem(field.value.max, system)}>
                <BoundInput
                  value={field.value.max}
                  invalid={Boolean(boundProblem(field.value.max, system))}
                  onChange={max => edit(draft => {
                    if (draft.value.kind === 'stored') draft.value.max = max;
                  })}
                />
              </Field>
            </div>
          ) : null}
        </Card>
      ) : null}

      {field.value.kind === 'formula' && !lookup ? (
        <Card>
          <CardHead title="Значение считает движок" />
          <Field label="Правило">
            <FormulaInput
              where={`${field.label || field.tag} · правило`}
              system={system}
              value={field.value.expr}
              onChange={expr => edit(draft => { if (draft.value.kind === 'formula') draft.value.expr = expr; })}
            />
          </Field>
          <LiveValue system={system} compendium={compendium} tag={field.tag} source={field.value.expr} />
        </Card>
      ) : null}

      {lookup ? (
        <Card>
          <CardHead title="Значение берётся из таблицы" />
          <div className="row">
            <Field label="Таблица" needed={!lookup.table}>
              <Select
                value={lookup.table}
                options={[['', '— какая таблица —'], ...Object.entries(system.tables ?? {})
                  .map(([key, table]) => [key, table.label ?? key] as const)] as never}
                onChange={next => setLookup({ table: next, column: null })}
              />
            </Field>
            {(system.tables?.[lookup.table]?.columns ?? []).length > 1 ? (
              <Field label="Колонка">
                <Select
                  value={lookup.column ?? 'value'}
                  options={(system.tables?.[lookup.table]?.columns ?? []).map(c => [c.key, c.label || c.key] as const) as never}
                  onChange={next => setLookup({ column: next === 'value' ? null : next })}
                />
              </Field>
            ) : null}
          </div>
          <Field label="По чему искать строку" needed={!lookup.arg.trim()}>
            <FormulaInput
              where={`${field.label || field.tag} · по чему искать`}
              system={system}
              value={lookup.arg}
              onChange={arg => setLookup({ arg })}
              placeholder="например: @уровень"
            />
          </Field>
          <LiveValue system={system} compendium={compendium} tag={field.tag} source={field.value.kind === 'formula' ? field.value.expr : ''} />
        </Card>
      ) : null}

      <Card>
        <CardHead title="По этому полю бросают" />
        <div className="inline">
          <Button
            size="sm"
            variant={field.roll ? 'primary' : undefined}
            onClick={() => edit(draft => {
              const first = dieEntries(system)[0]?.[0];
              draft.roll = draft.roll ? undefined : { label: `Проверка: ${draft.label}`, ...(first ? { die: { constant: first } } : {}), bonus: { expr: `@${draft.tag}` } };
            })}
          >
            {field.roll ? 'Броски включены' : 'Включить броски'}
          </Button>
          {field.roll ? (
            <Select
              value={field.roll.die?.constant ?? ''}
              options={[['', '— какой костью —'], ...dieEntries(system).map(([key, c]) => [key, c.label || key] as const)] as never}
              onChange={key => edit(draft => {
                if (!draft.roll) return;
                if (key) draft.roll.die = { constant: key }; else delete draft.roll.die;
              })}
            />
          ) : null}
          {field.roll ? (
            <Select
              value={field.roll.count ? 'pool' : 'bonus'}
              options={[['bonus', 'поле — прибавка к кости'], ['pool', 'поле — число костей']] as const}
              onChange={next => edit(draft => {
                if (!draft.roll) return;
                const self = { expr: `@${draft.tag}` };
                if (next === 'pool') { draft.roll.count = self; delete draft.roll.bonus; } else { draft.roll.bonus = self; delete draft.roll.count; }
              })}
            />
          ) : null}
          {field.roll ? (
            <RollTagsPick
              system={system}
              value={field.roll.tags}
              onChange={tags => edit(draft => {
                if (!draft.roll) return;
                if (tags.length) draft.roll.tags = tags; else delete draft.roll.tags;
              })}
            />
          ) : null}
        </div>
      </Card>

      <Fold title="Кто на это поле смотрит" count={users.length}>
        {users.length === 0
          ? <span className="faint">Никто. Поле можно удалить, ничего не сломав.</span>
          : (
            <>
              <Verdict tone="warn">
                Удаление поля оборвёт эти ссылки — их придётся переписать.
              </Verdict>
              <div className="inline inline--tight">
                {users.map(user => <Chip key={user}>{user}</Chip>)}
              </div>
            </>
          )}
      </Fold>
    </>
  );
}

const TYPE_WORDS: Record<string, string> = { number: 'число', text: 'текст', boolean: 'да / нет' };

const storedWords = (system: System, field: FieldModel): string => {
  if (field.lives === 'group') return `в группе · ${TYPE_WORDS[(field.value as { type: string }).type] ?? ''}`;
  if (field.lives === 'desk') return `на столе · ${TYPE_WORDS[(field.value as { type: string }).type] ?? ''}`;
  const table = choiceTableOf(field);
  const from = table ? system.tables?.[table]?.label || table : '';
  const shape = field.control ? CONTROLS[field.control].toLowerCase() : '';
  if (from) return `выбирает игрок · из «${from}»${shape ? ` · ${shape}` : ''}`;
  const value = field.value as { type: string };
  return `вводит игрок · ${TYPE_WORDS[value.type] ?? value.type}${shape ? ` · ${shape}` : ''}`;
};

const metaOf = (system: System, value: FieldValue, field?: FieldModel) => {
  if (value.kind === 'stored') return field ? storedWords(system, field) : `вводит игрок · ${TYPE_WORDS[value.type] ?? value.type}`;
  const lookup = tableCallOf(value.expr);
  if (lookup) return `= таблица «${system.tables?.[lookup.table]?.label || lookup.table || '—'}»`;
  return value.expr ? `= ${formulaAsLabels(system, value.expr)}` : '= формула не дописана';
};

export function boundProblem(bound: number | string | undefined, system: System): string | undefined {
  if (bound === undefined || typeof bound === 'number') return undefined;
  const text = bound.trim();
  if (!text) return undefined;
  try {
    for (const dep of compile(text).deps) {
      if (!system.fields.some(f => f.tag === dep)) return `поля «${dep}» в системе нет`;
    }
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

function BoundInput({ value, invalid, onChange }: {
  value: number | string | undefined;
  invalid?: boolean;
  onChange: (next: number | string | undefined) => void;
}) {
  const commit = (raw: string) => {
    const text = raw.trim();
    if (!text) return onChange(undefined);
    onChange(/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text);
  };
  return (
    <Input
      value={value === undefined ? '' : String(value)}
      mono
      invalid={invalid}
      placeholder="число или формула"
      onChange={commit}
    />
  );
}

