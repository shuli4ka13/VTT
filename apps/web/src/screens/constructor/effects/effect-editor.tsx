import { useWorld } from '../../../store/world.ts';
import { newTrigger } from '../factory.ts';
import { Card, CardHead, Field, Input, Select, Segmented, Fold, DangerButton, LabelInput } from '../../../ui/primitives.tsx';
import { ModifiersEditor } from '../modifiers.tsx';
import { LAUNCH_KINDS, launchHint } from './words.ts';
import { LaunchCard } from './launch-card.tsx';
import { Chain } from './chain.tsx';
import { WordList } from '../word-list.tsx';
import { tagsOf } from '@vtt/engine/model/lists';
import { BlockPick } from '../block-pick.tsx';
import { Extras } from './cards/extras.tsx';
import { ParamsEditor } from './params-editor.tsx';
import { launchOf, activationFor } from '@vtt/engine/model/effect-kinds';
import type { System, Effect } from '@vtt/schema';

const DURATIONS = [
  ['permanent', 'постоянно'],
  ['temporary', 'временно'],
  ['uses', 'на N срабатываний'],
  ['rounds', 'на N раундов боя'],
  ['turns', 'на N своих ходов'],
  ['scene', 'до конца сцены'],
] as const;

const COUNTED = new Set(['uses', 'rounds', 'turns']);

const ENDS = [
  ['turn-end', 'в конце своего хода'],
  ['turn-start', 'в начале своего хода'],
] as const;

const STACKING = [
  ['ignore', 'второй раз ничего не делает'],
  ['refresh', 'обновляется'],
  ['stack', 'копится'],
] as const;

const fromBase = (base: Effect): string => {
  const parts: string[] = [];
  if (base.params?.length) parts.push(`потребностей: ${base.params.length}`);
  if (base.self?.length) parts.push(`стоимость: ${base.self.length}`);
  if (base.steps?.length) parts.push(`шагов впереди: ${base.steps.length}`);
  if (base.modifiers?.length) parts.push(`правок: ${base.modifiers.length}`);
  return parts.length
    ? `От основы «${base.label ?? ''}» достаётся — ${parts.join(', ')}.`
    : `Основа «${base.label ?? ''}» пока ничего не даёт.`;
};

export function EffectEditor({ id, effect, system }: { id: string; effect: Effect; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const editEffect = useWorld(s => s.editEffect);
  const pick = useWorld(s => s.pick);

  const edit = (change: (draft: Effect) => void) => editEffect(id, change);

  const launch = launchOf(effect);
  const pipeline = launch.kind !== 'passive';

  return (
    <>
      <Card>
        <CardHead
          title={<LabelInput value={effect.label ?? ''} placeholder="как зовётся эффект" onCommit={label => edit(draft => { draft.label = label; })} />}
          actions={
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => {
                delete draft.effects[id];
                draft.room_rules = (draft.room_rules ?? []).filter(x => x !== id);
              });
              pick({ activeEffectId: null });
            }}>
              Удалить
            </DangerButton>
          }
        />

        <Field label="Как запускается" hint={launchHint(launch.kind)}>
          <Segmented
            value={launch.kind}
            options={LAUNCH_KINDS}
            onChange={next => edit(draft => {
              const activation = activationFor({ ...launchOf(draft), kind: next });
              draft.activation = activation;
              if (next === 'passive') draft.modifiers ??= [];
              else draft.steps ??= [];
              if (next === 'auto') draft.trigger ??= newTrigger(system, activation);
            })}
          />
        </Field>

        <Extras
          items={[
            {
              key: 'group', label: 'блок', on: !!effect.group,
              add: () => {}, drop: () => edit(draft => { delete draft.group; }),
              node: (
                <Field label="Блок" hint="Тот же, что у полей листа и типов записей.">
                  <BlockPick
                    system={system} value={effect.group}
                    onChange={next => edit(draft => {
                      if (next) draft.group = next; else delete draft.group;
                    })}
                  />
                </Field>
              ),
            },
            {
              key: 'description', label: 'описание для игрока', on: !!effect.description,
              add: () => {}, drop: () => edit(draft => { delete draft.description; }),
              node: (
                <Field label="Описание для игрока" hint="Текст на листе. На расчёт не влияет.">
                  <Input
                    value={effect.description ?? ''}
                    placeholder="например: бьёшь оружием ближнего боя"
                    onChange={next => edit(draft => { draft.description = next || undefined; })}
                  />
                </Field>
              ),
            },
            {
              key: 'tags', label: 'какие метки бывают', on: !!effect.tags?.length || !!effect.tagsFrom,
              add: () => {}, drop: () => edit(draft => { delete draft.tags; delete draft.tagsFrom; }),
              node: (
                <Field
                  label="Какие метки бывают"
                  hint="Список на выбор для тех, кто зовёт этот эффект. Например у «Урона» — виды урона."
                >
                  <div className="stack stack--tight">
                    <Select
                      value={effect.tagsFrom ?? ''}
                      options={[['', '— свой список —'],
                        ...Object.entries(system.lists ?? {}).map(([key, list]) => [key, list.label || key] as const)] as never}
                      onChange={next => edit(draft => {
                        if (next) { draft.tagsFrom = next; delete draft.tags; }
                        else delete draft.tagsFrom;
                      })}
                    />
                    {effect.tagsFrom ? (
                      <span className="faint">{tagsOf(system, effect).join(', ')}</span>
                    ) : (
                      <WordList
                        value={effect.tags ?? []} known={knownTags(system)} placeholder="новая метка"
                        onChange={next => edit(draft => {
                          if (next.length) draft.tags = next; else delete draft.tags;
                        })}
                      />
                    )}
                  </div>
                </Field>
              ),
            },
            ...(launch.kind === 'manual' || launch.ask ? [{
              key: 'cost', label: 'занимает', on: !!effect.cost,
              add: () => {}, drop: () => edit(draft => { delete draft.cost; }),
              node: (
                <Field label="Занимает" hint="Действие, бонусное, реакция — чем это оплачивается в свой ход.">
                  <Select
                    value={effect.cost ?? ''}
                    options={[['', '— не задано —'],
                      ...Object.entries(system.action_types ?? {}).map(([key, t]) => [key, t.label] as const)] as never}
                    onChange={next => edit(draft => { draft.cost = next || undefined; })}
                  />
                </Field>
              ),
            }] : []),
            ...(launch.kind !== 'manual' ? [{
              key: 'duration', label: 'сколько висит', on: !!effect.duration || !!effect.bond,
              add: () => edit(draft => { draft.duration = { kind: 'temporary' }; }),
              drop: () => edit(draft => { delete draft.duration; delete draft.bond; delete draft.stacking; }),
              node: <Lifetime effect={effect} system={system} id={id} edit={edit} />,
            }] : []),
            {
              key: 'extends', label: 'на основе', on: !!effect.extends,
              add: () => {}, drop: () => edit(draft => { delete draft.extends; }),
              node: (
                <Field
                  label="На основе"
                  hint={effect.extends && system.effects[effect.extends]
                    ? fromBase(system.effects[effect.extends]!)
                    : 'Возьмёт у основы её потребности, стоимость и шаги — они пойдут первыми.'}
                >
                  <Select
                    value={effect.extends ?? ''}
                    options={[['', '— сам по себе —'],
                      ...Object.entries(system.effects)
                        .filter(([key]) => key !== id)
                        .map(([key, other]) => [key, other.label ?? key] as const)] as never}
                    onChange={next => edit(draft => {
                      if (next) draft.extends = next; else delete draft.extends;
                    })}
                  />
                </Field>
              ),
            },
          ]}
        />
      </Card>

      {launch.kind === 'auto' ? <LaunchCard id={id} effect={effect} system={system} edit={edit} /> : null}

      {pipeline ? (
        <>
          <Chain
            effect={effect} system={system} edit={edit}
            empty={idleWords(effect)}
          />
          <SelfTrack effect={effect} system={system} edit={edit} />
          <ParamsEditor effect={effect} onEdit={edit} />
        </>
      ) : (
        <ModifiersEditor
          system={system}
          editSystem={editSystem}
          modifiers={effect.modifiers ?? []}
          onEdit={change => edit(draft => { change(draft.modifiers ??= []); })}
        />
      )}
    </>
  );
}

const knownTags = (system: System): string[] => [...new Set(
  Object.values(system.effects).flatMap(effect => effect.tags ?? []),
)];

const idleWords = (effect: Effect): string => {
  const also: string[] = [];
  if (effect.self?.length) also.push('стоимость');
  if (effect.modifiers?.length) also.push('правки');
  return also.length
    ? `шагов нет — работает только ${also.join(' и ')}`
    : 'шагов ещё нет — эффект ничего не делает';
};

function Lifetime({ effect, system, id, edit }: {
  effect: Effect; system: System; id: string; edit: (change: (draft: Effect) => void) => void;
}) {
  const kind = effect.duration?.kind ?? 'permanent';
  const held = effect.bond !== undefined;
  const shared = typeof effect.bond === 'string';
  const holders = Object.entries(system.effects)
    .filter(([key, other]) => key !== id && (other.activation ?? 'manual') !== 'manual');

  return (
    <div className="stack stack--tight">
      <Field label="Сколько висит">
        <Select
          value={held ? 'held' : kind}
          options={[...DURATIONS, ['held', 'пока я держу']] as never}
          onChange={next => edit(draft => {
            if (next === 'held') { draft.bond = true; draft.duration = { kind: 'temporary' }; return; }
            delete draft.bond;
            draft.duration = COUNTED.has(next) ? { kind: next, max: draft.duration?.max ?? 1 } : { kind: next };
          })}
        />
      </Field>

      {held ? (
        <Field label="Держится вместе с чем-то ещё?" hint="Концентрация: взялся за новое — старое спало.">
          <Select
            value={shared ? String(effect.bond) : ''}
            options={[['', 'нет — только этот эффект'],
              ...holders.map(([key, other]) => [key, `вместе с «${other.label ?? key}»`] as const)] as never}
            onChange={next => edit(draft => { draft.bond = next || true; })}
          />
        </Field>
      ) : null}

      {!held && COUNTED.has(kind) ? (
        <Field label="Сколько">
          <Input
            type="number" value={effect.duration?.max ?? 1}
            onChange={next => edit(draft => {
              if (draft.duration && COUNTED.has(draft.duration.kind)) draft.duration.max = Math.max(1, Number(next) || 1);
            })}
          />
        </Field>
      ) : null}

      {!held && kind === 'turns' ? (
        <Field label="Спадает" hint="«В начале своего хода» — как «до начала вашего следующего хода»: щит, уклонение.">
          <Select
            value={effect.duration?.ends ?? 'turn-end'}
            options={ENDS}
            onChange={next => edit(draft => {
              if (!draft.duration) return;
              if (next === 'turn-start') draft.duration.ends = next; else delete draft.duration.ends;
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
  );
}



function SelfTrack({ effect, system, edit }: {
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
}) {
  const track = effect.self ?? [];
  const carrier = { ...effect, steps: track } as Effect;

  const editTrack = (change: (draft: Effect) => void) => edit(draft => {
    const own = { ...draft, steps: draft.self ?? [] } as Effect;
    change(own);
    const steps = own.steps ?? [];
    if (steps.length) draft.self = steps; else delete draft.self;
  });

  return (
    <Fold
      title="Стоимость"
      count={track.length}
      summary={track.length ? 'списывается один раз, даже если целей несколько' : 'ничего не стоит'}
    >
      <Chain
        effect={carrier}
        system={system}
        edit={editTrack}
        title="Что списывается"
        empty="ничего не списывается"
      />
    </Fold>
  );
}
