import type { TFunction } from 'i18next';
import type { CSSProperties, ReactElement } from 'react';
import { LAUNCHES, SUN_KINDS, SUN_STAGES, type Sun } from '@vtt/engine';
import { useT } from '../../../../i18n/author.ts';
import { lookOf } from './kinds.ts';
import type { Placed, SunGroup } from './layout.ts';

export interface BubbleProps {
  placed: Placed;
  sun: Sun;
  selected: boolean;
  onPick: (placed: Placed) => void;
}

export type Said = TFunction;

export function groupNames(group: SunGroup): string[] {
  return [...new Set(group.items.map(item => item.label))];
}

export function groupText(group: SunGroup, t: Said, full: boolean): string {
  const names = groupNames(group);
  const shown = full ? names.join(', ') : group.label + (group.more ? ` +${group.more}` : '');
  if (group.role === 'meddle') {
    const meddle = group.items[0]?.meddle;
    return t('bubble.meddle', { edits: meddle?.sources.length ?? 0, asks: meddle?.asks.length ?? 0 });
  }
  if (group.role === 'seam') return t('bubble.seam', { names: shown });
  if (group.role === 'stand') return t('bubble.stand', { names: shown });
  return shown;
}

export function Bubble({ placed, sun, selected, onPick }: BubbleProps): ReactElement {
  const t = useT('sun');
  const style: CSSProperties = { left: placed.x - placed.r, top: placed.y - placed.r, width: placed.r * 2, height: placed.r * 2 };
  const classes = ['sun-bubble'];
  if (selected) classes.push('sun-bubble--on');
  let body: ReactElement;
  let full: string;

  if (placed.what === 'center') {
    const sub = sun.inputs > 0 ? t('bubble.inputs', { count: sun.inputs }) : LAUNCHES[sun.launch].label;
    classes.push('sun-bubble--center');
    full = t('bubble.center', { name: sun.label, sub });
    body = <><span className="sun-bubble__name">{sun.label}</span><span className="sun-bubble__sub">{sub}</span></>;
  } else if (placed.what === 'ray' && placed.ray) {
    const ray = placed.ray;
    const look = lookOf(ray.kind);
    classes.push('sun-bubble--ray', look.cls, `sun-bubble--${look.frame}`);
    if (ray.repeat) classes.push('sun-bubble--repeat');
    const notes: string[] = [SUN_STAGES[ray.stage]];
    if (ray.repeat) notes.push(t('bubble.repeat'));
    if (ray.under) notes.push(t('bubble.under'));
    full = `${t('bubble.ray', { number: ray.number, label: ray.label })} (${notes.join(', ')})`;
    body = (
      <>
        <span className="sun-bubble__num">{ray.kind === 'step' ? null : <span aria-hidden>{look.icon} </span>}{ray.number}</span>
        <span className="sun-bubble__text">{ray.label}</span>
        {ray.under ? <span className="sun-bubble__under" aria-hidden>↳</span> : null}
      </>
    );
  } else {
    const group = placed.group!;
    const look = lookOf(group.kind);
    classes.push('sun-bubble--group', look.cls, `sun-bubble--${look.frame}`);
    const long = groupText(group, t, true);
    const told = group.role === 'meddle' || group.role === 'seam' || group.role === 'stand';
    full = told ? long : t('bubble.named', { kind: SUN_KINDS[group.kind], names: long });
    body = <><span className="sun-bubble__icon" aria-hidden>{look.icon}</span><span className="sun-bubble__text">{groupText(group, t, false)}</span></>;
  }

  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={style}
      data-bubble={placed.id}
      aria-label={full}
      aria-pressed={selected}
      title={full}
      onClick={() => onPick(placed)}
    >
      {body}
    </button>
  );
}
