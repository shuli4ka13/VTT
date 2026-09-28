import { useWorld } from '../../../store/world.ts';
import { newHandler, payStep } from '../factory.ts';
import { Card, CardHead, Field, Input, Select, DangerButton, LabelInput, Button, Empty } from '../../../ui/primitives.tsx';
import { FieldRow } from '../../../ui/field-row.tsx';
import { MultiChoice } from '../../../ui/multi-choice.tsx';
import { useOpened } from '../../../store/opened.ts';
import { ModifiersEditor } from '../modifiers.tsx';
import { LAUNCH_KINDS, launchHint } from './words.ts';
import { HandlerCard } from './handler-card.tsx';
import { Chain, CostPick, type Lane } from './chain.tsx';
import { BlockPick } from '../block-pick.tsx';
import { Extras } from './cards/extras.tsx';
import { ParamsEditor } from './params-editor.tsx';
import { launchOf, activationFor } from '@vtt/engine/model/effect-kinds';
import type { System, Effect, Step } from '@vtt/schema';

const DURATIONS = [
  ['permanent', 'пока не снимут'],
  ['uses', 'на N срабатываний'],
  ['rounds', 'на N раундов боя'],
  ['turns', 'на N ходов'],
  ['combat', 'до конца боя'],
  ['scene', 'до конца сцены'],
] as const;

const COUNTED = new Set(['uses', 'rounds', 'turns']);

const ENDS = [
  ['turn-end', 'в конце хода'],
  ['turn-start', 'в начале хода'],
] as const;

const WHOSE = [
  ['own', 'своего — того, на ком висит'],
  ['source', 'того, кто наложил'],
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
  const pipeline = launch.kind === 'manual';

  const moveLane = (indices: number[], to: Lane) => {
    const fromList = (to === 'sender' ? effect.steps : effect.self) ?? [];
    const first = fromList[indices[0] ?? 0];
    const at = to === 'sender' ? (effect.self?.length ?? 0) : 0;
    useOpened.getState().setOpen([`step|${effect.label ?? ''}|${to}|${String(first?.id ?? at)}`], true);
    shiftLane(indices, to);
  };

  const shiftLane = (indices: number[], to: Lane) => edit(draft => { shiftBetween(draft, indices, to); });

  return (
    <>
      <Card>
        <CardHead
          title={<LabelInput value={effect.label ?? ''} placeholder="как зовётся эффект" onCommit={label => edit(draft => { draft.label = label; })} />}
          actions={
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => {
                delete draft.effects[id];
                draft.grants = (draft.grants ?? []).filter(x => x !== id);
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
                  value={pipeline ? 'manual' : 'passive'}
                  options={LAUNCH_KINDS.map(k => [k.key, k.label] as const)}
                  onChange={next => edit(draft => {
                    draft.activation = activationFor({ ...launchOf(draft), kind: next });
                    if (next === 'manual') draft.steps ??= [];
                  })}
                />
              ),
            },
            {
              key: 'everyone', label: 'У кого есть', width: 190,
              node: (
                <Select
                  value={(system.grants ?? []).includes(id) ? 'all' : 'given'}
                  options={[['given', pipeline ? 'даёт запись или тип' : 'на кого повесили'], ['all', 'у всех листов']] as const}
                  onChange={next => editSystem(draft => {
                    const rest = (draft.grants ?? []).filter(x => x !== id);
                    draft.grants = next === 'all' ? [...rest, id] : rest;
                  })}
                />
              ),
            },
            {
              key: 'group', label: 'Блок', width: 170,
              node: (
                <BlockPick
                  of="effects"
                  system={system} value={effect.group}
                  onChange={next => edit(draft => { if (next) draft.group = next; else delete draft.group; })}
                />
              ),
            },
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
              add: () => edit(draft => { draft.duration = { kind: 'permanent' }; }),
              drop: () => edit(draft => { delete draft.duration; delete draft.bond; delete draft.stacking; }),
              node: <Lifetime effect={effect} system={system} id={id} edit={edit} />,
            }, {
              key: 'grants', label: 'что входит в него', on: !!effect.grants,
              add: () => edit(draft => { draft.grants = []; }),
              drop: () => edit(draft => { delete draft.grants; }),
              node: (
                <Field label="Входят в него" hint="Висят, пока висит этот эффект: «без сознания» включает «недееспособен».">
                  <MultiChoice
                    value={effect.grants ?? []}
                    options={Object.entries(system.effects)
                      .filter(([key, other]) => key !== id && (other.activation ?? 'manual') === 'passive')
                      .map(([key, other]) => ({ value: key, label: other.label || key }))}
                    onChange={next => edit(draft => { draft.grants = next; })}
                  />
                </Field>
              ),
            }]}
          />
        ) : null}
      </Card>

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
        <>
          <ModifiersEditor
            system={system}
            editSystem={editSystem}
            title="Пока висит — правит"
            empty={{ title: 'Ничего не правит', hint: 'Правки действуют, пока эффект висит: бонус к полю, помеха на бросок.' }}
            modifiers={effect.modifiers ?? []}
            onEdit={change => edit(draft => { change(draft.modifiers ??= []); })}
          />
          <Handlers id={id} effect={effect} system={system} edit={edit} />
          <Hooks effect={effect} system={system} edit={edit} />
        </>
      )}
    </>
  );
}

const HOOKS = [
  ['attach', 'При наложении', 'шаги сразу, когда эффект повесили'],
  ['detach', 'При спадании', 'шаги в тот миг, когда эффект ушёл: истёк срок, сняли, оборвалась связь'],
] as const;

function Hooks({ effect, system, edit }: {
  effect: Effect; system: System; edit: (change: (draft: Effect) => void) => void;
}) {
  const absent = HOOKS.filter(([turn]) => effect[turn] === undefined);
  return (
    <>
      {HOOKS.filter(([turn]) => effect[turn] !== undefined).map(([turn, title, hint]) => {
        const carrier = { ...effect, label: `${effect.label ?? ''} · ${title}`, steps: effect[turn] ?? [] } as Effect;
        const editCarrier = (change: (draft: Effect) => void) => edit(draft => {
          const view = { ...draft, steps: draft[turn] ?? [] } as Effect;
          change(view);
          draft[turn] = view.steps ?? [];
        });
        return (
          <div key={turn} className="stack">
            <div className="inline">
              <span className="faint">{hint}</span>
              <span className="spacer" />
              <Button size="sm" variant="ghost" title={`убрать «${title.toLowerCase()}»`} onClick={() => edit(draft => { delete draft[turn]; })}>×</Button>
            </div>
            <Chain effect={carrier} system={system} edit={editCarrier} title={title} empty="шагов нет — ничего не делает" />
          </div>
        );
      })}
      {absent.length ? (
        <div className="inline inline--tight">
          {absent.map(([turn, title, hint]) => (
            <Button key={turn} size="sm" title={hint} onClick={() => edit(draft => { draft[turn] = []; })}>
              + {title.toLowerCase()}
            </Button>
          ))}
        </div>
      ) : null}
    </>
  );
}

type Holder = { steps?: Step[]; self?: Step[] };

const shiftBetween = (holder: Holder, indices: number[], to: Lane): void => {
  const fromList = (to === 'sender' ? holder.steps : holder.self) ?? [];
  const moved = indices.map(i => fromList[i]!).filter(Boolean);
  const rest = fromList.filter((_, i) => !indices.includes(i));
  if (to === 'sender') {
    holder.steps = rest;
    holder.self = [...(holder.self ?? []), ...moved];
  } else {
    if (rest.length) holder.self = rest; else delete holder.self;
    holder.steps = [...moved, ...(holder.steps ?? [])];
  }
};

function Handlers({ id, effect, system, edit }: {
  id: string; effect: Effect; system: System; edit: (change: (draft: Effect) => void) => void;
}) {
  const list = effect.on ?? [];
  return (
    <>
      <div className="inline">
        <span className="screen-title" style={{ fontSize: 'var(--fs-5)' }}>Когда</span>
        <span className="spacer" />
        <Button size="sm" onClick={() => edit(draft => { (draft.on ??= []).push(newHandler()); })}>+ когда</Button>
      </div>
      {list.length === 0 ? (
        <Empty title="Ни на что не отзывается" hint="«Когда» — что случилось (начался ход, пришёл урон, по мне бросают) и что эффект делает в ответ." />
      ) : null}
      {list.map((handler, index) => {
        const carrier = { ...effect, label: `${effect.label ?? ''} · когда ${index + 1}`, steps: handler.steps ?? [], self: handler.self } as Effect;
        const editCarrier = (change: (draft: Effect) => void) => edit(draft => {
          const own = draft.on?.[index];
          if (!own) return;
          const view = { ...draft, steps: own.steps ?? [], self: own.self } as Effect;
          change(view);
          own.steps = view.steps ?? [];
          if (view.self?.length) own.self = view.self; else delete own.self;
        });
        const moveLane = (indices: number[], to: Lane) => edit(draft => {
          const own = draft.on?.[index];
          if (own) shiftBetween(own, indices, to);
        });
        return (
          <div key={index} className="stack">
            <HandlerCard
              id={id} index={index} handler={handler} system={system}
              edit={change => edit(draft => { const own = draft.on?.[index]; if (own) change(own); })}
              onRemove={() => edit(draft => {
                draft.on = (draft.on ?? []).filter((_, at) => at !== index);
                if (!draft.on.length) delete draft.on;
              })}
            />
            {handler.ask ? (
              <SelfTrack
                effect={carrier} system={system} edit={editCarrier} onMoveLane={moveLane}
                title="Плата — списывается, если игрок согласился" lead="Чем платит:"
              />
            ) : null}
            <Chain
              effect={carrier} system={system} edit={editCarrier}
              title={`Что делает — когда №${index + 1}`}
              empty="шагов нет — отзывается, но ничего не делает"
              onMoveLane={moveLane}
            />
          </div>
        );
      })}
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
            if (next === 'held') { draft.bond = true; draft.duration = { kind: 'permanent' }; return; }
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
        <Field label="Спадает" hint="«В начале хода» — как «до начала следующего хода»: щит, уклонение.">
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

      {!held && kind === 'turns' ? (
        <Field label="Чьи ходы считать" hint="«Того, кто наложил» — как «до начала вашего следующего хода» у помощи и щита веры.">
          <Select
            value={effect.duration?.whose ?? 'own'}
            options={WHOSE}
            onChange={next => edit(draft => {
              if (!draft.duration) return;
              if (next === 'source') draft.duration.whose = next; else delete draft.duration.whose;
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



function SelfTrack({ effect, system, edit, onMoveLane, title = 'У отправителя — один раз, до остальных шагов', lead = 'Чего стоит:' }: {
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
  onMoveLane: (indices: number[], to: Lane) => void;
  title?: string;
  lead?: string;
}) {
  const track = effect.self ?? [];
  if (!track.length) {
    return (
      <div className="inline">
        <span className="faint">{lead}</span>
        <CostPick system={system} onPick={id => edit(draft => { draft.self = [payStep(id)]; })} />
        <span className="faint">ничего — пока не выбрали</span>
      </div>
    );
  }
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
      title={title}
      empty="у отправителя ничего не делается"
    />
  );
}
