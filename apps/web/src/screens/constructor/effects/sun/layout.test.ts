import { describe, expect, it } from 'vitest';
import { sunOf, type Sun, type SunRay, type System } from '@vtt/engine';
import { SAMPLE_SYSTEMS } from '@vtt/engine/samples';
import { CENTER_R, RAY_R, groupsOf, layoutOf, overlaps, ringOf } from './layout.ts';

const ray = (key: string, bubbles = 0): SunRay => ({
  key, number: 0, stage: 'deliver', kind: 'step', label: key, span: null, repeat: false, under: null, group: null,
  bubbles: Array.from({ length: bubbles }, (_, at) => ({ kind: 'call' as const, role: 'calls' as const, label: `вызов номер ${at} с длинной подписью`, name: `c${at}` })),
});

const made = (count: number, bubbles = 3): Sun => ({
  effect: 'x', label: 'x', launch: 'manual', inputs: 0, seams: [], stands: [],
  rays: Array.from({ length: count }, (_, at) => ({ ...ray(`r${at}`, bubbles), number: at + 1 })),
});

describe('раскладка пузырей', () => {
  it('ни у одного эффекта образцов пузыри не налезают друг на друга', () => {
    for (const system of SAMPLE_SYSTEMS as System[]) {
      for (const id of Object.keys(system.effects)) {
        expect([id, overlaps(layoutOf(sunOf(system, id)!))]).toEqual([id, []]);
      }
    }
  });

  it('один луч, два луча и двенадцать лучей раскладываются без наложений и без деления на ноль', () => {
    for (const count of [0, 1, 2, 3, 12, 24]) {
      const layout = layoutOf(made(count));
      expect(layout.placed.every(one => Number.isFinite(one.x) && Number.isFinite(one.y))).toBe(true);
      expect(overlaps(layout)).toEqual([]);
    }
  });

  it('первый луч стоит на двенадцати часах, дальше — по часовой стрелке', () => {
    const [first, second] = layoutOf(made(4, 0)).placed.filter(one => one.what === 'ray');
    expect(Math.round(first!.x)).toBe(0);
    expect(first!.y).toBeLessThan(0);
    expect(second!.x).toBeGreaterThan(0);
    expect(Math.round(second!.y)).toBe(0);
  });

  it('длинный эффект растит кольцо, а не мельчит пузыри', () => {
    expect(ringOf(6)).toBe(CENTER_R + RAY_R - 8);
    expect(ringOf(12)).toBeGreaterThan(ringOf(8));
    expect(layoutOf(made(12, 0)).placed.filter(one => one.what === 'ray').every(one => one.r === RAY_R)).toBe(true);
  });

  it('спутники одного вида складываются в один пузырь, привязка «до» идёт первой, «после» — последней', () => {
    const dnd = SAMPLE_SYSTEMS[0] as System;
    const strike = sunOf(dnd, 'strike')!;
    const roll = strike.rays.find(one => one.bubbles.some(bubble => bubble.role === 'meddle'))!;
    const groups = groupsOf(roll);
    expect(groups.filter(group => group.kind === 'input')).toHaveLength(1);
    expect(groups.at(-1)!.role).toBe('seam');
    expect(groups.map(group => group.role)).toEqual(expect.arrayContaining(['reads', 'calls', 'meddle', 'gives', 'seam']));
    expect(groups.flatMap(group => group.items)).toHaveLength(roll.bubbles.length);
  });
});
