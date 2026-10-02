import { useWorld } from '../../../store/world.ts';
import { newHandler, payStep } from '../factory.ts';
import { Card, CardHead, Field, Input, Select, DangerButton, LabelInput, Button, Empty } from '../../../ui/primitives.tsx';
import { FieldRow } from '../../../ui/field-row.tsx';
import { useOpened } from '../../../store/opened.ts';
import { ModifiersEditor } from '../modifiers.tsx';
import { LAUNCH_KINDS, launchHint } from './words.ts';
import { HandlerCard } from './handler-card.tsx';
import { Chain, type Lane } from './chain.tsx';
import { groupSteps } from '../cards.ts';
import { BlockPick } from '../block-pick.tsx';
import { GrantsEditor } from '../grants-editor.tsx';
import { Extras } from './cards/extras.tsx';
import { ParamsEditor } from './params-editor.tsx';
import { launchOf, activationFor, DURATIONS, REAPPLY } from '@vtt/engine/model/effect-kinds';
import type { System, Effect, Step } from '@vtt/schema';

const DURATION_OPTIONS = Object.entries(DURATIONS).map(([key, word]) => [key, word.label] as const);

const COUNTED = new Set(['uses', 'rounds', 'turns']);

const ENDS = [
  ['turn-end', 'в конце хода'],
  ['turn-start', 'в начале хода'],
] as const;

const REAPPLY_OPTIONS = (Object.keys(REAPPLY) as (keyof typeof REAPPLY)[]).map(key => [key, REAPPLY[key].label] as const);

const fromBase = (base: Effect): string => {
  const parts: string[] = [];
  if (base.params?.length) parts.push(`входов: ${base.params.length}`);
  if (base.cost?.length) parts.push(`стоимость: ${base.cost.length}`);
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
    const fromList = (to === 'cost' ? effect.steps : effect.cost) ?? [];
    const first = fromList[indices[0] ?? 0];
    const at = to === 'cost' ? (effect.cost?.length ?? 0) : 0;
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
              key: 'description', label: 'Описание', width: 320, hint: 'Текст на листе. На расчёт не влияет',
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
              drop: () => edit(draft => { delete draft.duration; delete draft.bond; delete draft.reapply; }),
              node: <Lifetime effect={effect} system={system} id={id} edit={edit} />,
            }, {
              key: 'grants', label: 'что даёт', on: !!effect.grants,
              add: () => edit(draft => { draft.grants = []; }),
              drop: () => edit(draft => { delete draft.grants; }),
              node: (
                <Field label="Что даёт" hint="Есть, пока висит этот эффект: «без сознания» включает «недееспособен».">
                  <GrantsEditor system={system} value={effect.grants} except={id}
                    onChange={next => edit(draft => { draft.grants = next ?? []; })} />
                </Field>
              ),
            }]}
          />
        ) : null}
      </Card>

      {pipeline ? <ParamsEditor effect={effect} system={system} onEdit={edit} /> : null}

      {pipeline ? (
        <>
          <Chain
            effect={effect} system={system} edit={edit}
            empty={idleWords(effect)}
            onMoveLane={moveLane}
            startAt={groupSteps(effect.cost ?? []).length}
            lead={<SelfTrack effect={effect} system={system} edit={edit} onMoveLane={moveLane} />}
            onAddCost={id => edit(draft => {
              const taken = (draft.cost ?? []).map(s => String(s.id ?? ''));
              (draft.cost ??= []).unshift(payStep(id, taken));
            })}
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

type Holder = { steps?: Step[]; cost?: Step[] };

const shiftBetween = (holder: Holder, indices: number[], to: Lane): void => {
  const fromList = (to === 'cost' ? holder.steps : holder.cost) ?? [];
  const moved = indices.map(i => fromList[i]!).filter(Boolean);
  const rest = fromList.filter((_, i) => !indices.includes(i));
  if (to === 'cost') {
    holder.steps = rest;
    holder.cost = [...(holder.cost ?? []), ...moved];
  } else {
    if (rest.length) holder.cost = rest; else delete holder.cost;
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
        <Empty title="Ни на что не отзывается" hint="Подписка — что случилось (начался ход, пришёл урон, выпали кости) и что эффект делает в ответ." />
      ) : null}
      {list.map((handler, index) => {
        const carrier = { ...effect, label: `${effect.label ?? ''} · когда ${index + 1}`, steps: handler.steps ?? [], self: handler.cost } as Effect;
        const editCarrier = (change: (draft: Effect) => void) => edit(draft => {
          const own = draft.on?.[index];
          if (!own) return;
          const view = { ...draft, steps: own.steps ?? [], cost: own.cost } as Effect;
          change(view);
          own.steps = view.steps ?? [];
          if (view.cost?.length) own.cost = view.cost; else delete own.cost;
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
            <Chain
              effect={carrier} system={system} edit={editCarrier}
              title={`Что делает — когда №${index + 1}`}
              empty="шагов нет — отзывается, но ничего не делает"
              onMoveLane={moveLane}
              onRoll={handler.on === 'seen'}
              startAt={groupSteps(carrier.cost ?? []).length}
              lead={<SelfTrack effect={carrier} system={system} edit={editCarrier} onMoveLane={moveLane} />}
              {...(handler.confirm ? { onAddCost: (cost: string) => editCarrier(draft => {
                const taken = (draft.cost ?? []).map(s => String(s.id ?? ''));
                (draft.cost ??= []).unshift(payStep(cost, taken));
              }) } : {})}
            />
          </div>
        );
      })}
    </>
  );
}

const idleWords = (effect: Effect): string => {
  const also: string[] = [];
  if (effect.cost?.length) also.push('стоимость');
  if (effect.modifiers?.length) also.push('правки');
  return also.length
    ? `шагов нет — работает только ${also.join(' и ')}`
    : 'шагов ещё нет — эффект ничего не делает';
};

function Lifetime({ effect, system, id, edit }: {
  effect: Effect; system: System; id: string; edit: (change: (draft: Effect) => void) => void;
}) {
  const kind = effect.duration?.kind ?? 'permanent';
  const sheets = (effect.params ?? []).filter(param => param.kind === 'sheet');
  const holders = Object.entries(system.effects)
    .filter(([key, other]) => key !== id && (other.activation ?? 'manual') !== 'manual');
  const button = (effect.activation ?? 'manual') === 'manual';

  return (
    <div className="stack stack--tight">
      {button ? (
        <Field label="Держание" hint="Концентрация: наложенное этим действием держится, пока у листа есть эффект-держатель; взялся за новое — старое спало.">
          <Select
            value={effect.bond?.effect ?? ''}
            options={[['', 'не держится'], ...holders.map(([key, other]) => [key, `держит «${other.label ?? key}»`] as const)] as never}
            onChange={next => edit(draft => {
              if (!next) { delete draft.bond; return; }
              draft.bond = { effect: next, by: draft.bond?.by ?? sheets[0]?.key ?? '' };
            })}
          />
        </Field>
      ) : null}
      {button && effect.bond ? (
        <Field label="Держатель у листа">
          <Select
            value={effect.bond.by}
            options={sheets.map(param => [param.key, `«${param.label ?? param.key}»`] as const) as never}
            onChange={next => edit(draft => { if (draft.bond) draft.bond.by = next; })}
          />
        </Field>
      ) : null}

      {button ? null : (
        <Field label="Сколько висит">
          <Select
            value={kind}
            options={DURATION_OPTIONS as never}
            onChange={next => edit(draft => {
              draft.duration = COUNTED.has(next) ? { kind: next, max: draft.duration?.max ?? 1 } : { kind: next };
            })}
          />
        </Field>
      )}

      {!button && COUNTED.has(kind) ? (
        <Field label="Сколько">
          <Input
            type="number" value={effect.duration?.max ?? 1}
            onChange={next => edit(draft => {
              if (draft.duration && COUNTED.has(draft.duration.kind)) draft.duration.max = Math.max(1, Number(next) || 1);
            })}
          />
        </Field>
      ) : null}

      {!button && kind === 'turns' ? (
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

      {!button && kind === 'turns' ? (
        <Field label="Чьи ходы считать" hint="Лист из входа — как «до начала следующего хода того, кто наложил»: вход заполняет шаг «наложить».">
          <Select
            value={effect.duration?.by ?? ''}
            options={[['', 'носителя — того, на ком висит'], ...sheets.map(param => [param.key, `листа из входа «${param.label ?? param.key}»`] as const)] as never}
            onChange={next => edit(draft => {
              if (!draft.duration) return;
              if (next) draft.duration.by = next; else delete draft.duration.by;
            })}
          />
        </Field>
      ) : null}

      <Field label="Если наложить второй раз">
        <Select
          value={effect.reapply ?? 'ignore'}
          options={REAPPLY_OPTIONS}
          onChange={next => edit(draft => { draft.reapply = next; })}
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
  const track = effect.cost ?? [];
  if (!track.length) return null;
  const carrier = { ...effect, steps: track } as Effect;

  const editTrack = (change: (draft: Effect) => void) => edit(draft => {
    const own = { ...draft, steps: draft.cost ?? [] } as Effect;
    change(own);
    const steps = own.steps ?? [];
    if (steps.length) draft.cost = steps; else delete draft.cost;
  });

  return <Chain effect={carrier} system={system} edit={editTrack} lane="cost" onMoveLane={onMoveLane} bare />;
}
