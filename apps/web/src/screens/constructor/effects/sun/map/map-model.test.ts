import { describe, it, expect } from 'vitest';
import type { SunMap, MapEffect } from '@vtt/engine';
import { blockKey, groupsOf, keyOf, relatedTo, summaryOf } from './map-model.ts';

const effect = (id: string, layer: MapEffect['layer'], group?: string): MapEffect => ({
  id, label: id.toUpperCase(), launch: 'manual', layer, ...(group ? { group, groupLabel: `Блок ${group}` } : {}), calls: 0, calledBy: 0, hears: 0, edits: 0,
});

const map: SunMap = {
  effects: [effect('a', 'action', 'g1'), effect('b', 'action', 'g1'), effect('c', 'action'), effect('d', 'called', 'g2'), effect('h', 'hanging')],
  tags: [{ id: 't', label: 'Метка', contract: true, carries: 1, hears: 1, edits: 1 }],
  links: [
    { from: 'a', to: 'd', kind: 'calls', via: 'id' },
    { from: 'b', to: 'd', kind: 'applies', via: 'id' },
    { from: 'a', to: 't', kind: 'carries', via: 'tag' },
    { from: 'h', to: 't', kind: 'hears', via: 'tag', phase: 'after' },
    { from: 'h', to: 'a', kind: 'hears', via: 'id', phase: 'before' },
    { from: 'h', to: '*', kind: 'hears', via: 'any', phase: 'done' },
    { from: 'h', to: 't', kind: 'edits', via: 'tag' },
    { from: 'h', to: 't', kind: 'edits', via: 'tag' },
  ],
  leaks: [],
};

describe('карта связей: модель', () => {
  it('группы слоя идут по блокам в порядке появления, без блока — отдельная группа', () => {
    const groups = groupsOf(map, 'action');
    expect(groups.map(one => [one.key, one.label, one.effects.map(item => item.id)])).toEqual([
      ['g1', 'Блок g1', ['a', 'b']],
      ['', '', ['c']],
    ]);
    expect(groupsOf(map, 'hanging')).toHaveLength(1);
    expect(blockKey('action', undefined)).toBe('action|');
  });

  it('сводная строка: три подписи и остаток', () => {
    const many = ['x', 'y', 'z', 'w', 'v'].map(label => ({ label }));
    expect(summaryOf(many)).toEqual({ names: ['x', 'y', 'z'], rest: 2 });
    expect(summaryOf(many.slice(0, 2))).toEqual({ names: ['x', 'y'], rest: 0 });
  });

  it('эффект: кого зовёт, кто зовёт его, метки, что слышит с фазой, что правит', () => {
    const calls = relatedTo(map, { kind: 'effect', id: 'a' });
    expect(calls.calls.map(one => one.id)).toEqual(['d']);
    expect(calls.carries.map(one => one.label)).toEqual(['Метка']);
    expect(calls.involved).toEqual(new Set([keyOf('effect', 'a'), keyOf('effect', 'd'), keyOf('tag', 't')]));
    expect(relatedTo(map, { kind: 'effect', id: 'd' }).calledBy.map(one => one.id)).toEqual(['a', 'b']);
    const hanging = relatedTo(map, { kind: 'effect', id: 'h' });
    expect(hanging.hears.map(one => [one.target.kind, one.target.id, one.phase])).toEqual([['tag', 't', 'after'], ['effect', 'a', 'before'], ['any', '*', 'done']]);
    expect(hanging.edits).toHaveLength(1);
    expect(hanging.involved.has(keyOf('effect', 'a'))).toBe(true);
  });

  it('метка: кто носит, слышит, правит; носители можно подменить полным списком', () => {
    const tag = relatedTo(map, { kind: 'tag', id: 't' });
    expect(tag.carriers.map(one => one.id)).toEqual(['a']);
    expect(tag.hearers.map(one => [one.who.id, one.phase])).toEqual([['h', 'after']]);
    expect(tag.editors.map(one => one.id)).toEqual(['h']);
    const full = relatedTo(map, { kind: 'tag', id: 't' }, ['a', 'b']);
    expect(full.carriers.map(one => one.id)).toEqual(['a', 'b']);
    expect(full.involved.has(keyOf('effect', 'b'))).toBe(true);
  });
});
