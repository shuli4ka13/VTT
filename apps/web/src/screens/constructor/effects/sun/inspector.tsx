import type { ReactElement, ReactNode } from 'react';
import { PHASES, SUN_KINDS, SUN_STAGES, tagSaid, type Meddle, type Seam, type Sun, type SunBubble, type SunRole, type System } from '@vtt/engine';
import { Button, Card, CardHead } from '../../../../ui/primitives.tsx';
import { useT } from '../../../../i18n/author.ts';
import type { Said } from './bubble.tsx';
import { KIND_LOOK, KIND_ORDER } from './kinds.ts';
import type { Placed } from './layout.ts';

export interface InspectorProps {
  system: System;
  sun: Sun;
  selected: Placed | null;
  onOpenEffect: (id: string) => void;
  onOpenForm: (step: number | null) => void;
}

const ROLES: readonly SunRole[] = ['reads', 'calls', 'meddle', 'gives', 'sets', 'stand', 'seam'];

const nameOf = (system: System, id: string, fallback?: string): string => system.effects[id]?.label || fallback || id;

function EffectLink({ system, id, fallback, onOpen }: { system: System; id: string; fallback?: string; onOpen: (id: string) => void }): ReactElement {
  const t = useT('sun');
  const name = nameOf(system, id, fallback);
  return <button type="button" className="sun-link" title={t('insp.openEffect', { name })} onClick={() => onOpen(id)}>{name}</button>;
}

function viaWords(seam: Seam, system: System, t: Said): string {
  if (seam.via === 'any') return t('insp.viaAny');
  if (seam.via === 'tag') return t('insp.viaTag', { name: tagSaid(system, seam.key) });
  return t('insp.viaId');
}

function Inputs({ system, sun }: { system: System; sun: Sun }): ReactElement {
  const t = useT('sun');
  const effect = system.effects[sun.effect];
  const params = effect?.params ?? [];
  const returns = effect?.returns ?? [];
  return (
    <>
      <Card>
        <CardHead title={`${t('insp.inputsHead')} · ${t('bubble.inputs', { count: sun.inputs })}`} />
        {params.length ? <ul className="sun-list">{params.map(one => <li key={one.key}>{one.label || one.key}</li>)}</ul> : <p className="muted">{t('insp.inputsNone')}</p>}
      </Card>
      <Card>
        <CardHead title={t('insp.returnsHead')} />
        {returns.length ? <ul className="sun-list">{returns.map(one => <li key={one.key}>{one.label || one.key}</li>)}</ul> : <p className="muted">{t('insp.returnsNone')}</p>}
      </Card>
    </>
  );
}

function Seams({ system, sun, onOpenEffect }: { system: System; sun: Sun; onOpenEffect: (id: string) => void }): ReactElement {
  const t = useT('sun');
  const by = new Map<string, Seam[]>();
  for (const seam of sun.seams) by.set(seam.by, [...(by.get(seam.by) ?? []), seam]);
  return (
    <>
      <Card>
        <CardHead title={t('insp.seamsHead')} />
        {by.size === 0 ? <p className="muted">{t('insp.seamsNone')}</p> : null}
        {[...by.entries()].map(([id, seams]) => (
          <div key={id} className="sun-seam">
            <EffectLink system={system} id={id} fallback={seams[0]?.label} onOpen={onOpenEffect} />
            {[...new Set(seams.map(seam => t('insp.seamLine', { phase: PHASES[seam.phase].label, via: viaWords(seam, system, t) })))].map((line, at) => (
              <p key={at} className="sun-seam__line">{line}</p>
            ))}
          </div>
        ))}
      </Card>
      {sun.stands.length ? (
        <Card>
          <CardHead title={t('insp.standsHead')} />
          <ul className="sun-list">
            {sun.stands.map((stand, at) => (
              <li key={at}>
                <EffectLink system={system} id={stand.effect} fallback={stand.label} onOpen={onOpenEffect} />
                {' › '}{stand.rayLabel}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function RayInfo({ system, placed, onOpenEffect, onOpenForm }: InspectorProps & { placed: Placed }): ReactElement | null {
  const t = useT('sun');
  const ray = placed.ray;
  if (!ray) return null;
  const once = ray.bubbles.filter((one, at) => !one.seam || ray.bubbles.findIndex(other => other.seam?.by === one.seam!.by) === at);
  const byRole = ROLES.map(role => [role, once.filter(one => one.role === role)] as const).filter(([, list]) => list.length);
  const step = ray.span?.part === 'steps' ? ray.span.from : null;
  const line = (one: SunBubble, at: number): ReactElement => (
    <li key={at}>
      <span className={`sun-chip ${KIND_LOOK[one.kind].cls}`} aria-hidden>{KIND_LOOK[one.kind].icon}</span>
      {one.seam ? <EffectLink system={system} id={one.seam.by} fallback={one.label} onOpen={onOpenEffect} /> : one.stand ? <EffectLink system={system} id={one.stand.effect} fallback={one.label} onOpen={onOpenEffect} /> : one.meddle ? t('bubble.meddle', { edits: one.meddle.sources.length, asks: one.meddle.asks.length }) : one.label}
      {one.meddle ? null : <span className="muted"> · {SUN_KINDS[one.kind]}</span>}
    </li>
  );
  return (
    <Card>
      <CardHead title={`${ray.number}. ${ray.label}`} sub={t('insp.stage', { stage: SUN_STAGES[ray.stage] })} />
      {byRole.length === 0 ? <p className="muted">{t('insp.noCompanions')}</p> : null}
      {byRole.map(([role, list]) => (
        <div key={role} className="sun-role">
          <span className="sun-role__name">{t(`insp.role_${role}`)}</span>
          <ul className="sun-list">{list.map(line)}</ul>
        </div>
      ))}
      <Button size="sm" onClick={() => onOpenForm(step)}>{t('insp.openForm')}</Button>
    </Card>
  );
}

function MeddleInfo({ system, meddle, onOpenEffect }: { system: System; meddle: Meddle; onOpenEffect: (id: string) => void }): ReactElement {
  const t = useT('sun');
  const words = new Map<string, string[]>();
  for (const edit of meddle.edits) {
    const key = edit.word && system.roll_edits?.[edit.word] ? edit.word : '';
    const parts = [edit.label];
    if (edit.side === 'roller') parts.push(t('insp.sideRoller'));
    if (edit.side === 'against') parts.push(t('insp.sideAgainst'));
    const head = parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(', ')})` : parts[0]!;
    const text = edit.needs.length ? `${head} — ${edit.needs.map(name => t('insp.needs', { name: tagSaid(system, name) })).join(', ')}` : head;
    const list = words.get(key) ?? [];
    if (!list.includes(text)) list.push(text);
    words.set(key, list);
  }
  const asks = meddle.asks.filter(one => one.confirm);
  const selfs = meddle.asks.filter(one => !one.confirm);
  const people = (list: typeof asks): ReactElement => (
    <ul className="sun-list">
      {list.map((one, at) => <li key={at}><EffectLink system={system} id={one.effect} fallback={one.label} onOpen={onOpenEffect} /></li>)}
    </ul>
  );
  return (
    <>
      <Card>
        <CardHead title={t('insp.editsHead', { n: meddle.sources.length })} />
        {words.size === 0 ? <p className="muted">{t('insp.editsNone')}</p> : null}
        {[...words.entries()].map(([word, list]) => (
          <div key={word} className="sun-role">
            <span className="sun-role__name">{word ? system.roll_edits?.[word]?.label || word : t('insp.otherEdits')}</span>
            <p>{list.join(', ')}</p>
          </div>
        ))}
      </Card>
      {asks.length ? <Card><CardHead title={t('insp.asksHead', { n: asks.length })} />{people(asks)}</Card> : null}
      {selfs.length ? <Card><CardHead title={t('insp.selfHead', { n: selfs.length })} />{people(selfs)}</Card> : null}
    </>
  );
}

export function Legend(): ReactElement {
  const t = useT('sun');
  return (
    <Card>
      <CardHead title={t('insp.legendHead')} sub={t('insp.legendNote')} />
      <ul className="sun-legend">
        {KIND_ORDER.map(kind => (
          <li key={kind}>
            <span className={`sun-chip ${KIND_LOOK[kind].cls} sun-chip--${KIND_LOOK[kind].frame}`} aria-hidden>{KIND_LOOK[kind].icon}</span>
            {SUN_KINDS[kind]}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Inspector(props: InspectorProps): ReactElement {
  const { system, sun, selected, onOpenEffect } = props;
  let body: ReactNode;
  const group = selected?.group;
  if (!selected || selected.what === 'center') {
    body = <><Inputs system={system} sun={sun} /><Seams system={system} sun={sun} onOpenEffect={onOpenEffect} /></>;
  } else if (group?.role === 'meddle' && group.items[0]?.meddle) {
    body = <MeddleInfo system={system} meddle={group.items[0].meddle} onOpenEffect={onOpenEffect} />;
  } else {
    body = <RayInfo {...props} placed={selected} />;
  }
  return <aside className="sun-inspector">{body}<Legend /></aside>;
}
