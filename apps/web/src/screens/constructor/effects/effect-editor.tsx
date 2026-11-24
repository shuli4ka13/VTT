import { roleOf, roleWordsOf, unboundHint } from './roles.ts';
import { useState } from 'react';
import { paramsOf, rolesOf, launchOf, activationFor, DURATIONS, REAPPLY } from '@vtt/engine';
import type { NamePlace as Place } from '@vtt/engine';
import { EffectPick } from '../effect-pick.tsx';
import { ConditionField } from '../condition-field.tsx';
import { CallEditor } from '../call-editor.tsx';
import { TagsField } from '../tags-field.tsx';
import { useWorld } from '../../../store/world.ts';
import { newHandler, payStep, giveContractReturns } from '../factory.ts';
import { Card, CardHead, Field, Input, Select, DangerButton, LabelInput, Button, TextArea } from '../../../ui/primitives.tsx';
import { useOpened } from '../../../store/opened.ts';
import { useModifierRows, AddModifiers } from '../modifiers.tsx';
import { LAUNCH_KINDS, launchHint } from './words.ts';
import { HandlerCard } from './handler-card.tsx';
import { HOOKS, carrierOf, editCarrier, placeOf, costCarrier, editCost } from './carrier.ts';
import { WhileWhenRow, WhileWhenEmpty } from './while-when.tsx';
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
import type { System, Effect, Step } from '@vtt/schema';
import { placeNamesAt } from './names.ts';
import { useT, t as tt } from '../../../i18n/author.ts';

const durationOptions = () => Object.entries(DURATIONS).map(([key, word]) => [key, word.label] as const);

const COUNTED = new Set(['uses', 'rounds', 'turns', 'minutes', 'hours', 'days']);

const reapplyOptions = () => (Object.keys(REAPPLY) as (keyof typeof REAPPLY)[]).map(key => [key, REAPPLY[key].label] as const);

export function EffectEditor({ id, effect, system }: { id: string; effect: Effect; system: System }) {
  const editEffect = useWorld(s => s.editEffect);

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
      <EffectHead id={id} effect={effect} system={system} edit={edit} />

      <ParamsEditor id={id} effect={effect} system={system} onEdit={edit} />
      {effect.returns?.length || launch.kind === 'manual' ? <ReturnsEditor id={id} effect={effect} system={system} onEdit={edit} /> : null}

      {pipeline ? (
        <>
          <Chain
            id={id} placeAt={placeOf({ part: 'steps' })}
            effect={effect} system={system} edit={edit}
            empty={idleWords(effect)}
            onEdgeUp={indices => moveLane(indices, 'cost')}
            startAt={groupSteps(effect.cost ?? []).filter(card => card.kind !== 'flow').length}
            lead={<SelfTrack id={id} at={placeOf({ part: 'cost' })} effect={effect} system={system} edit={edit} onMoveLane={moveLane} onAddCost={cost => edit(draft => { (draft.cost ??= []).push(payStep(system, draft, cost)); })} />}
            {...(effect.cost?.length ? {} : { onAddCost: (cost: string) => edit(draft => { (draft.cost ??= []).push(payStep(system, draft, cost)); }) })}
          />
        </>
      ) : (
        <WhileWhen id={id} effect={effect} system={system} edit={edit} />
      )}
    </>
  );
}

export function EffectHead({ id, effect, system, edit }: {
  id: string; effect: Effect; system: System; edit: (change: (draft: Effect) => void) => void;
}) {
  const t = useT('effects');
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);

  const launch = launchOf(effect);
  const role = roleOf(system, useWorld.getState().compendium, id);
  const props = `effect-props|${id}`;
  const more = useOpened(s => Boolean(s.opened[props]));
  const setMore = (open: boolean) => useOpened.getState().setOpen([props], open);
  const pipeline = launch.kind === 'manual';

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
      <Card className="effect-head">
        <div className="effect-head__top">
          <span className="effect-head__name">
            <LabelInput value={effect.label ?? ''} placeholder={t('common:name.effect')} onCommit={label => relabel(label)} />
          </span>
          <span className={`effect-head__kind effect-head__kind--${launch.kind}`} title={role === 'unbound' ? unboundHint() : launchHint(launch.kind)}>{roleWordsOf(effect, role)}</span>
          <span className="spacer" />
          <Button size="sm" variant="ghost" title={t('editor.propsTitle')} ariaLabel={more ? t('common:fold.collapse', { name: t('editor.props') }) : t('common:fold.expand', { name: t('editor.props') })} onClick={() => setMore(!more)}>{more ? t('editor.propsCollapse') : t('editor.props')}</Button>
          <DangerButton size="sm" onConfirm={() => {
            editSystem(draft => {
              delete draft.effects[id];
              draft.grants = (draft.grants ?? []).filter(x => x !== id);
            });
            pick({ activeEffectId: null });
          }}>
            {t('common:delete')}
          </DangerButton>
        </div>

        <div data-field={t('editor.descField')} title={t('editor.descTitle')}>
          <TextArea
            value={effect.description ?? ''}
            placeholder={t('editor.descPlaceholder')}
            onChange={next => edit(draft => { if (next) draft.description = next; else delete draft.description; })}
          />
        </div>

        <Field label={t('editor.noteLabel')} hint={t('editor.noteHint')}>
          <span data-field={t('editor.noteLabel')}>
            <TextArea
              value={effect.note ?? ''}
              placeholder={t('editor.notePlaceholder')}
              onChange={next => edit(draft => { if (next.trim()) draft.note = next; else delete draft.note; })}
            />
          </span>
        </Field>

        {more ? (
          <div className="stack stack--tight effect-head__more">
            <div className="effect-head__row">
              <Field label={t('editor.folder')}>
                <span data-field={t('editor.blockField')}>
                  <BlockPick
                    of="effects"
                    system={system} value={effect.group}
                    onChange={next => edit(draft => { if (next) draft.group = next; else delete draft.group; })}
                  />
                </span>
              </Field>
            </div>
            <div className="effect-head__row">
              <span data-field={t('editor.tagsField')} title={t('editor.tagsTitle')}>
                <TagsField
                  system={system}
                  value={effect.tags}
                  empty={t('editor.tagsEmpty')}
                  onChange={next => edit(draft => { const list = next.filter((tag): tag is string => typeof tag === 'string'); if (list.length) draft.tags = list; else delete draft.tags; giveContractReturns(system, draft); })}
                />
              </span>
              <span data-field={t('editor.iconField')} title={t('editor.iconTitle')}>
                <Input value={effect.icon ?? ''} placeholder={t('editor.iconPlaceholder')} onChange={next => edit(draft => { if (next.trim()) draft.icon = next.trim(); else delete draft.icon; })} />
              </span>
            </div>
            <details className="effect-head__kind-swap">
              <summary>{t('editor.swap')}</summary>
              <Field label={t('editor.kindLabel')} hint={t('editor.kindHint')}>
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
            {launch.kind === 'manual' && (effect.bond || (effect.steps ?? []).some(step => step.type === 'status' && String((step as { mode?: unknown }).mode ?? 'apply') === 'apply')) ? (
              <Extras
                items={[{
                  key: 'bond', label: t('editor.extras.bond'), on: !!effect.bond,
                  add: () => edit(draft => {
                    const holder = Object.entries(system.effects).find(([key, other]) => key !== id && (other.activation ?? 'manual') === 'passive')?.[0];
                    const by = rolesOf({ params: paramsOf(system, draft) }).actor;
                    if (holder && by) draft.bond = { effect: holder, by };
                  }),
                  drop: () => edit(draft => { delete draft.bond; for (const step of draft.steps ?? []) delete (step as { unbound?: unknown }).unbound; }),
                  node: <Bond effect={effect} system={system} id={id} edit={edit} />,
                }]}
              />
            ) : null}
          </div>
        ) : null}

        {launch.kind === 'manual' ? null : (
          <Extras
            items={[{
              key: 'duration', label: t('editor.extras.duration'), on: !!effect.duration,
              add: () => edit(draft => { draft.duration = { kind: 'permanent' }; }),
              drop: () => edit(draft => { delete draft.duration; delete draft.reapply; }),
              node: <Lifetime effect={effect} system={system} edit={edit} />,
            }, {
              key: 'grants', label: t('editor.extras.grants'), on: !!effect.grants,
              add: () => edit(draft => { draft.grants = []; }),
              drop: () => edit(draft => { delete draft.grants; }),
              node: (
                <Field label={t('editor.grantsLabel')} hint={t('editor.grantsHint')}>
                  <GrantsEditor system={system} value={effect.grants} except={id}
                    onChange={next => edit(draft => { draft.grants = next ?? []; })} />
                </Field>
              ),
            }]}
          />
        )}
      </Card>
  );
}

export function WhileWhen({ id, effect, system, edit }: {
  id: string; effect: Effect; system: System; edit: (change: (draft: Effect) => void) => void;
}) {
  const t = useT('effects');
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
      <CardHead title={t('whileWhen.title')} />
      {idle ? <WhileWhenEmpty>{t('whileWhen.idle')}</WhileWhenEmpty> : (
        <div className="mod-table">
          {list.rows}
          <Handlers id={id} effect={effect} system={system} edit={edit} />
          <Hooks id={id} effect={effect} system={system} edit={edit} />
        </div>
      )}
      <div className="inline inline--tight mod-add">
        <AddModifiers add={list.add} />
        <Button size="sm" onClick={() => edit(draft => { (draft.on ??= []).push(newHandler()); })}>{t('whileWhen.addWhen')}</Button>
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
  const t = useT('effects');
  return (
    <>
      {HOOKS.filter(({ turn }) => effect[turn] !== undefined).map(({ turn, title, word, hint }) => {
        const at = { part: turn } as const;
        const carrier = carrierOf(effect, at);
        return (
          <div key={turn} className="mod-item">
            <WhileWhenRow when title={hint} removeTitle={t('whileWhen.removeHook', { name: title.toLowerCase() })} onRemove={() => edit(draft => { delete draft[turn]; })}>
              {word}
            </WhileWhenRow>
            <div className="stack when-body">
              <Chain id={id} placeAt={placeOf(at)} effect={carrier} foldName={`${effect.label ?? ''} · ${turn}`} system={system} edit={editCarrier(edit, at)} title={t('whileWhen.does')} lined empty={t('whileWhen.hookEmpty')} />
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
  const t = useT('effects');
  return (
    <>
      {(effect.on ?? []).map((handler, index) => {
        const at = { part: 'handler', handler: index } as const;
        const carrier = carrierOf(effect, at);
        const editHandler = editCarrier(edit, at);
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
                id={id} placeAt={placeOf(at)}
                effect={carrier} foldName={`${effect.label ?? ''} · on ${index + 1}`} system={system} edit={editHandler}
                title={t('whileWhen.does')}
                lined
                empty={t('whileWhen.handlerEmpty')}
                onEdgeUp={indices => moveLane(indices, 'cost')}
                onRoll={handler.on === 'seen'}
                startAt={groupSteps(carrier.cost ?? []).filter(card => card.kind !== 'flow').length}
                lead={<SelfTrack id={id} at={placeOf({ part: 'handler-cost', handler: index })} effect={carrier} foldName={`${effect.label ?? ''} · on ${index + 1}`} system={system} edit={editHandler} onMoveLane={moveLane} {...(handler.confirm ? { onAddCost: (cost: string) => editHandler(draft => { (draft.cost ??= []).push(payStep(system, draft, cost)); }) } : {})} />}
                {...(handler.confirm && !handler.cost?.length ? { onAddCost: (cost: string) => editHandler(draft => { (draft.cost ??= []).push(payStep(system, draft, cost)); }) } : {})}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}



const idleWords = (effect: Effect): string => {
  const cost = Boolean(effect.cost?.length);
  const mods = Boolean(effect.modifiers?.length);
  if (!cost && !mods) return tt('effects:chain.empty');
  return tt('effects:idle.only', { what: cost && mods ? tt('effects:idle.both') : cost ? tt('effects:idle.cost') : tt('effects:idle.mods') });
};

export function Lifetime({ effect, system, edit }: {
  effect: Effect; system: System; edit: (change: (draft: Effect) => void) => void;
}) {
  const t = useT('effects');
  const kind = effect.duration?.kind ?? 'permanent';
  const ends = [['turn-end', t('lifetime.endsTurnEnd')], ['turn-start', t('lifetime.endsTurnStart')]] as const;
  const sheets = paramsOf(system, effect).filter(param => param.kind === 'sheet' && !param.many);

  return (
    <div className="row">
      <Field label={t('lifetime.duration')}>
        <Select
          value={kind}
          options={durationOptions() as never}
          onChange={next => edit(draft => {
            draft.duration = COUNTED.has(next) ? { kind: next, max: draft.duration?.max ?? 1 } : { kind: next };
          })}
        />
      </Field>

      {COUNTED.has(kind) ? (
        <Field label={t('lifetime.count')} hint={t('lifetime.countHint')}>
          <BoundFormula
            value={effect.duration?.max ?? 1} system={system} where={t('lifetime.countWhere')}
            onChange={next => edit(draft => {
              if (!draft.duration || !COUNTED.has(draft.duration.kind)) return;
              draft.duration.max = next === null ? 1 : typeof next === 'number' ? Math.max(1, Math.floor(next) || 1) : next;
            })}
          />
        </Field>
      ) : null}

      {kind === 'turns' ? (
        <Field label={t('lifetime.ends')} hint={t('lifetime.endsHint')}>
          <Select
            value={effect.duration?.ends ?? 'turn-end'}
            options={ends}
            onChange={next => edit(draft => {
              if (!draft.duration) return;
              if (next === 'turn-start') draft.duration.ends = next; else delete draft.duration.ends;
            })}
          />
        </Field>
      ) : null}

      {kind === 'turns' ? (
        <Field label={t('lifetime.by')} hint={t('lifetime.byHint')}>
          <Select
            value={effect.duration?.by ?? ''}
            options={[['', t('lifetime.byHolder')], ...sheets.map(param => [param.key, t('lifetime.byInput', { name: param.label ?? param.key })] as const)] as never}
            onChange={next => edit(draft => {
              if (!draft.duration) return;
              if (next) draft.duration.by = next; else delete draft.duration.by;
            })}
          />
        </Field>
      ) : null}

      <Field label={t('lifetime.reapply')}>
        <Select
          value={effect.reapply ?? 'ignore'}
          options={reapplyOptions()}
          onChange={next => edit(draft => { draft.reapply = next; })}
        />
      </Field>
    </div>
  );
}

function SelfTrack({ id, at, effect, system, edit, onMoveLane, onAddCost, foldName }: {
  id: string;
  at: (index: number) => Place;
  effect: Effect;
  system: System;
  edit: (change: (draft: Effect) => void) => void;
  onMoveLane: (indices: number[], to: Lane) => void;
  onAddCost?: (id: string) => void;
  foldName?: string;
}) {
  if (!(effect.cost ?? []).length) return null;
  const carrier = costCarrier(effect);
  const editTrack = editCost(edit);

  return (
    <>
      <Chain id={id} placeAt={at} effect={carrier} {...(foldName ? { foldName } : {})} system={system} edit={editTrack} lane="cost" onEdgeDown={indices => onMoveLane(indices, 'steps')} bare />
      <PayDivider system={system} except={id} {...(onAddCost ? { onAdd: onAddCost } : {})} />
    </>
  );
}

function EffectName({ id, locked, taken, onChange }: { id: string; locked: boolean; taken: string[]; onChange: (next: string) => void }) {
  const t = useT('effects');
  const [open, setOpen] = useState(false);
  return (
    <div className="inline inline--tight step-name">
      {open ? (
        <>
          <span className="faint">{t('name.formulas')}</span>
          <KeyField value={id} locked={locked} taken={taken} onChange={onChange} />
        </>
      ) : <Button size="sm" variant="ghost" title={t('name.title')} onClick={() => setOpen(true)}>{t('name.button')}</Button>}
    </div>
  );
}

function Bond({ effect, system, id, edit }: {
  effect: Effect; system: System; id: string; edit: (change: (draft: Effect) => void) => void;
}) {
  const t = useT('effects');
  const sheets = paramsOf(system, effect).filter(param => param.kind === 'sheet' && !param.many);
  const holder = system.effects[effect.bond?.effect ?? ''];
  const holderParams = holder ? paramsOf(system, holder) : [];
  const inputNames = new Map(paramsOf(system, effect).map(param => [param.key, param.label ?? param.key] as const));
  return (
    <div className="row">
      <Field label={t('bond.anchor')} hint={t('bond.anchorHint')}>
        <EffectPick
          value={effect.bond?.effect || null}
          system={system}
          only={other => (other.activation ?? 'manual') === 'passive' && other !== system.effects[id]}
          empty={t('bond.anchorEmpty')}
          onChange={next => edit(draft => { if (typeof next === 'string') draft.bond = { effect: next, by: draft.bond?.by ?? sheets[0]?.key ?? '' }; })}
        />
      </Field>
      <Field label={t('bond.holder')}>
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
        where={t('bond.ifWhere')}
        placeholder={t('bond.ifPlaceholder')}
      />
      <Field label={t('bond.count')}>
        <Select
          value={effect.bond?.many ? 'many' : 'one'}
          options={[['one', t('bond.one')], ['many', t('bond.many')]] as const}
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
          where={t('bond.argsWhere')}
        />
      ) : null}
    </div>
  );
}


