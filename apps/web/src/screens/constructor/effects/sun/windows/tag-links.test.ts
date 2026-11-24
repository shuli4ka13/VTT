import { describe, it, expect } from 'vitest';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { System } from '@vtt/schema';
import { tagLinks } from './tag-links.ts';

const dnd = SAMPLE_WORLDS[0]!.system as unknown as System;
const labels = (ids: string[]): string[] => ids.map(id => dnd.effects[id]!.label ?? id);

describe('связи метки', () => {
  it('«Атака»: носит заклинание-атака и оружие через включение, слышит «Щит», правят состояния', () => {
    const links = tagLinks(dnd, 'ataka');
    expect(labels(links.carriers)).toContain('Атака заклинанием');
    expect(links.carriers).toContain('strike');
    expect(labels(links.hearers.map(one => one.effect))).toContain('Щит');
    expect(links.hearers.find(one => one.effect === 'shield')!.phase).toBe('before');
    expect(links.editors.length).toBeGreaterThan(5);
    expect(links.editors.every(one => one.count > 0)).toBe(true);
  });

  it('метка без договора и носителей — пустые списки', () => {
    expect(tagLinks(dnd, 'net_takoy_metki')).toEqual({ carriers: [], hearers: [], editors: [] });
  });
});
