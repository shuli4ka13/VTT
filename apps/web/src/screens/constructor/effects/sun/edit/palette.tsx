import { useState } from 'react';
import type { ReactElement } from 'react';
import { PHASES, rolledLabel, seenLabel } from '@vtt/engine';
import type { Sun, SunRay } from '@vtt/engine';
import type { Effect, System } from '@vtt/schema';
import { Button } from '../../../../../ui/primitives.tsx';
import { useT, t as tt } from '../../../../../i18n/author.ts';
import { useWorld } from '../../../../../store/world.ts';
import { BRICKS, SEEN_BRICKS } from '../../../cards.ts';
import { callableOf } from '../../chain.tsx';
import { withRole } from '../../roles.ts';
import { HAPPENINGS, addHandler, canInsert, happeningFor, insertStep, placeFor } from './ops.ts';
import type { HappeningKind, Mode, Template } from './ops.ts';
import type { SunEdit } from './use-sun-edit.ts';

export interface PaletteProps {
  system: System;
  sun: Sun;
  effectId: string;
  effect: Effect;
  ray: SunRay | null;
  mode: Mode;
  edit: SunEdit;
  onSelect: (key: string | null) => void;
  collapsed: boolean;
  onToggle: () => void;
}

interface Chip {
  key: string;
  label: string;
  kind: string;
  hint: string;
  template?: Template;
  happening?: HappeningKind;
}

interface Group { key: string; title: string; chips: Chip[] }

const strip = (label: string): string => label.replace(/^\+ /, '');

const happeningLabel = (kind: HappeningKind): string => {
  switch (kind) {
    case 'before':
    case 'after':
    case 'done': return `${PHASES[kind].label} …`;
    case 'seen': return seenLabel();
    case 'rolled': return rolledLabel();
    default: return tt(`effects:handler.kind.${kind}`);
  }
};

export function Palette({ system, sun, effectId, effect, ray, mode, edit, onSelect, collapsed, onToggle }: PaletteProps): ReactElement {
  const t = useT('sunEdit');
  const compendium = useWorld(state => state.compendium);
  const [query, setQuery] = useState('');

  if (collapsed) {
    return (
      <aside className="sun-palette sun-palette--closed" aria-label={t('palette.label')}>
        <Button size="sm" variant="ghost" title={t('palette.showTitle')} onClick={onToggle}>{t('palette.show')}</Button>
      </aside>
    );
  }

  const bricks: Chip[] = BRICKS.map(one => ({ key: `brick:${one.key}`, label: strip(one.label), kind: 'step', hint: one.hint, template: { kind: 'brick', key: one.key } }));
  const seen: Chip[] = SEEN_BRICKS.map(one => ({ key: `seen:${one.key}`, label: strip(one.label), kind: 'step', hint: one.hint, template: { kind: 'seen', key: one.key } }));
  const happened: Chip[] = sun.launch === 'manual' ? [] : HAPPENINGS.map(kind => ({ key: `happen:${kind}`, label: happeningLabel(kind), kind: 'heard', hint: '', happening: kind }));
  const calls: Chip[] = callableOf(system, effectId).map(([key, one]) => ({ key: `call:${key}`, label: one.label || key, kind: 'call', hint: one.description ?? '', template: { kind: 'call', effect: key } }));
  const states: Chip[] = Object.entries(system.effects ?? {})
    .filter(([key, one]) => key !== effectId && (one.activation ?? 'manual') === 'passive')
    .map(([key, one]) => ({ key: `status:${key}`, label: one.label || key, kind: 'state', hint: one.description ?? '', template: { kind: 'status', effect: key } }));
  const costs: Chip[] = withRole(system, compendium, 'pay', effectId)
    .map(([key, one]) => ({ key: `pay:${key}`, label: one.label || key, kind: 'cost', hint: one.description ?? '', template: { kind: 'pay', effect: key } }));

  const reasonOf = (chip: Chip): string | null => {
    if (!chip.template) return null;
    const verdict = canInsert(effect, system, effectId, placeFor(effect, sun, ray, mode, chip.template), chip.template);
    return verdict === true ? null : t(verdict);
  };

  const seenShown = seen.some(chip => reasonOf(chip) === null);
  const needle = query.trim().toLowerCase();
  const found = (chips: Chip[]): Chip[] => (needle ? chips.filter(chip => chip.label.toLowerCase().includes(needle)) : chips);

  const core: Group[] = [
    { key: 'steps', title: t('palette.steps'), chips: found(bricks) },
    ...(seenShown ? [{ key: 'seen', title: t('palette.seen'), chips: found(seen) }] : []),
    { key: 'happened', title: t('palette.happened'), chips: found(happened) },
  ];
  const mine: Group[] = [
    { key: 'effects', title: t('palette.effects'), chips: found(calls) },
    { key: 'states', title: t('palette.states'), chips: found(states) },
    { key: 'costs', title: t('palette.costs'), chips: found(costs) },
  ];

  const run = (chip: Chip): void => {
    if (chip.happening) {
      let key: string | null = null;
      edit(draft => { key = addHandler(draft, happeningFor(chip.happening!)); }, { typing: false });
      onSelect(key);
      return;
    }
    const template = chip.template;
    if (!template) return;
    const spot = placeFor(effect, sun, ray, mode, template);
    if (!spot || canInsert(effect, system, effectId, spot, template) !== true) return;
    let key: string | null = null;
    edit(draft => { key = insertStep(draft, system, effectId, spot, template); }, { typing: false });
    if (key) onSelect(key);
  };

  const chipView = (chip: Chip): ReactElement => {
    const reason = reasonOf(chip);
    const title = reason ?? (chip.happening ? t('palette.handlerTitle', { name: chip.label }) : chip.hint || t('palette.chipTitle', { name: chip.label }));
    return (
      <button
        key={chip.key}
        type="button"
        className={`sun-pill sun-k--${chip.kind}${reason ? ' sun-pill--off' : ''}`}
        data-palette={chip.key}
        title={title}
        aria-label={reason ? `${chip.label}: ${reason}` : chip.label}
        aria-disabled={reason ? true : undefined}
        onClick={() => { if (!reason) run(chip); }}
      >
        {chip.label}
      </button>
    );
  };

  const zone = (title: string, groups: Group[]): ReactElement => (
    <section className="sun-palette__zone">
      <h3 className="sun-palette__zone-title">{title}</h3>
      {groups.filter(group => group.chips.length).map(group => (
        <div key={group.key} className="sun-palette__group">
          <span className="sun-palette__group-title">{group.title}</span>
          <div className="sun-palette__chips">{group.chips.map(chipView)}</div>
        </div>
      ))}
    </section>
  );

  const nothing = [...core, ...mine].every(group => !group.chips.length);

  return (
    <aside className="sun-palette" aria-label={t('palette.label')}>
      <div className="sun-palette__top">
        <span className="sun-palette__title">{t('palette.title')}</span>
        <Button size="sm" variant="ghost" title={t('palette.hideTitle')} onClick={onToggle}>{t('palette.hide')}</Button>
      </div>
      <input
        type="search"
        className="sun-palette__search"
        aria-label={t('palette.search')}
        placeholder={t('palette.searchHolder')}
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
      {zone(`◆ ${t('palette.core')}`, core)}
      {zone(t('palette.mine'), mine)}
      {nothing ? <p className="muted">{t('palette.nothing')}</p> : null}
    </aside>
  );
}
