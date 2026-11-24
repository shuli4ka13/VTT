import type { Sun, SunBubble, SunKind, SunRay, SunRole } from '@vtt/engine';

export interface SunGroup { key: string; kind: SunKind; role: SunRole; items: SunBubble[]; label: string; more: number }

export interface Placed {
  id: string;
  what: 'center' | 'ray' | 'group';
  x: number;
  y: number;
  r: number;
  ray?: SunRay;
  group?: SunGroup;
}

export interface SunLayout { placed: Placed[]; left: number; top: number; right: number; bottom: number }

export const CENTER_R = 70;
export const RAY_R = 39;
export const GAP = 6;
const SHOWN = 2;
const MIN_R = 30;
const MAX_R = 56;

const ORDER: readonly (readonly [SunRole, SunKind | null])[] = [
  ['reads', 'input'], ['reads', 'aside'], ['reads', 'field'], ['reads', 'state'], ['reads', 'result'], ['reads', 'value'],
  ['calls', null], ['meddle', null], ['gives', null], ['sets', 'tag'], ['sets', 'field'], ['sets', 'state'], ['sets', 'ask'], ['sets', 'stop'],
  ['stand', null],
];

const SPLIT: ReadonlySet<SunRole> = new Set<SunRole>(['calls', 'meddle', 'gives']);

const groupOf = (key: string, items: SunBubble[]): SunGroup => {
  const names = [...new Set(items.map(item => item.label))];
  return { key, kind: items[0]!.kind, role: items[0]!.role, items, label: names.slice(0, SHOWN).join(', '), more: Math.max(0, names.length - SHOWN) };
};

export function groupsOf(ray: SunRay): SunGroup[] {
  const out: SunGroup[] = [];
  const seams = (side: 'before' | 'after'): SunBubble[] => ray.bubbles.filter(one => one.role === 'seam' && (one.seam?.side ?? 'after') === side);
  const before = seams('before');
  if (before.length) out.push(groupOf('seam:before', before));
  const taken = new Set<SunBubble>();
  for (const [role, kind] of ORDER) {
    const items = ray.bubbles.filter(one => one.role === role && (kind === null || one.kind === kind) && !taken.has(one));
    if (!items.length) continue;
    items.forEach(item => taken.add(item));
    if (SPLIT.has(role)) items.slice(0, 3).forEach((item, at) => out.push(groupOf(`${role}:${at}`, at === 2 ? items.slice(2) : [item])));
    else out.push(groupOf(`${role}:${kind ?? 'all'}`, items));
  }
  const rest = ray.bubbles.filter(one => one.role !== 'seam' && !taken.has(one));
  if (rest.length) out.push(groupOf('rest', rest));
  const after = seams('after');
  if (after.length) out.push(groupOf('seam:after', after));
  return out;
}

export const radiusOf = (group: SunGroup): number =>
  Math.round(Math.min(MAX_R, Math.max(MIN_R, MIN_R + (group.label.length + (group.more ? 3 : 0) - 6) * 0.95)));

export function ringOf(count: number): number {
  const tucked = CENTER_R + RAY_R - 8;
  if (count < 3) return tucked;
  return Math.max(tucked, (RAY_R + GAP / 2) / Math.sin(Math.PI / count));
}

export function layoutOf(sun: Sun): SunLayout {
  const count = sun.rays.length;
  const ring = ringOf(count);
  const wedge = count >= 3 ? Math.sin(Math.PI / count) : 1;
  const placed: Placed[] = [{ id: 'center', what: 'center', x: 0, y: 0, r: CENTER_R }];
  sun.rays.forEach((ray, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(1, count);
    const at = (distance: number): { x: number; y: number } => ({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance });
    placed.push({ id: ray.key, what: 'ray', ...at(ring), r: RAY_R, ray });
    let edge = ring + RAY_R;
    for (const group of groupsOf(ray)) {
      const r = radiusOf(group);
      const distance = Math.max(edge + GAP + r, (r + GAP / 2) / wedge);
      placed.push({ id: `${ray.key}|${group.key}`, what: 'group', ...at(distance), r, ray, group });
      edge = distance + r;
    }
  });
  return {
    placed,
    left: Math.min(...placed.map(one => one.x - one.r)),
    top: Math.min(...placed.map(one => one.y - one.r)),
    right: Math.max(...placed.map(one => one.x + one.r)),
    bottom: Math.max(...placed.map(one => one.y + one.r)),
  };
}

export function overlaps(layout: SunLayout): [string, string][] {
  const out: [string, string][] = [];
  const outer = layout.placed.filter(one => one.what !== 'center');
  outer.forEach((a, i) => outer.slice(i + 1).forEach(b => {
    if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 0.5) out.push([a.id, b.id]);
  }));
  return out;
}
