import { useWorld } from '../../../store/world.ts';
import { newTrigger } from '../factory.ts';
import { Card, CardHead, Field, Input, Select, Segmented, Fold, DangerButton } from '../../../ui/primitives.tsx';
import { ModifiersEditor } from '../modifiers.tsx';
import { ACTIVATIONS } from './words.ts';
import { LaunchCard } from './launch-card.tsx';
import { Chain } from './chain.tsx';
import { ParamsEditor } from './params-editor.tsx';
import type { System, Effect, Activation } from '@vtt/schema';

const ACTIVATION_ANSWERS: Record<Activation, string> = {
  manual: 'Когда игрок нажал кнопку на листе. Кнопку даёт запись компендиума или сам эффект.',
  triggered: 'Сам, без вопросов: когда случилось то, что он слушает. Что слушать — выберете ниже.',
  reaction: 'Стол останавливается и спрашивает игрока: применить? Когда именно — выберете ниже.',
  passive: 'Никогда: не срабатывает, а висит и правит цифры, пока не снят.',
};

const DURATIONS = [
  ['permanent', 'постоянно'],
  ['temporary', 'временно'],
  ['uses', 'на N срабатываний'],
  ['rounds', 'на N раундов боя'],
  ['turns', 'на N своих ходов'],
  ['scene', 'до конца сцены'],
] as const;

const COUNTED = new Set(['uses', 'rounds', 'turns']);

const STACKING = [
  ['ignore', 'второй раз ничего не делает'],
  ['refresh', 'обновляется'],
  ['stack', 'копится'],
] as const;

export function EffectEditor({ id, effect, system }: { id: string; effect: Effect; system: System }) {
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

        <Field label="Когда срабатывает" hint={ACTIVATION_ANSWERS[activation]}>
          <Segmented
            value={activation}
            options={ACTIVATIONS}
            onChange={next => edit(draft => {
              draft.activation = next;

              if (next === 'passive') draft.modifiers ??= [];
              else draft.steps ??= [];
              draft.trigger ??= newTrigger(system, next);
            })}
          />
        </Field>

        <div className="row">
          <Field label="Категория">
            <Input value={effect.category ?? ''} onChange={next => edit(draft => { draft.category = next; })} />
          </Field>
          {activation === 'manual' || activation === 'reaction' ? (
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

      <LaunchCard id={id} effect={effect} system={system} activation={activation} edit={edit} />

      {pipeline ? (
        <>
          <Chain effect={effect} system={system} edit={edit} />
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

const durationSummary = (effect: Effect) => {
  const kind = effect.duration?.kind ?? 'permanent';
  const word = DURATIONS.find(([key]) => key === kind)?.[1] ?? kind;
  const uses = kind === 'uses' ? ` (${effect.duration?.max ?? 1})` : '';
  const stack = STACKING.find(([key]) => key === (effect.stacking ?? 'ignore'))?.[1];
  return `${word}${uses} · ${stack}`;
};
