import { describe, it, expect } from 'vitest';
import type { SunRay } from '@vtt/engine';
import type { Placed } from '../layout.ts';
import { dropTarget, toLayer } from './drag.ts';

const ray = (key: string, span: SunRay['span']): SunRay => ({ key, span } as unknown as SunRay);

const placed: Placed[] = [
  { id: 'center', what: 'center', x: 0, y: 0, r: 70 },
  { id: 'steps:0', what: 'ray', x: 0, y: -120, r: 39, ray: ray('steps:0', { part: 'steps', from: 0, to: 0 }) },
  { id: 'after', what: 'ray', x: 200, y: 0, r: 39, ray: ray('after', null) },
  { id: 'cost', what: 'ray', x: -200, y: 0, r: 39, ray: ray('cost', { part: 'cost', from: 0, to: 0 }) },
  { id: 'steps:0|rest', what: 'group', x: 0, y: -200, r: 30 },
];

describe('перетаскивание: математика', () => {
  it('toLayer учитывает сдвиг и масштаб', () => {
    const rect = { left: 100, top: 50 };
    expect(toLayer({ x: 100, y: 50 }, rect, { x: 0, y: 0, k: 1 })).toEqual({ x: 0, y: 0 });
    expect(toLayer({ x: 160, y: 90 }, rect, { x: 10, y: -10, k: 1 })).toEqual({ x: 50, y: 50 });
    expect(toLayer({ x: 160, y: 90 }, rect, { x: 10, y: -10, k: 2 })).toEqual({ x: 25, y: 25 });
    expect(toLayer({ x: 100, y: 50 }, rect, { x: 40, y: 20, k: 0.5 })).toEqual({ x: -80, y: -40 });
  });

  it('над лучом и рядом в пределах досягаемости цель — луч, мимо — нет', () => {
    expect(dropTarget(placed, { x: 0, y: -120 }, 20)?.id).toBe('steps:0');
    expect(dropTarget(placed, { x: 50, y: -120 }, 20)?.id).toBe('steps:0');
    expect(dropTarget(placed, { x: 0, y: -162 }, 20)?.id).toBe('steps:0');
    expect(dropTarget(placed, { x: 120, y: -120 }, 20)).toBeNull();
  });

  it('спутник, центр, луч «после» и плата не цели', () => {
    expect(dropTarget(placed, { x: 0, y: -200 }, 20)).toBeNull();
    expect(dropTarget(placed, { x: 0, y: 0 }, 20)).toBeNull();
    expect(dropTarget(placed, { x: 200, y: 0 }, 20)).toBeNull();
    expect(dropTarget(placed, { x: -200, y: 0 }, 20)).toBeNull();
  });
});
