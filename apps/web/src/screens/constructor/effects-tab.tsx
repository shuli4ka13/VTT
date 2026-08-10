// Вкладка «Эффекты»: всё, что мир делает сам.
//
// Род эффекта задаётся тем, КОГДА он срабатывает, и жёстко определяет нагрузку:
// активируемый и триггерный несут конвейер шагов, пассивный — модификаторы.
// Род — сегментный переключатель в строке заголовка, а не три баннера во всю
// ширину: выбор делается один раз, а места занимал как отдельный экран.
//
// Чего РОДОМ не является, и это принципиально:
//   помеха и преимущество — это roll-модификатор в нагрузке пассивного;
//   «действует на всех»   — это строка в правилах комнаты, а не свойство
//                           эффекта: эффект не знает, где он подключён.

import { useWorld, effectsByCategory, freeId } from '../../store/world.ts';
import { Columns, List, ListItem, ListGroup } from '../../ui/layout.tsx';
import {
  Card, CardHead, Field, Input, Select, Button, Empty, Segmented, Verdict, Fold, Chip,
} from '../../ui/primitives.tsx';
import { StepCard, STEP_SPECS, problemOf } from './step-card.tsx';
import { ModifiersEditor } from './modifiers.tsx';
import { DonorPalette } from './donors.tsx';
import type { System, Effect, Step, Activation } from '@vtt/schema';

const ACTIVATIONS = [
  { key: 'manual' as const, label: 'Активируемый', title: 'Жмёшь сам: атака, заклинание' },
  { key: 'triggered' as const, label: 'Триггерный', title: 'Отвечает на чужое событие' },
  { key: 'passive' as const, label: 'Пассивный', title: 'Просто висит и правит цифры' },
];

const DURATIONS = [
  ['permanent', 'постоянно'],
  ['temporary', 'временно'],
  ['uses', 'на N срабатываний'],
] as const;

const STACKING = [
  ['ignore', 'второй раз ничего не делает'],
  ['refresh', 'обновляется'],
  ['stack', 'копится'],
] as const;

export function EffectsTab() {
  const system = useWorld(s => s.system);
  const activeId = useWorld(s => s.activeEffectId);
  const pick = useWorld(s => s.pick);
  const editSystem = useWorld(s => s.editSystem);

  const groups = effectsByCategory(system);
  const active = activeId ? system.effects[activeId] : undefined;

  const add = (activation: Activation) => {
    const id = freeId(Object.keys(system.effects), 'effect');
    editSystem(draft => {
      draft.effects[id] = activation === 'passive'
        ? { label: 'Новый эффект', activation, duration: { kind: 'permanent' }, modifiers: [] }
        : { label: 'Новый эффект', activation, params: [], steps: [], ...(activation === 'triggered' ? { trigger: { on: '' } } : {}) };
    });
    pick({ activeEffectId: id });
  };

  return (
    <Columns
      left={{
        head: 'Библиотека эффектов',
        body: (
          <>
            {groups.length === 0
              ? <Empty title="Эффектов ещё нет" hint="Заведите первый кнопкой ниже или возьмите готовый из образца справа." />
              : (
                <List>
                  {groups.map(([category, effects]) => (
                    <div key={category}>
                      <ListGroup>{category}</ListGroup>
                      {effects.map(([id, effect]) => (
                        <ListItem
                          key={id}
                          name={effect.label ?? id}
                          meta={metaOf(effect)}
                          active={id === activeId}
                          onClick={() => pick({ activeEffectId: id })}
                        />
                      ))}
                    </div>
                  ))}
                </List>
              )}

            <div className="stack stack--tight">
              <span className="field__label">Создать с нуля</span>
              {ACTIVATIONS.map(kind => (
                <Button key={kind.key} size="sm" wide onClick={() => add(kind.key)} title={kind.title}>
                  + {kind.label.toLowerCase()}
                </Button>
              ))}
            </div>

            <RoomRules system={system} />
          </>
        ),
      }}
      main={{
        head: active ? 'Эффект' : undefined,
        body: active && activeId
          ? <EffectEditor id={activeId} effect={active} system={system} />
          : <Empty
              title="Выберите эффект слева"
              hint="Эффект — единица автоматизации: всё, что мир делает сам. Атака, спасбросок, отравление, ответный удар."
            />,
      }}
      right={{ head: 'Готовое из образцов', body: <DonorPalette kind="effects" /> }}
    />
  );
}

function EffectEditor({ id, effect, system }: { id: string; effect: Effect; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);

  const edit = (change: (draft: Effect) => void) => {
    editSystem(draft => {
      const target = draft.effects[id];
      if (target) change(target);
    });
  };

  const activation = (effect.activation ?? 'manual') as Activation;
  const pipeline = activation !== 'passive';
  const steps = effect.steps ?? [];

  // Ссылаться можно только на шаги ВЫШЕ по цепочке: результат ещё не
  // случившегося шага — это не «пусто», а невозможность.
  const earlierOf = (index: number) =>
    steps.slice(0, index).map(step => step.id).filter(Boolean) as string[];

  const problems = steps.map((step, index) => problemOf(step, system, effect, earlierOf(index)));
  const broken = problems.filter(Boolean).length;

  return (
    <>
      <Card>
        <CardHead
          title={<Input value={effect.label ?? ''} onChange={label => edit(draft => { draft.label = label; })} />}
          actions={
            <Button size="sm" variant="danger" onClick={() => {
              editSystem(draft => {
                delete draft.effects[id];
                draft.room_rules = (draft.room_rules ?? []).filter(x => x !== id);
              });
              pick({ activeEffectId: null });
            }}>
              Удалить
            </Button>
          }
        />

        <Field label="Когда срабатывает">
          <Segmented
            value={activation}
            options={ACTIVATIONS}
            onChange={next => edit(draft => {
              draft.activation = next;
              // Смена рода не выбрасывает чужую нагрузку: вернул род —
              // вернулась и она. Иначе случайный клик стоил бы часа работы.
              if (next === 'passive') draft.modifiers ??= [];
              else draft.steps ??= [];
              if (next === 'triggered') draft.trigger ??= { on: '' };
            })}
          />
        </Field>

        <div className="row">
          <Field label="Категория">
            <Input value={effect.category ?? ''} onChange={next => edit(draft => { draft.category = next; })} />
          </Field>
          {pipeline ? (
            <Field label="Чего стоит">
              <Select
                value={effect.cost ?? ''}
                options={[['', '— не задано —'],
                  ...Object.entries(system.action_types ?? {}).map(([key, t]) => [key, t.label] as const)] as never}
                onChange={next => edit(draft => { draft.cost = next || undefined; })}
              />
            </Field>
          ) : null}
        </div>

        <Fold
          title="Сколько держится"
          summary={durationSummary(effect)}
        >
          <div className="row">
            <Field label="Длительность">
              <Select
                value={effect.duration?.kind ?? 'permanent'}
                options={DURATIONS}
                onChange={kind => edit(draft => {
                  draft.duration = kind === 'uses' ? { kind, max: draft.duration?.max ?? 1 } : { kind };
                })}
              />
            </Field>
            {effect.duration?.kind === 'uses' ? (
              <Field label="Срабатываний">
                <Input
                  type="number"
                  value={effect.duration.max ?? 1}
                  onChange={next => edit(draft => {
                    if (draft.duration?.kind === 'uses') draft.duration.max = Math.max(1, Number(next) || 1);
                  })}
                />
              </Field>
            ) : null}
            <Field label="Если наложить второй раз">
              <Select
                value={effect.stacking ?? 'ignore'}
                options={STACKING}
                onChange={next => edit(draft => { draft.stacking = next; })}
              />
            </Field>
          </div>
        </Fold>
      </Card>

      {activation === 'triggered' ? (
        <Card>
          <CardHead title="На что отвечает" />
          <div className="row">
            <Field label="Слушаем эффект" needed={!effect.trigger?.on}>
              <Select
                value={effect.trigger?.on ?? ''}
                options={[['', '— выберите —'],
                  ...Object.entries(system.effects)
                    .filter(([key, e]) => key !== id && (e.activation ?? 'manual') !== 'passive')
                    .map(([key, e]) => [key, e.label ?? key] as const)] as never}
                onChange={next => edit(draft => { draft.trigger = { ...draft.trigger, on: next }; })}
              />
            </Field>
            <Field label="Условие">
              <Input
                mono
                placeholder="hit.success — пусто: всегда"
                value={String((effect.trigger?.condition as { ref?: string })?.ref ?? '')}
                onChange={next => edit(draft => {
                  draft.trigger = { ...draft.trigger!, condition: next ? { ref: next } : null };
                })}
              />
            </Field>
          </div>
        </Card>
      ) : null}

      {pipeline ? (
        <>
          <div className="inline">
            <span className="screen-title" style={{ fontSize: 'var(--fs-5)' }}>Цепочка шагов</span>
            <span className="spacer" />
            {broken
              ? <Verdict tone="bad">шагов со сломанными ссылками: {broken}</Verdict>
              : steps.length
                ? <Verdict tone="ok">эффект верный · шагов {steps.length}</Verdict>
                : <Verdict tone="warn">шагов ещё нет — эффект ничего не делает</Verdict>}
          </div>

          {steps.map((step, index) => (
            <StepCard
              key={index}
              step={step}
              index={index}
              system={system}
              effect={effect}
              earlier={earlierOf(index)}
              problem={problems[index] ?? null}
              onEdit={change => edit(draft => { change(draft.steps![index]!); })}
              onDelete={() => edit(draft => { draft.steps!.splice(index, 1); })}
            />
          ))}

          <div className="inline inline--tight">
            {STEP_SPECS.map(spec => (
              <Button
                key={spec.type}
                size="sm"
                title={spec.hint}
                onClick={() => edit(draft => { (draft.steps ??= []).push({ type: spec.type }); })}
              >
                + {spec.label.toLowerCase()}
              </Button>
            ))}
          </div>

          <ParamsEditor effect={effect} onEdit={edit} />
        </>
      ) : (
        <ModifiersEditor
          system={system}
          modifiers={effect.modifiers ?? []}
          onEdit={change => edit(draft => { change(draft.modifiers ??= []); })}
        />
      )}
    </>
  );
}

/** Параметры — дырки, которые заполнит запись. Свёрнуты: чаще всего их нет. */
function ParamsEditor({ effect, onEdit }: { effect: Effect; onEdit: (change: (draft: Effect) => void) => void }) {
  const params = effect.params ?? [];

  return (
    <Fold
      title="Дырки для записей компендиума"
      count={params.length}
      summary={params.length ? undefined : 'нет — все слоты заполнены прямо здесь'}
    >
      {params.map(param => (
        <Card key={param.key} tone="flat">
          <div className="row">
            <Field label="Ключ">
              <Input mono value={param.key} onChange={() => { /* ключ неизменен по построению */ }} />
            </Field>
            <Field label="Как называть человеку">
              <Input
                value={param.label ?? ''}
                onChange={next => onEdit(draft => {
                  const target = draft.params?.find(p => p.key === param.key);
                  if (target) target.label = next;
                })}
              />
            </Field>
            <Field label="Кто считает">
              <Select
                value={param.of ?? 'source'}
                options={[['source', 'отправитель'], ['target', 'цель']] as const}
                onChange={next => onEdit(draft => {
                  const target = draft.params?.find(p => p.key === param.key);
                  if (target) target.of = next === 'source' ? undefined : next;
                })}
              />
            </Field>
          </div>
          <Button size="sm" variant="danger" onClick={() => onEdit(draft => {
            draft.params = (draft.params ?? []).filter(p => p.key !== param.key);
          })}>
            Убрать параметр
          </Button>
        </Card>
      ))}

      <Button size="sm" onClick={() => onEdit(draft => {
        draft.params ??= [];
        draft.params.push({ key: freeId(draft.params.map(p => p.key), 'param'), label: 'Новый параметр', kind: 'expr' });
      })}>
        + параметр
      </Button>
    </Fold>
  );
}

/** Правила комнаты: пассивные эффекты, включённые на ВСЕХ. Ссылки, не копии. */
function RoomRules({ system }: { system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const enabled = new Set(system.room_rules ?? []);
  const passives = Object.entries(system.effects)
    .filter(([, effect]) => (effect.activation ?? 'manual') === 'passive');

  return (
    <Fold title="Действуют на всех" count={enabled.size}>
      {passives.length === 0
        ? <span className="faint">Пассивных эффектов пока нет.</span>
        : (
          <div className="inline inline--tight">
            {passives.map(([id, effect]) => (
              <Chip
                key={id}
                active={enabled.has(id)}
                onClick={() => editSystem(draft => {
                  const list = draft.room_rules ??= [];
                  const at = list.indexOf(id);
                  if (at < 0) list.push(id); else list.splice(at, 1);
                })}
              >
                {effect.label ?? id}
              </Chip>
            ))}
          </div>
        )}
    </Fold>
  );
}

const metaOf = (effect: Effect) => {
  const kind = ACTIVATIONS.find(a => a.key === (effect.activation ?? 'manual'))?.label ?? '';
  const payload = (effect.activation ?? 'manual') === 'passive'
    ? `модификаторов: ${effect.modifiers?.length ?? 0}`
    : `шагов: ${effect.steps?.length ?? 0}`;
  return `${kind.toLowerCase()} · ${payload}`;
};

const durationSummary = (effect: Effect) => {
  const kind = effect.duration?.kind ?? 'permanent';
  const word = DURATIONS.find(([key]) => key === kind)?.[1] ?? kind;
  const uses = kind === 'uses' ? ` (${effect.duration?.max ?? 1})` : '';
  const stack = STACKING.find(([key]) => key === (effect.stacking ?? 'ignore'))?.[1];
  return `${word}${uses} · ${stack}`;
};

export { STEP_SPECS };
