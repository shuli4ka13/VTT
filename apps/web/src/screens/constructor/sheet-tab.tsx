// Вкладка «Лист»: какие поля бывают и как они считаются.
//
// Слева — блоки и поля, в центре — редактор выбранного поля, справа —
// палитра доноров. Правки чистые: ни одна из них ничего не вычисляет.
//
// Инвариант, который здесь легко сломать: у поля есть машинный ТЕГ и
// человеческий ЛЕЙБЛ. Тег рождается при создании поля и дальше неизменен,
// формулы ссылаются только на него. Переименование лейбла не должно ломать
// ничего — это критерий приёмки №2.

import { useWorld, fieldsByGroup, freeId, slugOf } from '../../store/world.ts';
import { Columns, List, ListItem, ListGroup } from '../../ui/layout.tsx';
import {
  Card, CardHead, Field, Input, Select, Button, Empty, Fold, Verdict, Chip, DangerButton,
} from '../../ui/primitives.tsx';
import { FormulaInput } from '../../ui/formula.tsx';
import { compile } from '@vtt/engine/formula';
import { DonorPalette } from './donors.tsx';
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

  const groups = fieldsByGroup(system);
  const active = system.fields.find(f => f.tag === activeTag) ?? null;

  const addField = (group: string) => {
    const tag = freeId(system.fields.map(f => f.tag), 'field');
    editSystem(draft => {
      draft.fields.push({
        tag,
        label: 'Новое поле',
        group,
        value: { kind: 'stored', type: 'number', default: 0 },
      });
    });
    pick({ activeFieldTag: tag });
  };

  return (
    <Columns
      left={{
        head: 'Блоки и поля',
        tools: <Button size="sm" onClick={() => addField('Новый блок')}>+ блок</Button>,
        body: groups.length === 0
          ? <Empty
              title="Лист пуст"
              hint="Заведите первое поле кнопкой выше — или возьмите готовый блок из образцовой системы справа."
            />
          : (
            <List>
              {groups.map(([group, fields]) => (
                <div key={group}>
                  <ListGroup>{group}</ListGroup>
                  {fields.map(field => (
                    <ListItem
                      key={field.tag}
                      name={field.label}
                      meta={metaOf(field.value)}
                      active={field.tag === activeTag}
                      onClick={() => pick({ activeFieldTag: field.tag })}
                    />
                  ))}
                  <Button size="sm" variant="ghost" wide onClick={() => addField(group)}>
                    + поле в «{group}»
                  </Button>
                </div>
              ))}
            </List>
          ),
      }}
      main={{
        head: active ? 'Поле' : undefined,
        body: active
          ? <FieldEditor field={active} system={system} />
          : <Empty
              title="Выберите поле слева"
              hint="Или добавьте новое. Поле — это то, что бывает у персонажа: характеристика, навык, ресурс."
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
    // Смена способа не выбрасывает прежнюю настройку молча: то, что нельзя
    // сохранить, честно заменяется заготовкой того же смысла.
    draft.value = kind === 'stored' ? { kind: 'stored', type: 'number', default: 0 }
      : kind === 'formula' ? { kind: 'formula', expr: '' }
        : { kind: 'table', table: '', arg: '' };
  });

  const users = whoUses(system, field.tag);

  return (
    <>
      <Card>
        <CardHead
          title={field.label || 'Без имени'}
          badge={<span className="chip mono" title="машинный тег — на него ссылаются формулы">#{field.tag}</span>}
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
                // Пока поле девственно (авто-тег или тег, выведенный из
                // прежнего названия, и ни одной ссылки в мире) — тег следует
                // за названием: назвали «Урон» → формулы говорят #урон.
                // Появилась первая ссылка — тег замерзает навсегда (критерий №2).
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
              <Input
                value={String(field.value.default)}
                onChange={next => edit(draft => {
                  if (draft.value.kind !== 'stored') return;
                  draft.value.default = draft.value.type === 'number' ? Number(next) || 0
                    : draft.value.type === 'boolean' ? next === 'true' : next;
                })}
              />
            </Field>
          </div>
          {field.value.type === 'number' ? (
            // Границы — свойство САМОГО поля, не эффектов: «не ниже нуля,
            // не выше максимума» — природа ресурса. Движок зажимает каждое
            // применение; эффектам объявлять нечего. Число или формула-ссылка
            // на поле максимума.
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
              placeholder="например: #level"
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

// ── вспомогательное ─────────────────────────────────────────────────────

const metaOf = (value: FieldValue) =>
  value.kind === 'stored' ? `вводит игрок · ${value.type}`
    : value.kind === 'formula' ? value.expr || 'формула не дописана'
      : `таблица «${value.table || '—'}»`;

/**
 * Кто ссылается на тег. Собирается в одном месте намеренно: забытое место
 * означало бы разрешённое удаление и висячую ссылку — ту самую, из-за которой
 * в черновике бонусы «никуда не резолвились».
 */
/**
 * Приговор границе — тем же судом, что и формулам: в режиме автора значений
 * нет, есть только разбор. Мусор («------», опечатка в теге) виден здесь,
 * при вводе, а не роняет удар за столом. Промежуточное состояние набора
 * («#ма» на полпути к «#макс») — тоже приговор, но набор он не блокирует:
 * данные пишутся как есть, красная строка честно ждёт, пока допишут.
 */
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

/** Граница поля: число хранится числом, формула — строкой, пусто — undefined. */
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
      placeholder="число или #поле"
      onChange={commit}
    />
  );
}

function whoUses(system: System, tag: string): string[] {
  const marker = new RegExp(`#${tag}(?![\\p{L}\\p{N}_])`, 'u');
  const found: string[] = [];

  for (const field of system.fields) {
    if (field.tag === tag) continue;
    const source = field.value.kind === 'formula' ? field.value.expr
      : field.value.kind === 'table' ? field.value.arg : '';
    if (marker.test(source)) found.push(`поле «${field.label}»`);
  }

  for (const [id, effect] of Object.entries(system.effects)) {
    const text = JSON.stringify(effect);
    if (marker.test(text) || text.includes(`"tag":"${tag}"`)) {
      found.push(`эффект «${effect.label ?? id}»`);
    }
  }

  return found;
}
