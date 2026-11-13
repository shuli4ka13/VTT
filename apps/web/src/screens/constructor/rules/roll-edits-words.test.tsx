// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { comboOptions } from '../../../testing/cards.ts';
import { renderOpen } from '../../../testing/render-open.tsx';
import { RollEditsSection } from './roll-edits-section.tsx';
import { ModifiersEditor } from '../modifiers.tsx';
import type { System, Modifier } from '@vtt/schema';

const system = {
  tables: {}, effects: {},
  roll_edits: { фора: { label: 'Фора', ops: [{ op: 'addDie' }] } },
} as unknown as System;

const fieldOf = (container: ParentNode, label: string): HTMLElement =>
  [...container.querySelectorAll<HTMLElement>('.field__label')].find(el => el.textContent === label)!.closest('label')!;

describe('правка броска говорит, что складывается, а что нет', () => {
  afterEach(cleanup);

  it('«Что правим» — числа в одной группе, слово из «Правил» — в другой, метка — в «ещё»', () => {
    const mods = [{ kind: 'edit', call: 'roll', param: 'count', op: 'add', value: { expr: '-2' } }] as Modifier[];
    const view = renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={vi.fn()} />);
    const combo = fieldOf(view.container, 'Что правим').querySelector<HTMLElement>('[role="combobox"]')!;
    const groups = comboOptions(combo).map(one => `${one.group}: ${one.label}`);
    expect(groups).toEqual([
      'число — складывается: кубики',
      'число — складывается: прибавка',
      'число — складывается: порог',
      'слово из «Правил» — одно на бросок: слово из «Правил»',
      'ещё: метка броску',
    ]);
    expect(fieldOf(view.container, 'Что правим').textContent).toContain('Складывается: каждый висящий эффект и каждая его копия');
  });

  it('у слова подсказка — «один раз», поле зовётся «Какое слово»', () => {
    const mods = [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'фора' }] as Modifier[];
    const view = renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={vi.fn()} />);
    expect(fieldOf(view.container, 'Что правим').textContent).toContain('действует на бросок один раз');
    expect(fieldOf(view.container, 'Какое слово')).toBeTruthy();
  });

  it('в словаре выбор говорит «одно на бросок» и «по разу от каждого разного эффекта», подсказка — про копии', () => {
    const view = render(<RollEditsSection system={system} editSystem={vi.fn()} usage={new Map()} />);
    const combo = [...view.container.querySelectorAll<HTMLElement>('[role="combobox"]')]
      .find(one => comboOptions(one).some(item => item.label === 'по разу от каждого разного эффекта'))!;
    expect(comboOptions(combo).map(one => one.label)).toEqual(['одно на бросок, сколько бы эффектов ни дали', 'по разу от каждого разного эффекта']);
    expect(combo.closest('[title]')?.getAttribute('title') ?? combo.getAttribute('title')).toContain('Копии одного и того же эффекта');
  });
});
