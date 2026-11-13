import { roleOf, roleWordsOf, UNBOUND_HINT } from './roles.ts';
import { useState } from 'react';
import { paramsOf } from '@vtt/engine/model/inherit';
import { rolesOf } from '@vtt/engine/model/buttons';
import { EffectPick } from '../effect-pick.tsx';
import { ConditionField } from '../condition-field.tsx';
import { CallEditor } from '../call-editor.tsx';
import { TagsField } from '../tags-field.tsx';
import { useWorld } from '../../../store/world.ts';
import { newHandler, payStep } from '../factory.ts';
import { Card, CardHead, Field, Input, Select, DangerButton, LabelInput, Button, TextArea } from '../../../ui/primitives.tsx';
import { useOpened } from '../../../store/opened.ts';
import { useModifierRows, AddModifiers } from '../modifiers.tsx';
import { LAUNCH_KINDS, launchHint } from './words.ts';
import { HandlerCard } from './handler-card.tsx';
import { WhileWhenRow, WhileWhenEmpty } from './while-when.tsx';
import type { Place } from '@vtt/engine/model/names-at';
import { followKey, effectUsed } from '../keys.ts';
import { KeyField } from '../../../ui/key-field.tsx';
import { Chain, PayDivider, type Lane } from './chain.tsx';
import { groupSteps } from '../cards.ts';
import { BlockPick } from '../block-pick.tsx';
import { GrantsEditor } from '../grants-editor.tsx';
import { Extras } from './cards/extras.tsx';
import { ParamsEditor } from './params-editor.tsx';
import { BoundFormula } from '../bound-field.tsx';
import { ReturnsEditor } from './returns-editor.tsx';
import { launchOf, activationFor, DURATIONS, REAPPLY } from '@vtt/engine/model/effect-kinds';
import type { System, Effect, Step } from '@vtt/schema';
import { placeNamesAt } from './names.ts';

const DURATION_OPTIONS = Object.entries(DURATIONS).map(([key, word]) => [key, word.label] as const);

const COUNTED = new Set(['uses', 'rounds', 'turns', 'minutes', 'hours', 'days']);

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
  const role = roleOf(system, useWorld.getState().compendium, id);
  const props = `effect-props|${id}`;
  const more = useOpened(s => Boolean(s.opened[props]));
  const setMore = (open: boolean) => useOpened.getState().setOpen([props], open);
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
    if (more) useOpened.getState().setOpen([`effect-props|${next}`], true);
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
        <div className="effect-head__top">
          <span className="effect-head__name">
            <LabelInput value={effect.label ?? ''} placeholder="как зовётся эффект" onCommit={label => relabel(label)} />
          </span>
          <span className={`effect-head__kind effect-head__kind--${launch.kind}`} title={role === 'unbound' ? UNBOUND_HINT : launchHint(launch.kind)}>{roleWordsOf(effect, role)}</span>
          <span className="spacer" />
          <Button size="sm" variant="ghost" title="папка, метки, значок, имя в формулах" ariaLabel={more ? "свернуть «свойства»" : "развернуть «свойства»"} onClick={() => setMore(!more)}>{more ? 'свернуть свойства' : 'свойства'}</Button>
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
          <TextArea
            value={effect.description ?? ''}
            placeholder="что делает — словами книги правил"
            onChange={next => edit(draft => { if (next) draft.description = next; else delete draft.description; })}
          />
        </div>

        <Field label="Заметка автора" hint="видна только здесь, игроку не показывается">
          <span data-field="Заметка автора">
            <TextArea
              value={effect.note ?? ''}
              placeholder="для себя: почему так, что проверить"
              onChange={next => edit(draft => { if (next.trim()) draft.note = next; else delete draft.note; })}
            />
          </span>
        </Field>

        {more ? (
          <div className="stack stack--tight effect-head__more">
            <div className="effect-head__row">
              <Field label="Папка">
                <span data-field="Блок">
                  <BlockPick
                    of="effects"
                    system={system} value={effect.group}
                    onChange={next => edit(draft => { if (next) draft.group = next; else delete draft.group; })}
                  />
                </span>
              </Field>
            </div>
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
                <Input value={effect.icon ?? ''} placeholder="значок ⚔" onChange={next => edit(draft => { if (next.trim()) draft.icon = next.trim(); else delete draft.icon; })} />
              </span>
            </div>
            <details className="effect-head__kind-swap">
              <summary>сменить вид…</summary>
              <Field label="Вид" hint="Шаги действия и правки висящего друг в друга не переносятся">
                <span title={launchHint(launch.kind)}>
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
              </Field>
            </details>
            <EffectName id={id} locked={effectUsed(system, useWorld.getState().compendium, id)} taken={Object.keys(system.effects)} onChange={rekey} />
            {launch.kind === 'manual' ? (
              <Extras
                items={[{
                  key: 'bond', label: 'держание', on: !!effect.bond,
                  add: () => edit(draft => {
                    const holder = Object.entries(system.effects).find(([key, other]) => key !== id && (other.activation ?? 'manual') === 'passive')?.[0];
                    const by = rolesOf({ params: paramsOf(system, draft) }).actor;
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
                <Field label="Что даёт" hint="Пока висит этот эффект, висят и эти.">
                  <GrantsEditor system={system} value={effect.grants} except={id}
                    onChange={next => edit(draft => { draft.grants = next ?? []; })} />
                </Field>
              ),
            }]}
          />
        )}
      </Card>

      <ParamsEditor id={id} effect={effect} system={system} onEdit={edit} />
      {effect.returns?.length || launch.kind === 'manual' ? <ReturnsEditor id={id} effect={effect} system={system} onEdit={edit} /> : null}

      {pipeline ? (
        <>
          <Chain
            id={id} placeAt={index => ({ part: 'steps', index })}
            effect={effect} system={system} edit={edit}
            empty={idleWords(effect)}
            onEdgeUp={indices => moveLane(indices, 'cost')}
            startAt={groupSteps(effect.cost ?? []).filter(card => card.kind !== 'flow').length}
            lead={<SelfTrack id={id} at={index => ({ part: 'cost', index })} effect={effect} system={system} edit={edit} onMoveLane={moveLane} onAddCost={cost => edit(draft => { (draft.cost ??= []).push(payStep(system, draft, cost)); })} />}
            {...(effect.cost?.length ? {} : { onAddCost: (cost: string) => edit(draft => { (draft.cost ??= []).push(payStep(system, draft, cost)); }) })}
          />
        </>
      ) : (
        <WhileWhen id={id} effect={effect} system={system} edit={edit} />
      )}
    </>
  );
}

const HOOKS = [
  { turn: 'attach', title: 'При наложении', word: 'повесили', hint: 'шаги сразу, когда эффект повесили' },
  { turn: 'detach', title: 'При спадании', word: 'спало', hint: 'шаги в тот миг, когда эффект ушёл: истёк срок, сняли, оборвалась связь' },
] as const;

function WhileWhen({ id, effect, system, edit }: {
  id: string; effect: Effect; system: System; edit: (change: (draft: Effect) => void) => void;
}) {
  const editSystem = useWorld(s => s.editSystem);
  const modifiers = effect.modifiers ?? [];
  const list = useModifierRows({
    system, editSystem, modifiers, named: true,
    onEdit: change => edit(draft => { change(draft.modifiers ??= []); if (!draft.modifiers.length) delete draft.modifiers; }),
  });
  const absent = HOOKS.filter(({ turn }) => effect[turn] === undefined);
  const idle = !modifiers.length && !effect.on?.length && absent.length === HOOKS.length;
  return (
    <div className="stack">
      <CardHead title="Что делает, пока висит" />
      {idle ? <WhileWhenEmpty>Пока ничего не делает.</WhileWhenEmpty> : (
        <div className="mod-table">
          {list.rows}
          <Handlers id={id} effect={effect} system={system} edit={edit} />
          <Hooks id={id} effect={effect} system={system} edit={edit} />
        </div>
      )}
      <div className="inline inline--tight mod-add">
        <AddModifiers add={list.add} />
        <Button size="sm" onClick={() => edit(draft => { (draft.on ??= []).push(newHandler()); })}>+ когда</Button>
        {absent.map(({ turn, title, hint }) => (
          <Button key={turn} size="sm" title={hint} onClick={() => edit(draft => { draft[turn] = []; })}>
            + {title.toLowerCase()}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Hooks({ id, effect, system, edit }: {
  id: string; effect: Effect; system: System; edit: (change: (draft: Effect) => void) => void;
}) {
  return (
    <>
      {HOOKS.filter(({ turn }) => effect[turn] !== undefined).map(({ turn, title, word, hint }) => {
        const carrier = { ...effect, label: `${effect.label ?? ''} · ${title}`, steps: effect[turn] ?? [] } as Effect;
        const editCarrier = (change: (draft: Effect) => void) => edit(draft => {
          const view = { ...draft, steps: draft[turn] ?? [] } as Effect;
          change(view);
          draft[turn] = view.steps ?? [];
        });
        return (
          <div key={turn} className="mod-item">
            <WhileWhenRow when title={hint} removeTitle={`убрать «${title.toLowerCase()}»`} onRemove={() => edit(draft => { delete draft[turn]; })}>
              {word}
            </WhileWhenRow>
            <div className="stack when-body">
              <Chain id={id} placeAt={index => ({ part: turn, index })} effect={carrier} system={system} edit={editCarrier} title="делает:" lined empty="шагов нет — ничего не делает" />
            </div>
          </div>
        );
      })}
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
  return (
    <>
      {(effect.on ?? []).map((handler, index) => {
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
          <div key={index} className="mod-item">
            <HandlerCard
              id={id} index={index} handler={handler} system={system}
              startOpen={useOpened.getState().opened[`effect-props|${id}`] === true}
              edit={change => edit(draft => { const own = draft.on?.[index]; if (own) change(own); })}
              onRemove={() => edit(draft => {
                draft.on = (draft.on ?? []).filter((_, at) => at !== index);
                if (!draft.on.length) delete draft.on;
              })}
            />
            <div className="stack when-body">
              <Chain
                id={id} placeAt={step => ({ part: 'handler', handler: index, index: step })}
                effect={carrier} system={system} edit={editCarrier}
                title="делает:"
                lined
                empty="шагов нет — отзывается, но ничего не делает"
                onEdgeUp={indices => moveLane(indices, 'cost')}
                onRoll={handler.on === 'seen'}
                startAt={groupSteps(carrier.cost ?? []).filter(card => card.kind !== 'flow').length}
                lead={<SelfTrack id={id} at={step => ({ part: 'handler-cost', handler: index, index: step })} effect={carrier} system={system} edit={editCarrier} onMoveLane={moveLane} {...(handler.confirm ? { onAddCost: (cost: string) => editCarrier(draft => { (draft.cost ??= []).push(payStep(system, draft, cost)); }) } : {})} />}
                {...(handler.confirm && !handler.cost?.length ? { onAddCost: (cost: string) => editCarrier(draft => { (draft.cost ??= []).push(payStep(system, draft, cost)); }) } : {})}
              />
            </div>
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
    <div className="row">
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
        <Field label="Сколько" hint="число или формула от входов эффекта">
          <BoundFormula
            value={effect.duration?.max ?? 1} system={system} where="срок висящего эффекта"
            onChange={next => edit(draft => {
              if (!draft.duration || !COUNTED.has(draft.duration.kind)) return;
              draft.duration.max = next === null ? 1 : typeof next === 'number' ? Math.max(1, Math.floor(next) || 1) : next;
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

function SelfTrack({ id, at, effect, system, edit, onMoveLane, onAddCost }: {
  id: string;
  at: (index: number) => Place;
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
  onMoveLane: (indices: number[], to: Lane) => void;
  onAddCost?: (id: string) => void;
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

  return (
    <>
      <Chain id={id} placeAt={at} effect={carrier} system={system} edit={editTrack} lane="cost" onEdgeDown={indices => onMoveLane(indices, 'steps')} bare />
      <PayDivider system={system} except={id} {...(onAddCost ? { onAdd: onAddCost } : {})} />
    </>
  );
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
  const holder = system.effects[effect.bond?.effect ?? ''];
  const holderParams = holder ? paramsOf(system, holder) : [];
  const inputNames = new Map(paramsOf(system, effect).map(param => [param.key, param.label ?? param.key] as const));
  return (
    <div className="row">
      <Field label="Держит" hint="Наложенное этим действием держится, пока у листа есть эффект-держатель. Одно: взялся за новое — старое спало (концентрация). Каждое отдельно: у каждого действия свой держатель.">
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
      <ConditionField
        value={(effect.bond as { if?: { expr?: string } } | undefined)?.if?.expr}
        onChange={expr => edit(draft => {
          const bond = draft.bond as ({ if?: { expr: string } } & NonNullable<Effect['bond']>) | undefined;
          if (!bond) return;
          if (expr) bond.if = { expr }; else delete bond.if;
        })}
        system={system}
        quick={paramsOf(system, effect).filter(param => param.kind === 'boolean').map(param => ({ ref: param.key, label: param.label ?? param.key, kind: 'boolean' as const }))}
        names={inputNames}
        where="держание · только если"
        placeholder="например: @holds"
      />
      <Field label="Сколько держит">
        <Select
          value={effect.bond?.many ? 'many' : 'one'}
          options={[['one', 'одно — новое отпускает прежнее'], ['many', 'каждое отдельно']] as const}
          onChange={next => edit(draft => {
            if (!draft.bond) return;
            if (next === 'many') draft.bond.many = true; else { delete draft.bond.many; delete draft.bond.args; }
          })}
        />
      </Field>
      {effect.bond?.many && holderParams.length ? (
        <CallEditor
          system={system}
          effect={effect.bond.effect}
          args={effect.bond.args as Record<string, unknown> | undefined}
          onArg={(key, next) => edit(draft => {
            if (!draft.bond) return;
            const args = { ...(draft.bond.args ?? {}) };
            if (next === undefined || next === null || !String((next as { expr?: unknown }).expr ?? '').trim()) delete args[key]; else args[key] = next as { expr: string };
            if (Object.keys(args).length) draft.bond.args = args; else delete draft.bond.args;
          })}
          context={{ system, effect, earlier: [], names: placeNamesAt(system, id, { part: 'steps', index: (effect.steps ?? []).length }) }}
          where="держание · что запомнит держатель"
        />
      ) : null}
    </div>
  );
}


