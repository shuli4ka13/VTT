import { useWorld, freeId, slugOf } from '../../store/world.ts';
import { useUsage, usersOf } from './usage.ts';
import { Columns, List, ListItem, ListGroup } from '../../ui/layout.tsx';
import {
  Card, CardHead, Field, Input, Select, Button, Empty, Fold, Verdict, Chip, DangerButton, NumInput,
} from '../../ui/primitives.tsx';
import { FormulaInput, formulaAsLabels } from '../../ui/formula.tsx';
import { compile } from '@vtt/engine/formula';
import { DonorPalette } from './donors.tsx';
import { newField } from './factory.ts';
import { GroupEditor } from './group-editor.tsx';
import { groupTree, effectiveDefault, sameValue } from './groups.ts';
import type { GroupNode } from './groups.ts';
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
] as const;

export function SheetTab() {
  const system = useWorld(s => s.system);
  const activeTag = useWorld(s => s.activeFieldTag);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const activeGroup = useWorld(s => s.activeGroupName);

  const tree = groupTree(system);
  const active = system.fields.find(f => f.tag === activeTag) ?? null;

  const addField = (group: string) => {
    const made = newField(system, group);
    editSystem(draft => { draft.fields.push(made.value); });
    pick({ activeFieldTag: made.key, activeGroupName: null });
  };

  const branch = (node: GroupNode, depth: number) => (
    <div key={node.name} className={depth ? 'list__nest' : undefined}>
      <ListGroup>
        <button
          type="button"
          className={`list__group-pick${node.name === activeGroup && !active ? ' list__group-pick--active' : ''}`}
          title="настройки блока: значение по умолчанию и подгруппы"
          onClick={() => pick({ activeGroupName: node.name, activeFieldTag: null })}
        >{node.name}</button>
      </ListGroup>
      {node.fields.map(field => (
        <ListItem
          key={field.tag}
          name={field.label}
          meta={metaOf(system, field.value)}
          active={field.tag === activeTag}
          onClick={() => pick({ activeFieldTag: field.tag, activeGroupName: null })}
        />
      ))}
      <Button size="sm" variant="ghost" wide onClick={() => addField(node.name)}>
        + поле в «{node.name}»
      </Button>
      {node.children.map(child => branch(child, depth + 1))}
    </div>
  );

  return (
    <Columns
      left={{
        head: 'Блоки и поля',
        tools: <Button size="sm" onClick={() => addField('Новый блок')}>+ блок</Button>,
        body: tree.length === 0
          ? <Empty
              title="Лист пуст"
              hint="Заведите первое поле кнопкой выше — или возьмите готовый блок из образцовой системы справа."
            />
          : <List>{tree.map(node => branch(node, 0))}</List>,
      }}
      main={{
        head: active ? 'Поле' : activeGroup ? 'Блок' : undefined,
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
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);

  const edit = (change: (draft: FieldModel) => void) => {
    editSystem(draft => {
      const target = draft.fields.find(f => f.tag === field.tag);
      if (target) change(target);
    });
  };

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
                  && !new RegExp(`#${field.tag}(?![\\p{L}\\p{N}_])`, 'u').test(world);
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
          <Field label="Блок">
            <Input value={field.group ?? ''} onChange={next => edit(draft => { draft.group = next; })} />
          </Field>
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
            <Field label="Тип">
              <Select
                value={field.value.type}
                options={TYPES}
                onChange={type => edit(draft => {
                  if (draft.value.kind !== 'stored') return;
                  draft.value.type = type;
                  draft.value.default = type === 'number' ? 0 : type === 'boolean' ? false : '';
                })}
              />
            </Field>
            <Field label="По умолчанию">
              {field.value.type === 'number' ? (
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
        </Card>
      ) : null}

      {field.value.kind === 'table' ? (
        <Card>
          <CardHead title="Значение берётся из таблицы" />
          <div className="row">
            <Field label="Таблица" needed={!field.value.table}>
              <Select
                value={field.value.table}
                options={[['', '— выберите —'], ...Object.entries(system.tables ?? {})
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

const metaOf = (system: System, value: FieldValue) =>
  value.kind === 'stored' ? `вводит игрок · ${value.type}`
    : value.kind === 'formula' ? (value.expr ? formulaAsLabels(system, value.expr) : 'формула не дописана')
      : `таблица «${value.table || '—'}»`;

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

