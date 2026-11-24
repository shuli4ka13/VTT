import { useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { PHASES, mapOf, tagLinks, type MapEffect, type MapLayer, type MapLeak, type MapTag, type SunMap } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { useWorld } from '../../../../../store/world.ts';
import { useEffectView } from '../../../../../store/effect-view.ts';
import { useLocale } from '../../../../../store/locale.ts';
import { useT } from '../../../../../i18n/author.ts';
import { ViewSwitch } from '../view-switch.tsx';
import { blockKey, groupsOf, keyOf, relatedTo, summaryOf, type MapGroup, type Pick, type Related, type Target } from './map-model.ts';
import '../windows/windows.css';
import './map.css';

const LAYERS: { layer: MapLayer; tone: string }[] = [
  { layer: 'called', tone: 'called' },
  { layer: 'action', tone: 'action' },
  { layer: 'hanging', tone: 'hanging' },
];

export function MapScreen(): ReactElement {
  const t = useT('sunMap');
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const lang = useLocale(s => s.lang);
  const map = useMemo(() => mapOf(system, compendium), [system, compendium, lang]);
  const [picked, setPicked] = useState<Pick | null>(null);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());

  const links = useMemo(() => (picked?.kind === 'tag' ? tagLinks(system, picked.id, compendium) : null), [picked, system, compendium, lang]);
  const related = useMemo(() => (picked ? relatedTo(map, picked, links?.carries) : null), [map, picked, links]);
  const silent = useMemo(() => new Set(map.leaks.flatMap(leak => (leak.kind === 'silent-tag' ? [leak.tag] : []))), [map]);

  const reveal = (id: string): void => {
    const effect = map.effects.find(one => one.id === id);
    if (!effect) return;
    const key = blockKey(effect.layer, effect.group);
    setOpened(now => (now.has(key) ? now : new Set([...now, key])));
  };
  const select = (next: Pick | null): void => {
    setPicked(next);
    if (next?.kind === 'effect') reveal(next.id);
  };
  const toggle = (key: string): void => setOpened(now => {
    const out = new Set(now);
    if (!out.delete(key)) out.add(key);
    return out;
  });
  const openBubbles = (id: string): void => {
    useEffectView.getState().setView('sun');
    useWorld.getState().pick({ activeEffectId: id });
  };
  const pickTarget = (target: Target): void => {
    if (target.kind !== 'any') select({ kind: target.kind, id: target.id });
  };

  return (
    <div className="map">
      <MapHead system={system} leaks={map.leaks.length} />
      <div className="map__body">
        <div className="map__scheme" aria-label={t('scheme')}>
          <h2 className="map__title">{t('title')}</h2>
          <p className="map__lead">{t('lead')}</p>
          <TagsLayer tags={map.tags} silent={silent} picked={picked} related={related} onPick={select} />
          {LAYERS.map(({ layer, tone }, at) => (
            <div key={layer} className="map__stack">
              {layer === 'action' ? <p className="map__between map__between--up">{t('between.calls')}</p> : null}
              {layer === 'hanging' ? <p className="map__between">{t('between.none')}</p> : null}
              <EffectLayer
                layer={layer}
                tone={tone}
                map={map}
                opened={opened}
                picked={picked}
                related={related}
                onToggle={toggle}
                onPick={select}
                side={at === 2 ? t('layer.hangingSide') : null}
              />
            </div>
          ))}
          <Leaks system={system} leaks={map.leaks} onOpen={openBubbles} onTag={id => select({ kind: 'tag', id })} map={map} />
        </div>
        <aside className="map__panel" aria-label={t('panel.title')}>
          <Panel
            system={system}
            map={map}
            picked={picked}
            related={related}
            marks={links?.marks ?? []}
            contract={links?.contract ?? null}
            onPick={pickTarget}
            onClear={() => select(null)}
            onOpen={openBubbles}
          />
        </aside>
      </div>
    </div>
  );
}

function MapHead({ system, leaks }: { system: System; leaks: number }): ReactElement {
  const t = useT('sunMap');
  const path = [system.name || t('head.system'), t('head.title')];
  return (
    <div className="sun-head map__head">
      <nav className="sun-head__path" aria-label={t('head.path')}>
        {path.map((part, at) => (
          <span key={at} className={at === path.length - 1 ? 'sun-head__here' : 'muted'}>{at ? ' › ' : ''}{part}</span>
        ))}
      </nav>
      <span className="spacer" />
      {leaks === 0
        ? <span className="sun-state sun-state--ok map__state">{t('head.ok')}</span>
        : <span className="sun-state sun-state--bad map__state" title={t('head.badTitle')}>{t('head.bad', { n: leaks })}</span>}
      <ViewSwitch />
    </div>
  );
}

function LayerHead({ title, note, side }: { title: string; note: string; side?: string | null }): ReactElement {
  return (
    <div className="map-layer__head">
      <h3 className="map-layer__title">{title}</h3>
      <p className="map-layer__note">{note}</p>
      {side ? <span className="map-layer__side">{side}</span> : null}
    </div>
  );
}

interface TagsLayerProps {
  tags: MapTag[];
  silent: ReadonlySet<string>;
  picked: Pick | null;
  related: Related | null;
  onPick: (pick: Pick) => void;
}

function TagsLayer({ tags, silent, picked, related, onPick }: TagsLayerProps): ReactElement {
  const t = useT('sunMap');
  return (
    <section className="map-layer map-layer--tags" aria-label={t('layer.tags.title')}>
      <LayerHead title={t('layer.tags.title')} note={t('layer.tags.note')} />
      <div className="map-layer__blocks">
        {tags.length === 0 ? <p className="map__empty">{t('layer.empty')}</p> : null}
        {tags.map(tag => {
          const mine = picked?.kind === 'tag' && picked.id === tag.id;
          const dim = Boolean(related) && !related!.involved.has(keyOf('tag', tag.id));
          return (
            <button
              key={tag.id}
              type="button"
              className={`map-tag${mine ? ' is-picked' : ''}${dim ? ' is-dim' : ''}${silent.has(tag.id) ? ' is-silent' : ''}`}
              aria-pressed={mine}
              data-tag={tag.id}
              onClick={() => onPick({ kind: 'tag', id: tag.id })}
            >
              <span className="map-tag__name">{tag.label}</span>
              {tag.contract ? <span className="map-tag__mark">{t('tag.contract')}</span> : null}
              {silent.has(tag.id) ? <span className="map-tag__warn">⚠ {t('tag.silent')}</span> : null}
              <span className="map-tag__counts">{t('tag.counts', { carries: tag.carries, hears: tag.hears, edits: tag.edits })}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface EffectLayerProps {
  layer: MapLayer;
  tone: string;
  map: SunMap;
  opened: ReadonlySet<string>;
  picked: Pick | null;
  related: Related | null;
  side: string | null;
  onToggle: (key: string) => void;
  onPick: (pick: Pick) => void;
}

function EffectLayer({ layer, tone, map, opened, picked, related, side, onToggle, onPick }: EffectLayerProps): ReactElement {
  const t = useT('sunMap');
  const groups = useMemo(() => groupsOf(map, layer), [map, layer]);
  const heads: Record<MapLayer, { title: string; note: string }> = {
    called: { title: t('layer.called.title'), note: t('layer.called.note') },
    action: { title: t('layer.action.title'), note: t('layer.action.note') },
    hanging: { title: t('layer.hanging.title'), note: t('layer.hanging.note') },
  };
  const head = heads[layer];
  return (
    <section className={`map-layer map-layer--${tone}`} aria-label={head.title} data-layer={layer}>
      <LayerHead title={head.title} note={head.note} side={side} />
      <div className="map-layer__blocks">
        {groups.length === 0 ? <p className="map__empty">{t('layer.empty')}</p> : null}
        {groups.map(group => (
          <Block
            key={group.key}
            group={group}
            open={opened.has(blockKey(layer, group.key || undefined))}
            layer={layer}
            picked={picked}
            related={related}
            onToggle={onToggle}
            onPick={onPick}
          />
        ))}
      </div>
    </section>
  );
}

interface BlockProps {
  group: MapGroup;
  layer: MapLayer;
  open: boolean;
  picked: Pick | null;
  related: Related | null;
  onToggle: (key: string) => void;
  onPick: (pick: Pick) => void;
}

function Block({ group, layer, open, picked, related, onToggle, onPick }: BlockProps): ReactElement {
  const t = useT('sunMap');
  const key = blockKey(layer, group.key || undefined);
  const name = group.label || t('block.noBlock');
  const line = summaryOf(group.effects);
  const hit = related ? group.effects.some(one => related.involved.has(keyOf('effect', one.id))) : false;
  return (
    <div className={`map-block${open ? ' is-open' : ''}${related && !hit ? ' is-dim' : ''}${hit ? ' is-hit' : ''}`} data-block={key}>
      <button type="button" className="map-block__head" aria-expanded={open} title={t('block.toggle', { name })} onClick={() => onToggle(key)}>
        <span className="map-block__name">{name}</span>
        <span className="map-block__count">{t('block.count', { count: group.effects.length })}</span>
        <span className="map-block__line">
          {line.names.join(', ')}{line.rest ? ` ${t('block.more', { count: line.rest })}` : ''}
        </span>
      </button>
      {open ? (
        <ul className="map-block__rows">
          {group.effects.map(effect => (
            <EffectRow key={effect.id} effect={effect} picked={picked} related={related} onPick={onPick} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EffectRow({ effect, picked, related, onPick }: { effect: MapEffect; picked: Pick | null; related: Related | null; onPick: (pick: Pick) => void }): ReactElement {
  const t = useT('sunMap');
  const mine = picked?.kind === 'effect' && picked.id === effect.id;
  const near = Boolean(related) && related!.involved.has(keyOf('effect', effect.id));
  return (
    <li>
      <button
        type="button"
        className={`map-row${mine ? ' is-picked' : ''}${near && !mine ? ' is-near' : ''}${related && !near ? ' is-dim' : ''}`}
        aria-pressed={mine}
        data-effect={effect.id}
        onClick={() => onPick({ kind: 'effect', id: effect.id })}
      >
        <span className="map-row__name">{effect.label}</span>
        <span className="map-row__counts">{t('row.counts', { calls: effect.calls, calledBy: effect.calledBy, hears: effect.hears, edits: effect.edits })}</span>
      </button>
    </li>
  );
}

interface LeaksProps {
  system: System;
  map: SunMap;
  leaks: MapLeak[];
  onOpen: (id: string) => void;
  onTag: (id: string) => void;
}

function Leaks({ system, map, leaks, onOpen, onTag }: LeaksProps): ReactElement {
  const t = useT('sunMap');
  const name = (id: string): string => map.effects.find(one => one.id === id)?.label ?? id;
  const tagName = (id: string): string => map.tags.find(one => one.id === id)?.label ?? id;
  const stepName = (of: string, step: string): string => {
    const found = (system.effects?.[of]?.steps ?? []).find(one => (one as { id?: string }).id === step) as { label?: string } | undefined;
    return found?.label || step;
  };
  return (
    <section className="map-leaks" aria-label={t('leaks.title')}>
      <h3 className="map-leaks__title">{t('leaks.title')}</h3>
      {leaks.length === 0 ? <p className="map-leaks__none">{t('leaks.none')}</p> : (
        <ul className="map-leaks__list">
          {leaks.map((leak, at) => (
            <li key={at} className="map-leaks__row" data-leak={leak.kind}>
              <span className="map-leaks__text">
                {leak.kind === 'by-name' ? t('leaks.byName', { effect: name(leak.effect), of: name(leak.of) }) : null}
                {leak.kind === 'inner' ? t('leaks.inner', { effect: name(leak.effect), of: name(leak.of), names: leak.names.map(one => stepName(leak.of, one)).join(', ') }) : null}
                {leak.kind === 'silent-tag' ? t('leaks.silent', { tag: tagName(leak.tag) }) : null}
              </span>
              {leak.kind === 'silent-tag'
                ? <button type="button" className="sunw__link" onClick={() => onTag(leak.tag)}>{t('leaks.showTag', { name: tagName(leak.tag) })}</button>
                : <button type="button" className="sunw__link" onClick={() => onOpen(leak.effect)}>{t('leaks.open', { name: name(leak.effect) })}</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface PanelProps {
  system: System;
  map: SunMap;
  picked: Pick | null;
  related: Related | null;
  marks: string[];
  contract: ReturnType<typeof tagLinks>['contract'];
  onPick: (target: Target) => void;
  onClear: () => void;
  onOpen: (id: string) => void;
}

function Panel({ map, picked, related, marks, contract, onPick, onClear, onOpen }: PanelProps): ReactElement {
  const t = useT('sunMap');
  if (!picked || !related) return <p className="map__hint">{t('panel.hint')}</p>;
  const label = picked.kind === 'effect'
    ? map.effects.find(one => one.id === picked.id)?.label ?? picked.id
    : map.tags.find(one => one.id === picked.id)?.label ?? picked.id;
  const names = (items: Target[]): ReactNode => items.length === 0
    ? <span className="muted">{t('panel.nobody')}</span>
    : <ul className="map-panel__list">{items.map(item => (
      <li key={`${item.kind}|${item.id}`}><button type="button" className="sunw__link" onClick={() => onPick(item)}>{item.label}</button></li>
    ))}</ul>;
  const phased = (phase: string): string => PHASES[phase as keyof typeof PHASES]?.label ?? phase;
  const viaWords = { tag: t('via.tag'), id: t('via.id'), any: t('via.any') };
  const viaWord = (via: 'tag' | 'id' | 'any'): string => viaWords[via];
  const said = (key: string): string => contract?.said?.[key] ?? key;
  const marked = marks.map(id => ({ kind: 'effect' as const, id, label: map.effects.find(one => one.id === id)?.label ?? id }));
  return (
    <div className="map-panel" data-pick={picked.kind}>
      <div className="map-panel__head">
        <h3 className="map-panel__name">{label}</h3>
        <button type="button" className="sunw__link" onClick={onClear}>{t('panel.clear')}</button>
      </div>
      {picked.kind === 'effect' ? (
        <>
          <Part title={t('panel.calls')}>{names(related.calls)}</Part>
          <Part title={t('panel.calledBy')}>{names(related.calledBy)}</Part>
          <Part title={t('panel.carries')}>{names(related.carries)}</Part>
          <Part title={t('panel.hears')}>
            {related.hears.length === 0 ? <span className="muted">{t('panel.nobody')}</span> : (
              <ul className="map-panel__list">
                {related.hears.map((one, at) => (
                  <li key={at}>
                    {one.target.kind === 'any'
                      ? <span>{t('heardAny', { phase: phased(one.phase), via: viaWord(one.via) })}</span>
                      : <button type="button" className="sunw__link" onClick={() => onPick(one.target)}>{t('heard', { phase: phased(one.phase), via: viaWord(one.via), name: one.target.label })}</button>}
                  </li>
                ))}
              </ul>
            )}
          </Part>
          <Part title={t('panel.edits')}>
            {related.edits.length === 0 ? <span className="muted">{t('panel.nobody')}</span> : (
              <ul className="map-panel__list">
                {related.edits.map((one, at) => (
                  <li key={at}><button type="button" className="sunw__link" onClick={() => onPick(one.target)}>{t('edited', { via: viaWord(one.via), name: one.target.label })}</button></li>
                ))}
              </ul>
            )}
          </Part>
          <button type="button" className="map-panel__open" onClick={() => onOpen(picked.id)}>{t('panel.open')}</button>
        </>
      ) : (
        <>
          <Part title={t('panel.contract')}>
            {contract ? (
              <dl className="map-panel__contract">
                {contract.inputs?.length ? <><dt>{t('panel.inputs')}</dt><dd>{contract.inputs.map(one => said(one.key)).join(', ')}</dd></> : null}
                {contract.each ? <><dt>{t('panel.each')}</dt><dd>{said(contract.each)}</dd></> : null}
                {contract.outputs?.length ? <><dt>{t('panel.outputs')}</dt><dd>{contract.outputs.map(one => said(one.key)).join(', ')}</dd></> : null}
              </dl>
            ) : <span className="muted">{t('panel.noContract')}</span>}
          </Part>
          <Part title={t('panel.carriers')}>{names(related.carriers)}</Part>
          <Part title={t('panel.marks')}>{names(marked)}</Part>
          <Part title={t('panel.hearers')}>
            {related.hearers.length === 0 ? <span className="muted">{t('panel.nobody')}</span> : (
              <ul className="map-panel__list">
                {related.hearers.map((one, at) => (
                  <li key={at}><button type="button" className="sunw__link" onClick={() => onPick(one.who)}>{one.who.label} · {phased(one.phase)}</button></li>
                ))}
              </ul>
            )}
          </Part>
          <Part title={t('panel.editors')}>{names(related.editors)}</Part>
        </>
      )}
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="map-panel__part" aria-label={title}>
      <h4 className="map-panel__title">{title}</h4>
      {children}
    </section>
  );
}
