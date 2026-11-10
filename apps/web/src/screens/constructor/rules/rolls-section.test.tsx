// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { RollsSection } from './rolls-section.tsx';
import { within } from '../../../testing/cards.ts';
import type { System } from '@vtt/schema';

const make = (roll: Record<string, unknown>) => ({
  tables: {}, effects: {},
  constants: { d: { label: 'Кость', kind: 'die', dice: [{ sides: 20 }] } },
  rolls: { r: { die: 'd', fields: [], ...roll } },
}) as unknown as System;

const run = (roll: Record<string, unknown>) => {
  const system = make(roll);
  const view = render(<RollsSection system={system} editSystem={change => change(system as never)} />);
  return { system, view };
};

const row = (root: HTMLElement, label: string): HTMLElement =>
  [...root.querySelectorAll<HTMLElement>('.dict-row')].find(r => r.querySelector('.dict-row__label')?.textContent === label)!;

describe('«Правила → Броски»: успех и степени числом', () => {
  afterEach(cleanup);

  it('у броска «не больше» правила пишутся и снимаются пустыми', () => {
    const { system, view } = run({ number: 'under' });
    within(view.container).formula(row(view.container, 'Успех, если'), '@выпало <= @порог');
    within(view.container).formula(row(view.container, 'Степени числом'), '@порог - @выпало');
    expect(system.rolls!.r).toMatchObject({ success: { expr: '@выпало <= @порог' }, margin: { expr: '@порог - @выпало' } });
    cleanup();
    const again = run({ number: 'under', success: { expr: '@порог' } });
    within(again.view.container).formula(row(again.view.container, 'Успех, если'), '');
    expect(again.system.rolls!.r).not.toHaveProperty('success');
  });

  it('у обычного броска строк нет', () => {
    const { view } = run({});
    expect(view.container.textContent).not.toContain('Успех, если');
  });
});

describe('«Правила → Броски»: какое поле бросают', () => {
  afterEach(cleanup);
  const sheet = () => ({
    effects: {},
    constants: { d: { label: 'Кость', kind: 'die', dice: [{ sides: 20 }] } },
    tables: {
      лист: { shape: 'single', owner: 'sheet', columns: [
        { key: 'сила', label: 'Сила', kind: 'number' },
        { key: 'память', label: 'Память', kind: 'number' },
        { key: 'запрет', label: 'Нельзя действовать', kind: 'number' },
      ] },
      навыки: { label: 'Навыки', owner: 'sheet', columns: [{ key: 'набор', label: 'Набор', kind: 'number' }], rows: [{ value: 'бег', label: 'Бег' }] },
    },
    blocks: [
      { name: 'Характеристики', parts: [{ table: 'лист', columns: ['сила'] }] },
      { name: 'Наборы кубиков', parts: [{ table: 'лист', columns: ['память'] }, { table: 'навыки' }] },
    ],
    rolls: { r: { die: 'd', fields: [] } },
  }) as unknown as System;
  const pick = (root: HTMLElement) => root.querySelector<HTMLSelectElement>('select[aria-label="добавить поле"]')!;
  const listed = (root: HTMLElement) => [...pick(root).children].map(node => (node instanceof HTMLOptGroupElement
    ? `${node.label}: ${[...node.children].map(option => option.textContent).join(', ')}` : node.textContent));

  it('поля идут по блокам листа в порядке листа; служебные — за отдельным пунктом', () => {
    const system = sheet();
    const view = render(<RollsSection system={system} editSystem={change => change(system as never)} />);
    expect(listed(view.container)).toEqual([
      '+ поле…',
      'Характеристики: Сила',
      'Наборы кубиков: Память, Навыки → Набор',
      'служебные поля, которых нет на листе (1)…',
    ]);
    fireEvent.change(pick(view.container), { target: { value: '\u0001' } });
    expect(listed(view.container).at(-1)).toBe('Без блока: Нельзя действовать');
    expect(system.rolls!.r!.fields).toEqual([]);
  });

  it('выбранное поле встаёт в бросок', () => {
    const system = sheet();
    const view = render(<RollsSection system={system} editSystem={change => change(system as never)} />);
    fireEvent.change(pick(view.container), { target: { value: 'навыки\u0000набор' } });
    expect(system.rolls!.r!.fields).toEqual([{ table: 'навыки', column: 'набор' }]);
  });
});
