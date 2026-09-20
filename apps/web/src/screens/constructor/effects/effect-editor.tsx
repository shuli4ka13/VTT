import { useWorld } from '../../../store/world.ts';
import { newTrigger } from '../factory.ts';
import { Card, CardHead, Field, Input, Select, Segmented, Fold, DangerButton } from '../../../ui/primitives.tsx';
import { ModifiersEditor } from '../modifiers.tsx';
import { LAUNCH_KINDS, launchHint } from './words.ts';
import { LaunchCard } from './launch-card.tsx';
import { Chain } from './chain.tsx';
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
          title={<Input value={effect.label ?? ''} onChange={label => edit(draft => { draft.label = label; })} />}
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

        <Field label="Описание для игрока" hint="Текст, который игрок видит на листе. На расчёт не влияет.">
          <Input
            value={effect.description ?? ''}
            placeholder="например: бьёшь оружием ближнего боя"
            onChange={next => edit(draft => { draft.description = next || undefined; })}
          />
        </Field>

        <div className="row">
          <Field label="Категория">
            <Input value={effect.category ?? ''} onChange={next => edit(draft => { draft.category = next; })} />
          </Field>
          {launch.kind === 'manual' || launch.ask ? (
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

        {}
        {launch.kind !== 'manual' ? (
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
                    draft.duration = COUNTED.has(kind) ? { kind, max: draft.duration?.max ?? 1 } : { kind };
                  })}
                />
              </Field>
              {COUNTED.has(effect.duration?.kind ?? '') ? (
                <Field label="Сколько">
                  <Input
                    type="number"
                    value={effect.duration?.max ?? 1}
                    onChange={next => edit(draft => {
                      if (draft.duration && COUNTED.has(draft.duration.kind)) draft.duration.max = Math.max(1, Number(next) || 1);
                    })}
                  />
                </Field>
              ) : null}
              {effect.duration?.kind === 'turns' ? (
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
          </Fold>
        ) : null}
      </Card>

      {launch.kind === 'auto' ? <LaunchCard id={id} effect={effect} system={system} edit={edit} /> : null}

      {pipeline ? (
        <>
          <Chain effect={effect} system={system} edit={edit} />
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

const durationSummary = (effect: Effect) => {
  const kind = effect.duration?.kind ?? 'permanent';
  const word = DURATIONS.find(([key]) => key === kind)?.[1] ?? kind;
  const uses = kind === 'uses' ? ` (${effect.duration?.max ?? 1})` : '';
  const edge = kind === 'turns' && effect.duration?.ends === 'turn-start' ? ', спадает в начале своего хода' : '';
  const stack = STACKING.find(([key]) => key === (effect.stacking ?? 'ignore'))?.[1];
  return `${word}${uses}${edge} · ${stack}`;
};

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
      title="Со мной — один раз за действие"
      count={track.length}
      summary={track.length ? undefined : 'ничего: ни ячейка, ни заряд не тратятся'}
    >
      <span className="faint">
        Эта дорожка идёт по листу того, кто действует, и ровно один раз — даже если целей несколько.
        Сюда кладут трату ячейки, заряда или ресурса.
      </span>
      <Chain
        effect={carrier}
        system={system}
        edit={editTrack}
        title="Шаги дорожки"
        empty="пусто — ничего с собой не делается"
      />
    </Fold>
  );
}
