// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { useWorld } from '../../../store/world.ts';
import { RulesTab } from './rules-tab.tsx';
import { explainName } from '../lookup.ts';
import type { System } from '@vtt/schema';

const dnd = structuredClone(SAMPLE_SYSTEMS.find(s => s.id === 'dnd5e')) as unknown as System;

describe('формула колонки у строки — словами этой строки', () => {
  afterEach(() => { cleanup(); });

  it('клетка «Навык» у Атлетики показывает свою формулу, а не «= как у колонки»', () => {
    Element.prototype.scrollIntoView = () => {};
    useWorld.setState(state => ({ ...state, system: dnd, activeTableId: 'skills' }));
    render(<RulesTab />);
    const hints = [...document.querySelectorAll('details[open] input')].map(i => (i as HTMLInputElement).placeholder);
    expect(hints).toContain('= Сила · Модификатор + Владение × Бонус мастерства');
    expect(hints).toContain('= Ловкость · Модификатор + Владение × Бонус мастерства');
    expect(hints).not.toContain('= как у колонки');
  });

  it('справка по «строка.ability.mod» объясняет путь, а не «не найдено»', () => {
    const told = explainName(dnd, undefined, null, 'строка.ability.mod', new Map() as never, 'skills');
    expect(told.kind).toBe('клетка этой строки');
    expect(told.title).toBe('Характеристика · Модификатор');
    expect(told.facts.find(([term]) => term === 'пример')?.[1]).toBe('у «Атлетика»: Сила · Модификатор');
  });
});
