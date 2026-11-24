import type { ReactElement } from 'react';
import { PHASES, ROLL_CALL } from '@vtt/engine';
import type { ChainButton, Compendium, RecordChain, SunBubble, SunRay, System } from '@vtt/engine';
import { chainOf } from '@vtt/engine';
import { useT } from '../../../../../i18n/author.ts';
import { formulaWords } from '../../../../../ui/formula-words.ts';
import { Link, kindStyle, uniq } from '../windows/parts.tsx';
import { mergeMeddle } from '../windows/meddle.tsx';
import './chain.css';

export interface RecordChainViewProps {
  system: System;
  compendium: Compendium;
  recordId: string;
  onOpenEffect?: (id: string) => void;
  onClose: () => void;
}

const unique = (items: readonly string[]): string[] => items.filter((item, at) => items.indexOf(item) === at);

const quoted = (names: readonly string[]): string => names.map(name => `«${name}»`).join(', ');

function fillWord(system: System, value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'expr' in value) return formulaWords(system, String((value as { expr: unknown }).expr ?? ''));
  if (Array.isArray(value)) return value.map(item => fillWord(system, item)).join(', ');
  if (value && typeof value === 'object') return '…';
  return String(value ?? '');
}

function Note({ ray }: { ray: SunRay }) {
  const t = useT('sunChain');
  const by = (role: string, kind?: string): string[] => unique(uniq(ray.bubbles.filter(one => one.role === role && (!kind || one.kind === kind))).map(one => one.label));
  const joined = (names: string[]): string => names.length > 1 ? `${quoted(names.slice(0, -1))} ${t('and')} «${names[names.length - 1]}»` : quoted(names);
  const parts: string[] = [];
  if (ray.repeat) parts.push(t('note.each'));
  const calls = by('calls');
  if (calls.length) parts.push(t('note.calls', { names: joined(calls) }));
  const tags = by('sets', 'tag');
  if (tags.length) parts.push(t('note.tags', { names: quoted(tags) }));
  const fields = by('sets', 'field');
  if (fields.length) parts.push(t('note.sets', { names: quoted(fields) }));
  const states = by('sets', 'state');
  if (states.length) parts.push(t('note.applies', { names: quoted(states) }));
  if (ray.kind === 'ask') parts.push(t('note.asks'));
  if (ray.kind === 'stop') parts.push(t('note.stops'));
  if (!parts.length) return null;
  return <span className="chain__note faint">{parts.join(' · ')}</span>;
}

function Name({ id, onOpen, children }: { id: string; onOpen?: (id: string) => void; children: string }): ReactElement {
  return onOpen ? <Link onClick={() => onOpen(id)}>{children}</Link> : <span>{children}</span>;
}

function hearersOf(button: ChainButton, ray: SunRay): { id: string; label: string }[] {
  const called = new Set(ray.bubbles.filter(one => one.role === 'calls' && one.ref?.effect).map(one => one.ref!.effect!));
  const seen = new Set<string>();
  return button.node.children
    .filter(child => called.has(child.effect))
    .flatMap(child => child.seams.map(seam => ({ id: seam.by, label: seam.label })))
    .filter(item => !seen.has(item.id) && seen.add(item.id));
}

function Meddling({ bubbles, after, onOpenEffect }: { bubbles: readonly SunBubble[]; after: readonly { id: string; label: string }[]; onOpenEffect?: (id: string) => void }) {
  const t = useT('sunChain');
  const merged = mergeMeddle(bubbles.filter(one => one.role === 'meddle'));
  const rolls = bubbles.some(one => one.meddle?.call === ROLL_CALL);
  const asks = unique(merged.asks.map(ask => ask.label));
  const askIds = new Map(merged.asks.map(ask => [ask.label, ask.effect]));
  const seams = bubbles.filter(one => (one.role === 'seam' && one.seam) || (one.role === 'stand' && one.stand));
  const named = (one: SunBubble): { id: string; label: string; phase: keyof typeof PHASES } => one.seam
    ? { id: one.seam.by, label: one.seam.label, phase: one.seam.phase }
    : { id: one.stand!.effect, label: one.stand!.label, phase: one.stand!.phase };
  const items = seams.map(named);
  const seen = new Set<string>();
  const shown = items.filter(item => !seen.has(item.id) && seen.add(item.id));
  const phases = unique(items.map(item => PHASES[item.phase].label));
  if (!asks.length && !merged.sources.length && !shown.length && !after.length) return <span className="chain__none faint">—</span>;
  const own = merged.sources.length;
  return (
    <div className="chain__meddle">
      <span className="chain__meddle-mark" aria-hidden="true">⚡</span>
      <div className="chain__meddle-body">
        {own ? <p>{t('meddle.own', { n: own })}</p> : null}
        {asks.length ? (
          <p>
            {asks.slice(0, 3).map((name, at) => (
              <span key={name}>{at ? ', ' : ''}<Name id={askIds.get(name)!} onOpen={onOpenEffect}>{name}</Name></span>
            ))}
            {asks.length > 3 ? ` ${t('moreN', { n: asks.length - 3 })}` : ''}
          </p>
        ) : null}
        {asks.length || (own && rolls) ? <p className="faint">{t('meddle.dice')}</p> : null}
        {own && !rolls ? <p className="faint">{t('meddle.amount')}</p> : null}
        {after.length ? (
          <p>
            <span className="faint">{t('meddle.after')} </span>
            {after.slice(0, 4).map((item, at) => (
              <span key={item.id}>{at ? ', ' : ''}<Name id={item.id} onOpen={onOpenEffect}>{item.label}</Name></span>
            ))}
            {after.length > 4 ? ` ${t('moreN', { n: after.length - 4 })}` : ''}
          </p>
        ) : null}
        {shown.length ? (
          <p>
            {shown.map((item, at) => (
              <span key={item.id}>{at ? ', ' : ''}<Name id={item.id} onOpen={onOpenEffect}>{item.label}</Name></span>
            ))}
          </p>
        ) : null}
        {shown.length ? <p className="faint">{phases.join(' / ')}</p> : null}
      </div>
    </div>
  );
}

function Block({ system, one, chain, onOpenEffect }: { system: System; one: ChainButton; chain: RecordChain; onOpenEffect?: (id: string) => void }) {
  const t = useT('sunChain');
  const rays = [...one.sun.rays.filter(ray => ray.span !== null), ...one.sun.rays.filter(ray => ray.span === null)];
  const shared = one.shared.slice(0, 3).join(', ');
  const rest = one.shared.length - 3;
  const rows = rays.length;
  return (
    <section className="chain__block" style={{ '--chain-rows': rows + 1 } as Record<string, number>}>
      <div className="chain__cell chain__cell--record">
        <h3 className="chain__head">{t('col.record')}</h3>
        <strong>{chain.label}</strong>
        <span className="faint">{chain.tableLabel}</span>
        <h4 className="chain__sub">{t('fills')}</h4>
        {one.fills.length ? one.fills.map(fill => (
          <div key={fill.key} className="chain__fill"><span className="faint">{fill.label}</span><span>{fillWord(system, fill.value)}</span></div>
        )) : <span className="faint">{t('noFills')}</span>}
      </div>
      <div className="chain__cell chain__cell--effect">
        <h3 className="chain__head">{t('col.effect')}</h3>
        <strong>{one.label}</strong>
        <span className="faint">{one.via === 'grant' ? t('hangs') : t('button', { said: one.said ?? '' })}</span>
        {one.shared.length ? <span className="faint">{t('shared', { names: `${shared}${rest > 0 ? ` ${t('moreN', { n: rest })}` : ''}` })}</span> : null}
        {onOpenEffect ? <button type="button" className="btn btn--small chain__open" onClick={() => onOpenEffect(one.effect)}>{t('open')}</button> : null}
      </div>
      <h3 className="chain__head chain__head--order">{t('col.order')}</h3>
      <h3 className="chain__head chain__head--meddle">{t('col.meddle')}</h3>
      {rays.map((ray, index) => (
        <div key={ray.key} className="chain__ray" data-row={index + 2} style={{ ...kindStyle(ray.kind), '--r': index + 2 } as Record<string, unknown>}>
          <div className={`chain__step${ray.under ? ' is-under' : ''}`}>
            <span className="chain__step-name">{ray.span === null ? t('after') : `${ray.number} · ${ray.label}`}</span>
            <Note ray={ray} />
          </div>
          <div className="chain__side"><Meddling bubbles={ray.bubbles.filter(item => item.role === 'meddle' || item.role === 'seam' || item.role === 'stand')} after={hearersOf(one, ray)} onOpenEffect={onOpenEffect} /></div>
        </div>
      ))}
    </section>
  );
}

export function RecordChainView({ system, compendium, recordId, onOpenEffect, onClose }: RecordChainViewProps): ReactElement {
  const t = useT('sunChain');
  const chain = chainOf(system, compendium, recordId);
  return (
    <div className="chain">
      <header className="chain__top">
        <div className="chain__titles">
          <h2 className="chain__title">{t('title', { name: chain?.label ?? recordId })}</h2>
          <span className="faint">{t('lead')}</span>
        </div>
        <button type="button" className="sunw__x" aria-label={t('closeX')} onClick={onClose}>×</button>
      </header>
      {chain && chain.buttons.length ? chain.buttons.map((one, index) => (
        <Block key={`${one.via}:${one.effect}:${index}`} system={system} one={one} chain={chain} onOpenEffect={onOpenEffect} />
      )) : <p className="faint">{t('empty')}</p>}
    </div>
  );
}
