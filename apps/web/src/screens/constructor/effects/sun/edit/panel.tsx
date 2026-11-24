import type { ReactElement, ReactNode } from 'react';
import { SEEN, launchOf } from '@vtt/engine';
import type { Sun, SunRay } from '@vtt/engine';
import type { Effect, System } from '@vtt/schema';
import { Button, CardHead, DangerButton, Fold } from '../../../../../ui/primitives.tsx';
import { useT } from '../../../../../i18n/author.ts';
import { useWorld } from '../../../../../store/world.ts';
import { groupSteps } from '../../../cards.ts';
import { Chain } from '../../chain.tsx';
import { carrierOf, editCarrier, placeOf, stepsOf } from '../../carrier.ts';
import { EffectHead, Lifetime, WhileWhen } from '../../effect-editor.tsx';
import { HandlerCard } from '../../handler-card.tsx';
import { ParamsEditor } from '../../params-editor.tsx';
import { ReturnsEditor } from '../../returns-editor.tsx';
import { canMove, canRemove, carrierPartOf, isBlockHead, moveAtom, rangeOf, removeAtom, removeHandler } from './ops.ts';
import type { Mode } from './ops.ts';
import type { SunEdit } from './use-sun-edit.ts';

export interface PanelProps {
  system: System;
  sun: Sun;
  effectId: string;
  effect: Effect;
  ray: SunRay | null;
  around: ReactNode;
  aroundOpen: boolean;
  edit: SunEdit;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onSelect: (key: string | null) => void;
  onRemoved: () => void;
  onAbout: () => void;
}

export const prefixShape = (steps: Effect['steps'], upTo: number): string =>
  groupSteps(steps ?? [])
    .filter(card => card.indices[0]! <= upTo)
    .map(card => `${card.kind}:${card.indices.length}${card.kind === 'flow' ? card.step.type : ''}`)
    .join('|');

function StepPanel({ system, effectId, effect, ray, edit, mode, onMode, onSelect, onRemoved, onAbout }: PanelProps & { ray: SunRay }): ReactElement {
  const t = useT('sunEdit');
  const span = ray.span!;
  const at = carrierPartOf(span)!;
  const cost = at.part === 'cost' || at.part === 'handler-cost';
  const range = rangeOf(effect, span);
  const handler = at.part === 'handler' ? effect.on?.[at.handler ?? 0] : undefined;

  const formEdit = (change: (draft: Effect) => void): void => {
    const live = (): Effect | undefined => useWorld.getState().system.effects[effectId];
    const before = live();
    const sig = before ? prefixShape(stepsOf(before, at), span.from) : '';
    edit(change);
    const after = live();
    if (before && after && stepsOf(after, at).length < stepsOf(before, at).length) onRemoved();
    if (!cost && after && prefixShape(stepsOf(after, at), span.from) !== sig) onSelect(null);
  };

  const run = (op: (draft: Effect) => string | null, fallback: string | null): void => {
    let key: string | null = null;
    edit(draft => { key = op(draft); }, { typing: false });
    onSelect(key ?? fallback);
  };

  return (
    <>
      <CardHead
        title={t('panel.step', { n: ray.number, label: ray.label })}
        actions={<Button size="sm" variant="ghost" title={t('panel.aboutTitle')} onClick={onAbout}>{t('panel.about')}</Button>}
      />
      {range ? (
        <div className={`sun-panel__step${cost ? '' : ' sun-panel__step--own'}`} key={`${effectId}|${ray.key}`}>
          <Chain
            bare
            id={effectId}
            placeAt={placeOf(at)}
            effect={carrierOf(effect, at)}
            system={system}
            edit={editCarrier(formEdit, at)}
            lane={cost ? 'cost' : 'steps'}
            only={range}
            numberAs={ray.number}
            onRoll={handler?.on === SEEN}
          />
        </div>
      ) : <p className="muted">{t('panel.empty')}</p>}
      {cost ? null : (
        <div className="sun-panel__row">
          <Button size="sm" title={t('panel.upTitle')} disabled={!canMove(effect, span)} onClick={() => run(draft => moveAtom(draft, system, effectId, span, -1), ray.key)}>{t('panel.up')}</Button>
          <Button size="sm" title={t('panel.downTitle')} disabled={!canMove(effect, span)} onClick={() => run(draft => moveAtom(draft, system, effectId, span, 1), ray.key)}>{t('panel.down')}</Button>
          {canRemove(effect, span) ? (
            <DangerButton size="sm" onConfirm={() => { run(draft => removeAtom(draft, span), null); onRemoved(); }}>{t('panel.remove')}</DangerButton>
          ) : null}
        </div>
      )}
      {isBlockHead(effect, span) ? (
        <div className="sun-panel__row" role="group" aria-label={t('panel.insertWhere')}>
          <span className="faint">{t('panel.insertWhere')}</span>
          <Button size="sm" variant={mode === 'inside' ? 'primary' : 'ghost'} title={t('panel.insideTitle')} onClick={() => onMode('inside')}>{t('panel.inside')}</Button>
          <Button size="sm" variant={mode === 'after' ? 'primary' : 'ghost'} title={t('panel.afterTitle')} onClick={() => onMode('after')}>{t('panel.afterBlock')}</Button>
        </div>
      ) : null}
    </>
  );
}

function HandlerPanel({ system, effectId, effect, ray, edit, onSelect, onAbout }: PanelProps & { ray: SunRay }): ReactElement | null {
  const t = useT('sunEdit');
  const index = ray.span!.handler ?? 0;
  const handler = effect.on?.[index];
  if (!handler) return null;
  const remove = (): void => {
    edit(draft => { removeHandler(draft, index); }, { typing: false });
    onSelect(null);
  };
  return (
    <>
      <CardHead
        title={t('panel.step', { n: ray.number, label: ray.label })}
        actions={<Button size="sm" variant="ghost" title={t('panel.aboutTitle')} onClick={onAbout}>{t('panel.about')}</Button>}
      />
      <div key={`${effectId}|${ray.key}`}>
        <HandlerCard
          id={effectId}
          index={index}
          handler={handler}
          system={system}
          startOpen
          edit={change => edit(draft => { const own = draft.on?.[index]; if (own) change(own); })}
          onRemove={remove}
        />
      </div>
      <div className="sun-panel__row">
        <DangerButton size="sm" onConfirm={remove}>{t('panel.removeHandler')}</DangerButton>
      </div>
    </>
  );
}

function HeadPanel({ system, effectId, effect, edit }: PanelProps): ReactElement {
  return (
    <>
      <EffectHead id={effectId} effect={effect} system={system} edit={edit} />
      <ParamsEditor id={effectId} effect={effect} system={system} onEdit={edit} />
      {effect.returns?.length || launchOf(effect).kind === 'manual' ? <ReturnsEditor id={effectId} effect={effect} system={system} onEdit={edit} /> : null}
    </>
  );
}

export function SunPanel(props: PanelProps): ReactElement {
  const t = useT('sunEdit');
  const { ray, effect, system, effectId, edit, around, aroundOpen } = props;
  const part = ray?.span?.part;
  let body: ReactElement;
  if (ray && ray.span && (part === 'steps' || part === 'cost' || part === 'attach' || part === 'detach' || part === 'handler' || part === 'handler-cost')) {
    body = <StepPanel {...props} ray={ray} />;
  } else if (ray && (part === 'handler-on' || part === 'handler-if' || part === 'handler-confirm')) {
    body = <HandlerPanel {...props} ray={ray} />;
  } else if (ray && part === 'modifiers') {
    body = <WhileWhen id={effectId} effect={effect} system={system} edit={edit} />;
  } else if (ray && part === 'duration') {
    body = <Lifetime effect={effect} system={system} edit={edit} />;
  } else {
    body = <HeadPanel {...props} />;
  }
  return (
    <aside className="sun-panel" aria-label={t('panel.label')} data-panel={ray?.key ?? 'center'}>
      {body}
      <Fold key={`${ray?.key ?? 'center'}|${aroundOpen}`} title={t('panel.around')} open={aroundOpen}>{around}</Fold>
    </aside>
  );
}
