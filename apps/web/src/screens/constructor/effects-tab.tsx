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
import { problemOf } from './step-card.tsx';
import { groupSteps, BRICKS } from './cards.ts';
import { GroupCard } from './card.tsx';
import { ModifiersEditor } from './modifiers.tsx';
import { DonorPalette, findDonorBlock, copyDonorBlock } from './donors.tsx';
import type { System, Effect, Activation } from '@vtt/schema';

const ACTIVATIONS = [
  { key: 'manual' as const, label: 'Активируемый', title: 'Жмёшь сам — кнопкой на листе' },
  { key: 'triggered' as const, label: 'Триггерный', title: 'Отвечает на чужое событие' },
  { key: 'passive' as const, label: 'Пассивный', title: 'Просто висит и правит цифры' },
];

// Ответ на вопрос заголовка «когда срабатывает» — живой строкой под
// переключателем, а не прилагательным, которое надо расшифровывать.
const ACTIVATION_ANSWERS: Record<Activation, string> = {
  manual: 'Когда игрок нажал кнопку на листе. Кнопку даёт запись компендиума или сам эффект.',
  triggered: 'Сам, когда на владельце разрешился чужой эффект. Что слушать — выберете ниже.',
  passive: 'Никогда: не срабатывает, а висит и правит цифры, пока не снят.',
};

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

// Чем заполнят потребность: тот же словарь видов, что и у свойств рода
// записи (records-tab.tsx), плюс два вида, которые эффекту нужны, а роду —
// нет: «выбор» и «поле листа» (последнее считает лист заполняющей стороны).
const PARAM_KINDS = [
  ['dice', 'кости (1d8)'],
  ['number', 'число'],
  ['expr', 'формула'],
  ['effect', 'эффект-состояние'],
  ['choice', 'выбор'],
  ['tag', 'поле листа'],
] as const;

const PARAM_SIDES = [
  ['source', 'отправитель'],
  ['target', 'цель — её листом'],
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
              hint="Эффект — единица автоматизации: всё, что мир делает сам. Проверки, изменения полей, состояния — а как их назвать, решаете вы."
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

  // Потребность рождается прямо там, где её не хватило в слоте (задача 2):
  // живёт она на эффекте, а не на шаге, поэтому заводит её эффект-`edit`,
  // а не тот, что правит конкретный шаг. Возвращает готовый ключ — слот
  // сразу коммитит на него ссылку.
  const addParam = (label: string, kind: string): string => {
    let key = '';
    edit(draft => {
      draft.params ??= [];
      key = freeId(draft.params.map(p => p.key), 'из_записи');
      draft.params.push({ key, label, kind });
    });
    return key;
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

        <Field label="Когда срабатывает" hint={ACTIVATION_ANSWERS[activation]}>
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
          {activation === 'manual' ? (
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

        {/* Оси висения — только у тех, кого вешают. Активируемый не висит:
            он вспыхнул и кончился, а его доступность — это владение записью. */}
        {activation !== 'manual' ? (
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
        ) : null}
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

          {groupSteps(steps).map((group, at) => {
            const problem = group.indices.map(i => problems[i]).find(Boolean) ?? null;
            // Диагноз «поля нет» лечится сам: если тег нашёлся в блоке
            // какого-то образца, кнопка рядом с ошибкой привозит блок
            // целиком (с зависимостями) — тем же правилом, что и палитра.
            const donorFix = problem?.missingField ? findDonorBlock(problem.missingField) : null;

            return (
              <GroupCard
                key={group.indices[0]}
                group={group}
                position={at + 1}
                system={system}
                effect={effect}
                earlier={earlierOf(group.indices[0]!)}
                problem={problem}
                problemAction={donorFix ? (
                  <Button size="sm" onClick={() => copyDonorBlock(editSystem, donorFix.donor, donorFix.group)}>
                    {`взять блок «${donorFix.group}» из «${donorFix.donor.name}»`}
                  </Button>
                ) : undefined}
                onAddParam={addParam}
                edit={(k, change) => edit(draft => {
                  const index = group.indices[k] ?? group.indices[0]!;
                  change(draft.steps![index]!);
                })}
                onDelete={() => edit(draft => {
                  [...group.indices].sort((a, b) => b - a).forEach(i => draft.steps!.splice(i, 1));
                })}
              />
            );
          })}

          <div className="inline inline--tight">
            {BRICKS.map(b => (
              <Button key={b.key} size="sm" title={b.hint}
                onClick={() => edit(draft => {
                  const taken = (draft.steps ?? []).map(s => s.id).filter(Boolean) as string[];
                  (draft.steps ??= []).push(...b.make(system, taken));
                })}>
                {b.label}
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

/**
 * Потребности — то, что эффект берёт из записи. Раньше жили в свёрнутом
 * Fold: чаще всего их нет, и это казалось поводом спрятать. Но именно
 * поэтому их стоит видеть сразу — свернуть легко забыть, что заглянуть.
 * Строка-контракт: маркер цветом нити слева, дальше поля без обводки
 * карточки на каждую — карточка тут одна, на всю секцию.
 */
function ParamsEditor({ effect, onEdit }: { effect: Effect; onEdit: (change: (draft: Effect) => void) => void }) {
  const params = effect.params ?? [];

  return (
    <Card>
      <CardHead title="Что эффект берёт из записи" />
      {params.length === 0 ? (
        <Empty
          title="Потребностей нет"
          hint="Значения шагов заполняются прямо на карточках. Заведите потребность, когда значение должно приходить от записи."
        />
      ) : (
        <div className="stack stack--tight">
          <div className="need-list__head">
            <span className="field__label">Название</span>
            <span className="field__label">Чем заполняют</span>
            <span className="field__label">Кто считает</span>
            <span aria-hidden />
          </div>
          {params.map(param => (
            <div key={param.key} className="need">
              <Input
                value={param.label ?? ''}
                onChange={next => onEdit(draft => {
                  const target = draft.params?.find(p => p.key === param.key);
                  if (target) target.label = next;
                })}
              />
              <Select
                value={String(param.kind ?? 'expr')}
                options={PARAM_KINDS}
                onChange={next => onEdit(draft => {
                  const target = draft.params?.find(p => p.key === param.key);
                  if (target) target.kind = next;
                })}
              />
              <Select
                value={param.of ?? 'source'}
                options={PARAM_SIDES}
                onChange={next => onEdit(draft => {
                  const target = draft.params?.find(p => p.key === param.key);
                  if (target) target.of = next === 'source' ? undefined : next;
                })}
              />
              <Button size="sm" variant="danger" onClick={() => onEdit(draft => {
                draft.params = (draft.params ?? []).filter(p => p.key !== param.key);
              })}>
                Убрать
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button size="sm" onClick={() => onEdit(draft => {
        draft.params ??= [];
        const key = freeId(draft.params.map(p => p.key), 'из_записи');
        draft.params.push({ key, label: 'Новая потребность', kind: 'expr' });
      })}>
        + брать из записи
      </Button>
    </Card>
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
