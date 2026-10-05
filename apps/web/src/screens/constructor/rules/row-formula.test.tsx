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

  it('клетка «Навык» у Атлетики показывает формулу строки чипами', () => {
    Element.prototype.scrollIntoView = () => {};
    useWorld.setState(state => ({ ...state, system: dnd, activeTableId: 'skills' }));
    render(<RulesTab />);
    const shown = [...document.querySelectorAll('details[open] .row-formula')].map(node => node.textContent);
    expect(shown).toContain('Сила · Модификатор + Атлетика · Владение × Бонус мастерства');
    expect(shown).toContain('Ловкость · Модификатор + Скрытность · Владение × Бонус мастерства');
    const chips = [...document.querySelectorAll('details[open] .row-formula')][0]!.querySelectorAll('.chips__chip');
    expect([...chips].map(chip => chip.textContent)).toEqual(['Сила · Модификатор', 'Атлетика · Владение', 'Бонус мастерства']);
  });

  it('справка по «строка.ability.mod» объясняет путь, а не «не найдено»', () => {
    const told = explainName(dnd, undefined, null, 'строка.ability.mod', new Map() as never, 'skills');
    expect(told.kind).toBe('клетка этой строки');
    expect(told.title).toBe('Характеристика · Модификатор');
    expect(told.facts.find(([term]) => term === 'пример')?.[1]).toBe('у «Атлетика»: Сила · Модификатор');
  });
});
