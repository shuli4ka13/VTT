import { choiceTables } from '@vtt/engine/model/tables';
import { useWorld, freeId, slugOf } from '../../store/world.ts';
import { useUsage, usersOf } from './usage.ts';
import { LiveValue } from './live-value.tsx';
import { optionsOf } from '@vtt/engine/model/lists';
import { FieldPreview } from './field-preview.tsx';
import { Starters } from './starters.tsx';
import { CONTROLS } from '../../sheet/controls/index.tsx';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import {
  Card, CardHead, Field, Input, Select, Button, Empty, Fold, Verdict, Chip, DangerButton, NumInput,
} from '../../ui/primitives.tsx';
import { FormulaInput, formulaAsLabels } from '../../ui/formula.tsx';
import { compile } from '@vtt/engine/formula';
import { DonorPalette } from './donors.tsx';
import { newField } from './factory.ts';
import { GroupEditor } from './group-editor.tsx';
import { BlockPick } from './block-pick.tsx';
import { effectiveDefault, sameValue } from './groups.ts';
import { blockTree, BlockBranches } from './block-tree.tsx';
import type { Field as FieldModel, FieldValue, System } from '@vtt/schema';

const KINDS = [
  ['stored', 'вводит игрок'],
  ['formula', 'считается формулой'],
  ['table', 'берётся из таблицы'],
] as const;

const TYPES = [
  ['number', 'число'],
  ['text', 'текст'],
  ['boolean', 'да / нет'],
  ['link', 'из таблицы'],
] as const;

const LINK = 'link';

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


  return (
    <Columns
      left={{
        head: 'Блоки и поля',
        tools: <Button size="sm" onClick={() => addField('Новый блок')}>+ блок</Button>,
        body: tree.length === 0
          ? <Empty
              title="Лист пуст"
              hint="Начните с готового блока — его поля и формулы приедут целиком. Или заведите поле сами кнопкой выше."
              action={<Starters />}
            />
          : (
            <List>
              <BlockBranches
                nodes={tree}
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
      right={{ head: 'Готовое из образцов', body: <DonorPalette kind="blocks" /> }}
    />
  );
}

function FieldEditor({ field, system }: { field: FieldModel; system: System }) {
  const compendium = useWorld(s => s.compendium);
  const editSystem = useWorld(s => s.editSystem);
  const editField = useWorld(s => s.editField);
  const pick = useWorld(s => s.pick);

  const edit = (change: (draft: FieldModel) => void) => editField(field.tag, change);

  const setKind = (kind: FieldValue['kind']) => edit(draft => {

    draft.value = kind === 'stored' ? { kind: 'stored', type: 'number', default: 0 }
      : kind === 'formula' ? { kind: 'formula', expr: '' }
        : { kind: 'table', table: '', arg: '' };
  });

  const usage = useUsage();
  const users = usersOf(usage, 'field', field.tag, system);
  const preset = effectiveDefault(system, field.group ?? 'Без блока');
  const follows = preset !== undefined && sameValue(field.value, preset);

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
          <Field label="Где лежит" hint={field.desk ? 'Одно значение на всю комнату: кость эскалации, пул Страха, часы. В формулах эффектов — @стол.…' : undefined}>
            <Select
              value={field.desk ? 'desk' : 'sheet'}
              options={[['sheet', 'на листе персонажа'], ['desk', 'на столе — одно на всю комнату']] as const}
              onChange={next => edit(draft => { if (next === 'desk') draft.desk = true; else delete draft.desk; })}
            />
          </Field>
          <Field label="Блок">
            <BlockPick
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

          {(field.control === 'choice' || field.control === 'ring') && !field.optionsFrom ? (
            <Field label="Свои варианты" hint="Короткий список прямо здесь. Если варианты — строки таблицы, выберите тип значения «из таблицы»." needed={!field.options?.length}>
              <div className="stack stack--tight">
                {(
                  <>
                    {(field.options ?? []).map((option, at) => (
                      <div className="pair" key={at}>
                        <Input
                          value={String(option.value)} placeholder="0.5" mono
                          onChange={next => edit(draft => {
                            const num = Number(next);
                            draft.options![at]!.value = next !== '' && Number.isFinite(num) ? num : next;
                          })}
                        />
                        <Input
                          value={option.label} placeholder="как назвать"
                          onChange={next => edit(draft => { draft.options![at]!.label = next; })}
                        />
                        <Button size="sm" variant="ghost" title="убрать вариант" onClick={() => edit(draft => {
                          draft.options!.splice(at, 1);
                          if (!draft.options!.length) delete draft.options;
                        })}>×</Button>
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => edit(draft => {
                      (draft.options ??= []).push({ value: draft.options.length, label: '' });
                    })}>+ вариант</Button>
                  </>
                )}
              </div>
            </Field>
          ) : null}

          <Field label="Откуда значение">
            <Select value={field.value.kind} options={KINDS} onChange={setKind} />
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
            <Field label="Тип" hint={field.optionsFrom ? 'Игрок выбирает строку таблицы; формулы идут по ней дальше: @поле.колонка.' : undefined}>
              <Select
                value={field.optionsFrom ? LINK : field.value.type}
                options={TYPES}
                onChange={type => edit(draft => {
                  if (draft.value.kind !== 'stored') return;
                  if (type === LINK) {
                    const first = choiceTables(system)[0];
                    if (!first) return;
                    draft.optionsFrom = first[0];
                    delete draft.options;
                    draft.value.type = first[1].key === 'number' ? 'number' : 'text';
                    draft.value.default = '';
                    return;
                  }
                  delete draft.optionsFrom;
                  draft.value.type = type as 'number' | 'text' | 'boolean';
                  draft.value.default = type === 'number' ? 0 : type === 'boolean' ? false : '';
                })}
              />
            </Field>
            {field.optionsFrom ? (
              <Field label="Из какой таблицы">
                <div className="inline inline--tight">
                  <Select
                    value={field.optionsFrom}
                    options={choiceTables(system).map(([key, list]) => [key, list.label || key] as const) as never}
                    onChange={next => edit(draft => {
                      if (draft.value.kind !== 'stored') return;
                      draft.optionsFrom = next;
                      draft.value.type = system.tables?.[next]?.key === 'number' ? 'number' : 'text';
                      draft.value.default = '';
                    })}
                  />
                  <Button size="sm" variant="ghost" onClick={() => pick({ activeTab: 'dictionaries', activeTableId: field.optionsFrom ?? null })}>
                    открыть таблицу →
                  </Button>
                </div>
              </Field>
            ) : null}
            <Field label="По умолчанию">
              {field.optionsFrom ? (
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
          {field.optionsFrom ? (
            <p className="faint">
              Строки: {optionsOf(system, field).map(o => o.label).join(', ') || 'таблица пока пустая'}
            </p>
          ) : null}
          {field.value.type === 'number' && !field.optionsFrom ? (

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

      {field.value.kind === 'formula' ? (
        <Card>
          <CardHead title="Значение считает движок" />
          <Field label="Правило">
            <FormulaInput
              system={system}
              value={field.value.expr}
              onChange={expr => edit(draft => { if (draft.value.kind === 'formula') draft.value.expr = expr; })}
            />
          </Field>
          <LiveValue system={system} compendium={compendium} tag={field.tag} source={field.value.expr} />
        </Card>
      ) : null}

      {field.value.kind === 'table' ? (
        <Card>
          <CardHead title="Значение берётся из таблицы" />
          <div className="row">
            <Field label="Таблица" needed={!field.value.table}>
              <Select
                value={field.value.table}
                options={[['', '— какая таблица —'], ...Object.entries(system.tables ?? {})
                  .map(([key, table]) => [key, table.label ?? key] as const)] as never}
                onChange={next => edit(draft => { if (draft.value.kind === 'table') draft.value.table = next; })}
              />
            </Field>
          </div>
          <Field label="Аргумент" needed={!field.value.arg}>
            <FormulaInput
              system={system}
              value={field.value.arg}
              onChange={arg => edit(draft => { if (draft.value.kind === 'table') draft.value.arg = arg; })}
              placeholder="например: @уровень"
            />
          </Field>
          <LiveValue system={system} compendium={compendium} tag={field.tag} source={field.value.arg} />
        </Card>
      ) : null}

      <Card>
        <CardHead title="По этому полю бросают" />
        <div className="inline">
          <Button
            size="sm"
            variant={field.roll ? 'primary' : undefined}
            onClick={() => edit(draft => {
              draft.roll = draft.roll ? undefined : { label: `Проверка: ${draft.label}` };
            })}
          >
            {field.roll ? 'Броски включены' : 'Включить броски'}
          </Button>
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
  if (field.desk) return `на столе · ${TYPE_WORDS[(field.value as { type: string }).type] ?? ''}`;
  const from = field.optionsFrom ? system.tables?.[field.optionsFrom]?.label || field.optionsFrom : '';
  const shape = field.control ? CONTROLS[field.control].toLowerCase() : '';
  if (from) return `выбирает игрок · из «${from}»${shape ? ` · ${shape}` : ''}`;
  const value = field.value as { type: string };
  return `вводит игрок · ${TYPE_WORDS[value.type] ?? value.type}${shape ? ` · ${shape}` : ''}`;
};

const metaOf = (system: System, value: FieldValue, field?: FieldModel) =>
  value.kind === 'stored' ? (field ? storedWords(system, field) : `вводит игрок · ${TYPE_WORDS[value.type] ?? value.type}`)
    : value.kind === 'formula' ? (value.expr ? `= ${formulaAsLabels(system, value.expr)}` : '= формула не дописана')
      : `= таблица «${system.tables?.[value.table]?.label || value.table || '—'}»`;

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

