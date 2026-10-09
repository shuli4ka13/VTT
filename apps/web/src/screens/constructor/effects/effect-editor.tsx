import { useState } from 'react';
import { paramsOf } from '@vtt/engine/model/inherit';
import { EffectPick } from '../effect-pick.tsx';
import { TagsField } from '../tags-field.tsx';
import { useWorld } from '../../../store/world.ts';
import { newHandler, payStep } from '../factory.ts';
import { Card, Field, Input, Select, DangerButton, LabelInput, Button, Empty } from '../../../ui/primitives.tsx';
import { useOpened } from '../../../store/opened.ts';
import { ModifiersEditor } from '../modifiers.tsx';
import { LAUNCH_KINDS, launchHint } from './words.ts';
import { HandlerCard } from './handler-card.tsx';
import type { Place } from '@vtt/engine/model/names-at';
import { followKey, effectUsed } from '../keys.ts';
import { KeyField } from '../../../ui/key-field.tsx';
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

export function EffectEditor({ id, effect, system }: { id: string; effect: Effect; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const editEffect = useWorld(s => s.editEffect);
  const pick = useWorld(s => s.pick);

  const edit = (change: (draft: Effect) => void) => editEffect(id, change);

  const launch = launchOf(effect);
  const [more, setMore] = useState(Boolean(effect.tags?.length || effect.icon || effect.bond));
  const pipeline = launch.kind === 'manual';

  const moveLane = (indices: number[], to: Lane) => {
    const fromList = (to === 'cost' ? effect.steps : effect.cost) ?? [];
    const first = fromList[indices[0] ?? 0];
    const at = to === 'cost' ? (effect.cost?.length ?? 0) : 0;
    useOpened.getState().setOpen([`step|${effect.label ?? ''}|${to}|${String(first?.id ?? at)}`], true);
    shiftLane(indices, to);
  };

  const shiftLane = (indices: number[], to: Lane) => edit(draft => { shiftBetween(draft, indices, to); });

  const rekey = (next: string) => {
    if (next === id || system.effects[next]) return;
    editSystem(draft => {
      draft.effects = Object.fromEntries(Object.entries(draft.effects).map(([key, value]) => [key === id ? next : key, value]));
    });
    pick({ activeEffectId: next });
  };
  const relabel = (label: string) => {
    const next = followKey({ used: effectUsed(system, useWorld.getState().compendium, id), key: id, base: 'effect', before: effect.label ?? '', after: label, taken: Object.keys(system.effects) });
    edit(draft => { draft.label = label; });
    if (next !== id) rekey(next);
  };

  return (
    <>
      <Card className="effect-head">
        <div className="effect-head__sentence">
          <span className="effect-head__name">
            <LabelInput value={effect.label ?? ''} placeholder="как зовётся эффект" onCommit={label => relabel(label)} />
          </span>
          <span>—</span>
          <span data-field="Как запускается" title={launchHint(launch.kind)}>
            <Select
              value={pipeline ? 'manual' : 'passive'}
              options={LAUNCH_KINDS.map(k => [k.key, k.label] as const)}
              onChange={next => edit(draft => {
                const activation = activationFor({ ...launchOf(draft), kind: next });
                if (activation === 'manual') delete draft.activation; else draft.activation = activation;
                if (next === 'manual') draft.steps ??= [];
              })}
            />
          </span>
          <span data-field="У кого есть">
            <Select
              value={(system.grants ?? []).includes(id) ? 'all' : 'given'}
              options={[['given', pipeline ? 'даёт запись или тип' : 'на кого повесили'], ['all', 'у всех листов']] as const}
              onChange={next => editSystem(draft => {
                const rest = (draft.grants ?? []).filter(x => x !== id);
                draft.grants = next === 'all' ? [...rest, id] : rest;
              })}
            />
          </span>
          <span>, в блоке</span>
          <span data-field="Блок">
            <BlockPick
              of="effects"
              system={system} value={effect.group}
              onChange={next => edit(draft => { if (next) draft.group = next; else delete draft.group; })}
            />
          </span>
          <span className="spacer" />
          <DangerButton size="sm" onConfirm={() => {
            editSystem(draft => {
              delete draft.effects[id];
              draft.grants = (draft.grants ?? []).filter(x => x !== id);
            });
            pick({ activeEffectId: null });
          }}>
            Удалить
          </DangerButton>
        </div>

        <div data-field="Описание" title="Текст на листе. На расчёт не влияет">
          <Input
            value={effect.description ?? ''}
            placeholder="описание: например, бьёшь оружием ближнего боя"
            onChange={next => edit(draft => { draft.description = next || undefined; })}
          />
        </div>

        <EffectName id={id} locked={effectUsed(system, useWorld.getState().compendium, id)} taken={Object.keys(system.effects)} onChange={rekey} />

        <div className="inline inline--tight effect-head__toggle">
          <Button size="sm" variant="ghost" onClick={() => setMore(!more)}>{more ? 'меньше' : 'ещё'}</Button>
        </div>
        {more ? (
          <div className="stack stack--tight effect-head__more">
            <div className="effect-head__row">
              <span data-field="Метки" title="Метки действия: подписки «всё с меткой», правки по метке и договор метки (какие входы обязаны быть)">
                <TagsField
                  system={system}
                  value={effect.tags}
                  empty="+ метка…"
                  onChange={next => edit(draft => { const list = next.filter((t): t is string => typeof t === 'string'); if (list.length) draft.tags = list; else delete draft.tags; })}
                />
              </span>
              <span data-field="Значок" title="Один символ на кнопке и в списке">
                <Input value={effect.icon ?? ''} placeholder="⚔" onChange={next => edit(draft => { if (next.trim()) draft.icon = next.trim(); else delete draft.icon; })} />
              </span>
            </div>
            {launch.kind === 'manual' ? (
              <Extras
                items={[{
                  key: 'bond', label: 'держание', on: !!effect.bond,
                  add: () => edit(draft => {
                    const holder = Object.entries(system.effects).find(([key, other]) => key !== id && (other.activation ?? 'manual') === 'passive')?.[0];
                    const by = paramsOf(system, draft).find(p => p.kind === 'sheet' && !p.many)?.key;
                    if (holder && by) draft.bond = { effect: holder, by };
                  }),
                  drop: () => edit(draft => { delete draft.bond; }),
                  node: <Bond effect={effect} system={system} id={id} edit={edit} />,
                }]}
              />
            ) : null}
          </div>
        ) : null}

        {launch.kind === 'manual' ? null : (
          <Extras
            items={[{
              key: 'duration', label: 'сколько висит', on: !!effect.duration,
              add: () => edit(draft => { draft.duration = { kind: 'permanent' }; }),
              drop: () => edit(draft => { delete draft.duration; delete draft.reapply; }),
              node: <Lifetime effect={effect} system={system} edit={edit} />,
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
        )}
      </Card>

      <ParamsEditor id={id} effect={effect} system={system} onEdit={edit} />

      {pipeline ? (
        <>
          <Chain
            id={id} placeAt={index => ({ part: 'steps', index })}
            effect={effect} system={system} edit={edit}
            empty={idleWords(effect)}
            onMoveLane={moveLane}
            startAt={groupSteps(effect.cost ?? []).filter(card => card.kind !== 'flow').length}
            lead={<SelfTrack id={id} at={index => ({ part: 'cost', index })} effect={effect} system={system} edit={edit} onMoveLane={moveLane} />}
            onAddCost={id => edit(draft => { (draft.cost ??= []).unshift(payStep(id)); })}
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
            onEdit={change => edit(draft => { change(draft.modifiers ??= []); if (!draft.modifiers.length) delete draft.modifiers; })}
          />
          <Handlers id={id} effect={effect} system={system} edit={edit} />
          <Hooks id={id} effect={effect} system={system} edit={edit} />
        </>
      )}
    </>
  );
}

const HOOKS = [
  ['attach', 'При наложении', 'шаги сразу, когда эффект повесили'],
  ['detach', 'При спадании', 'шаги в тот миг, когда эффект ушёл: истёк срок, сняли, оборвалась связь'],
] as const;

function Hooks({ id, effect, system, edit }: {
  id: string; effect: Effect; system: System; edit: (change: (draft: Effect) => void) => void;
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
            <Chain id={id} placeAt={index => ({ part: turn, index })} effect={carrier} system={system} edit={editCarrier} title={title} empty="шагов нет — ничего не делает" />
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
        const carrier = { ...effect, label: `${effect.label ?? ''} · когда ${index + 1}`, steps: handler.steps ?? [], cost: handler.cost } as Effect;
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
              id={id} placeAt={step => ({ part: 'handler', handler: index, index: step })}
              effect={carrier} system={system} edit={editCarrier}
              title={`Что делает — когда №${index + 1}`}
              empty="шагов нет — отзывается, но ничего не делает"
              onMoveLane={moveLane}
              onRoll={handler.on === 'seen'}
              startAt={groupSteps(carrier.cost ?? []).filter(card => card.kind !== 'flow').length}
              lead={<SelfTrack id={id} at={step => ({ part: 'handler-cost', handler: index, index: step })} effect={carrier} system={system} edit={editCarrier} onMoveLane={moveLane} />}
              {...(handler.confirm ? { onAddCost: (cost: string) => editCarrier(draft => { (draft.cost ??= []).unshift(payStep(cost)); }) } : {})}
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

function Lifetime({ effect, system, edit }: {
  effect: Effect; system: System; edit: (change: (draft: Effect) => void) => void;
}) {
  const kind = effect.duration?.kind ?? 'permanent';
  const sheets = paramsOf(system, effect).filter(param => param.kind === 'sheet' && !param.many);

  return (
    <div className="stack stack--tight">
      <Field label="Сколько висит">
        <Select
          value={kind}
          options={DURATION_OPTIONS as never}
          onChange={next => edit(draft => {
            draft.duration = COUNTED.has(next) ? { kind: next, max: draft.duration?.max ?? 1 } : { kind: next };
          })}
        />
      </Field>

      {COUNTED.has(kind) ? (
        <Field label="Сколько">
          <Input
            type="number" value={effect.duration?.max ?? 1}
            onChange={next => edit(draft => {
              if (draft.duration && COUNTED.has(draft.duration.kind)) draft.duration.max = Math.max(1, Number(next) || 1);
            })}
          />
        </Field>
      ) : null}

      {kind === 'turns' ? (
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

      {kind === 'turns' ? (
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

function SelfTrack({ id, at, effect, system, edit, onMoveLane }: {
  id: string;
  at: (index: number) => Place;
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

  return <Chain id={id} placeAt={at} effect={carrier} system={system} edit={editTrack} lane="cost" onMoveLane={onMoveLane} bare />;
}

function EffectName({ id, locked, taken, onChange }: { id: string; locked: boolean; taken: string[]; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline inline--tight step-name">
      {open ? (
        <>
          <span className="faint">имя в формулах и ссылках</span>
          <KeyField value={id} locked={locked} taken={taken} onChange={onChange} />
        </>
      ) : <Button size="sm" variant="ghost" title="как эффект зовётся в кнопках, подписках и вызовах" onClick={() => setOpen(true)}>имя в формулах…</Button>}
    </div>
  );
}

function Bond({ effect, system, id, edit }: {
  effect: Effect; system: System; id: string; edit: (change: (draft: Effect) => void) => void;
}) {
  const sheets = paramsOf(system, effect).filter(param => param.kind === 'sheet' && !param.many);
  return (
    <div className="row">
      <Field label="Держит" hint="Концентрация: наложенное этим действием держится, пока у листа есть эффект-держатель; взялся за новое — старое спало.">
        <EffectPick
          value={effect.bond?.effect || null}
          system={system}
          only={other => (other.activation ?? 'manual') === 'passive' && other !== system.effects[id]}
          empty="— какой висящий —"
          onChange={next => edit(draft => { if (typeof next === 'string') draft.bond = { effect: next, by: draft.bond?.by ?? sheets[0]?.key ?? '' }; })}
        />
      </Field>
      <Field label="У кого">
        <Select
          value={effect.bond?.by ?? ''}
          options={sheets.map(param => [param.key, `«${param.label ?? param.key}»`] as const) as never}
          onChange={next => edit(draft => { if (draft.bond && next) draft.bond.by = next; })}
        />
      </Field>
    </div>
  );
}


