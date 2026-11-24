import type { ReactElement } from 'react';
import { LAUNCHES, blockLabel, blockOf, tagSaid, type Sun, type System } from '@vtt/engine';
import { Button } from '../../../../ui/primitives.tsx';
import { useT } from '../../../../i18n/author.ts';
import { useEffectView } from '../../../../store/effect-view.ts';
import { useProblems } from '../../problems.ts';
import { ViewSwitch } from './view-switch.tsx';

export interface SunHeadProps {
  system: System;
  sun: Sun;
  effectId: string;
  onBack: () => void;
  undo?: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void };
}

export function SunHead({ system, sun, effectId, onBack, undo }: SunHeadProps): ReactElement {
  const t = useT('sun');
  const e = useT('sunEdit');
  const trail = useEffectView(s => s.trail);
  const problems = useProblems().filter(one => one.where.effect === effectId).length;
  const effect = system.effects[effectId];
  const block = effect ? blockOf(system, effect) : undefined;
  const marks = (effect?.tags ?? []).map(tag => tagSaid(system, tag));
  const path = [system.name || t('head.system'), block ? blockLabel(system, block) : null, sun.label].filter(Boolean) as string[];
  return (
    <div className="sun-head">
      {trail.length ? <Button size="sm" variant="ghost" title={t('head.backTitle')} onClick={onBack}>{t('head.back')}</Button> : null}
      <nav className="sun-head__path" aria-label={t('head.path')}>
        {path.map((part, at) => (
          <span key={at} className={at === path.length - 1 ? 'sun-head__here' : 'muted'}>{at ? ' › ' : ''}{part}</span>
        ))}
      </nav>
      <span className="chip sun-head__chip" title={LAUNCHES[sun.launch].hint}>{[LAUNCHES[sun.launch].label, ...marks].join(' · ')}</span>
      <span className="spacer" />
      {problems === 0
        ? <span className="sun-state sun-state--ok">{t('head.noProblems', { rays: t('head.rays', { count: sun.rays.length }) })}</span>
        : <span className="sun-state sun-state--bad" title={t('head.problemsTitle')}>{t('head.problems', { n: problems })}</span>}
      {undo ? (
        <>
          <Button size="sm" title={e('head.undoTitle')} disabled={!undo.canUndo} onClick={undo.onUndo}>{e('head.undo')}</Button>
          <Button size="sm" title={e('head.redoTitle')} disabled={!undo.canRedo} onClick={undo.onRedo}>{e('head.redo')}</Button>
        </>
      ) : null}
      <ViewSwitch />
    </div>
  );
}
