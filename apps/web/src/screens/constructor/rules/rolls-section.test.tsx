// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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
