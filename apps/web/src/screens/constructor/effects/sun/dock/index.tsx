import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Sun, System } from '@vtt/engine';
import { useT } from '../../../../../i18n/author.ts';
import { PreviewPanel } from '../../preview-panel.tsx';
import { useProblems, whereLabel } from '../../../problems.ts';
import { bookButtonsOf, callMap } from '../../call-map.ts';
import './dock.css';

export interface SunDockProps {
  system: System;
  effectId: string;
  sun: Sun;
  onOpenEffect: (id: string) => void;
  onOpenForm: (step: number | null) => void;
}

type Tab = 'trial' | 'problems' | 'used';

export function SunDock({ system, effectId, sun, onOpenEffect, onOpenForm }: SunDockProps): ReactElement {
  const t = useT('sunWindow');
  const found = useProblems().filter(problem => problem.where.effect === effectId);
  const [chosen, setChosen] = useState<Tab | null>(null);
  const [folded, setFolded] = useState(false);
  const tab: Tab = chosen ?? (found.length ? 'problems' : 'trial');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'trial', label: t('dock.trial') },
    { key: 'problems', label: t('dock.problems', { n: found.length }) },
    { key: 'used', label: t('dock.used') },
  ];
  return (
    <div className={`sundock${folded ? ' is-folded' : ''}`}>
      <div className="sundock__tabs" role="tablist" aria-label={t('dock.tabs')}>
        {tabs.map(one => (
          <button
            key={one.key} type="button" role="tab" aria-selected={tab === one.key}
            className={`sundock__tab${tab === one.key ? ' is-on' : ''}`} onClick={() => { setChosen(one.key); setFolded(false); }}
          >{one.label}</button>
        ))}
        <span className="sundock__gap" />
        <button type="button" className="sundock__tab" aria-expanded={!folded} onClick={() => setFolded(!folded)}>{folded ? t('dock.unfold') : t('dock.fold')}</button>
      </div>
      <div className="sundock__body" role="tabpanel" hidden={folded}>
        {tab === 'trial' ? (sun.launch === 'manual' ? <PreviewPanel effectId={effectId} only="trial" /> : <p className="faint">{t('dock.later')}</p>) : null}
        {tab === 'problems' ? (
          found.length ? found.map((problem, index) => (
            <div key={index} className="sundock__row">
              <div className="sundock__text">
                <span>{problem.text}</span>
                <span className="faint">{whereLabel(problem.where, system)}</span>
              </div>
              <button type="button" className="sunw__link" onClick={() => onOpenForm(problem.where.step ?? null)}>{t('dock.openForm')}</button>
            </div>
          )) : <p className="faint">{t('dock.noProblems')}</p>
        ) : null}
        {tab === 'used' ? <Used system={system} effectId={effectId} onOpenEffect={onOpenEffect} /> : null}
      </div>
    </div>
  );
}

function Used({ system, effectId, onOpenEffect }: { system: System; effectId: string; onOpenEffect: (id: string) => void }) {
  const t = useT('sunWindow');
  const map = callMap(system, effectId);
  const book = bookButtonsOf(system, effectId);
  const name = (id: string): string => system.effects?.[id]?.label || id;
  if (!map.usedBy.length && !book.length && !map.heardBy.length) return <p className="faint">{t('dock.nobody')}</p>;
  const links = (ids: string[]) => ids.map(id => <button key={id} type="button" className="sunw__link" onClick={() => onOpenEffect(id)}>{name(id)}</button>);
  return (
    <div className="sundock__list">
      {map.usedBy.length ? <div className="sundock__row"><span className="sundock__name">{t('dock.callers')}</span><div className="sundock__chips">{links(map.usedBy.map(one => one.id))}</div></div> : null}
      {book.length ? <div className="sundock__row"><span className="sundock__name">{t('dock.book')}</span><div className="sundock__chips">{book.map(one => <span key={`${one.key}:${one.button}`}>{one.table} › {one.button}</span>)}</div></div> : null}
      {map.heardBy.length ? <div className="sundock__row"><span className="sundock__name">{t('dock.heard')}</span><div className="sundock__chips">{links(map.heardBy)}</div></div> : null}
    </div>
  );
}
