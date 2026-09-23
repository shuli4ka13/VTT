import { useWorld } from '../../../store/world.ts';
import { newTrigger } from '../factory.ts';
import { Card, CardHead, Field, Input, Select, DangerButton, LabelInput } from '../../../ui/primitives.tsx';
import { FieldRow } from '../../../ui/field-row.tsx';
import { ModifiersEditor } from '../modifiers.tsx';
import { LAUNCH_KINDS, launchHint } from './words.ts';
import { LaunchCard } from './launch-card.tsx';
import { Chain, type Lane } from './chain.tsx';
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

  const moveLane = (indices: number[], to: Lane) => edit(draft => {
    const fromList = (to === 'sender' ? draft.steps : draft.self) ?? [];
    const moved = indices.map(i => fromList[i]!).filter(Boolean);
    const rest = fromList.filter((_, i) => !indices.includes(i));
    if (to === 'sender') {
      draft.steps = rest;
      draft.self = [...(draft.self ?? []), ...moved];
    } else {
      if (rest.length) draft.self = rest; else delete draft.self;
      draft.steps = [...moved, ...(draft.steps ?? [])];
    }
  });

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

        <FieldRow
          id="effect-head"
          fields={[
            {
              key: 'launch', label: 'Как запускается', width: 190, hint: launchHint(launch.kind),
              node: (
                <Select
                  value={launch.kind}
                  options={LAUNCH_KINDS.map(k => [k.key, k.label] as const)}
                  onChange={next => edit(draft => {
                    const activation = activationFor({ ...launchOf(draft), kind: next });
                    draft.activation = activation;
                    if (next === 'passive') draft.modifiers ??= [];
                    else draft.steps ??= [];
                    if (next === 'auto') draft.trigger ??= newTrigger(system, activation);
                  })}
                />
              ),
            },
            {
              key: 'group', label: 'Блок', width: 170, hint: 'Тот же, что у полей листа и типов записей',
              node: (
                <BlockPick
                  system={system} value={effect.group}
                  onChange={next => edit(draft => { if (next) draft.group = next; else delete draft.group; })}
                />
              ),
            },
            ...(launch.kind === 'manual' || launch.ask ? [{
              key: 'cost', label: 'Занимает', width: 150, hint: 'Действие, бонусное, реакция — чем это оплачивается в свой ход',
              node: (
                <Select
                  value={effect.cost ?? ''}
                  options={[['', '—'],
                    ...Object.entries(system.action_types ?? {}).map(([key, t]) => [key, t.label] as const)] as never}
                  onChange={next => edit(draft => { draft.cost = next || undefined; })}
                />
              ),
            }] : []),
            {
              key: 'extends', label: 'На основе', width: 170,
              hint: effect.extends && system.effects[effect.extends]
                ? fromBase(system.effects[effect.extends]!)
                : 'Возьмёт у основы её входы, стоимость и шаги — они пойдут первыми',
              node: (
                <Select
                  value={effect.extends ?? ''}
                  options={[['', '— сам по себе —'],
                    ...Object.entries(system.effects)
                      .filter(([key]) => key !== id)
                      .map(([key, other]) => [key, other.label ?? key] as const)] as never}
                  onChange={next => edit(draft => { if (next) draft.extends = next; else delete draft.extends; })}
                />
              ),
            },
            {
              key: 'description', label: 'Описание для игрока', width: 320, hint: 'Текст на листе. На расчёт не влияет',
              node: (
                <Input
                  value={effect.description ?? ''}
                  placeholder="например: бьёшь оружием ближнего боя"
                  onChange={next => edit(draft => { draft.description = next || undefined; })}
                />
              ),
            },
          ]}
        />

        {launch.kind !== 'manual' ? (
          <Extras
            items={[{
              key: 'duration', label: 'сколько висит', on: !!effect.duration || !!effect.bond,
              add: () => edit(draft => { draft.duration = { kind: 'temporary' }; }),
              drop: () => edit(draft => { delete draft.duration; delete draft.bond; delete draft.stacking; }),
              node: <Lifetime effect={effect} system={system} id={id} edit={edit} />,
            }]}
          />
        ) : null}
      </Card>

      {launch.kind === 'auto' ? <LaunchCard id={id} effect={effect} system={system} edit={edit} /> : null}

      {pipeline ? <ParamsEditor effect={effect} system={system} onEdit={edit} /> : null}

      {pipeline ? (
        <>
          <SelfTrack effect={effect} system={system} edit={edit} onMoveLane={moveLane} />
          <Chain
            effect={effect} system={system} edit={edit}
            empty={idleWords(effect)}
            onMoveLane={moveLane}
          />
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



function SelfTrack({ effect, system, edit, onMoveLane }: {
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
  onMoveLane: (indices: number[], to: Lane) => void;
}) {
  const track = effect.self ?? [];
  if (!track.length) return null;
  const carrier = { ...effect, steps: track } as Effect;

  const editTrack = (change: (draft: Effect) => void) => edit(draft => {
    const own = { ...draft, steps: draft.self ?? [] } as Effect;
    change(own);
    const steps = own.steps ?? [];
    if (steps.length) draft.self = steps; else delete draft.self;
  });

  return (
    <Chain
      effect={carrier}
      system={system}
      edit={editTrack}
      lane="sender"
      onMoveLane={onMoveLane}
      title="У отправителя — один раз, до остальных шагов"
      empty="у отправителя ничего не делается"
    />
  );
}
