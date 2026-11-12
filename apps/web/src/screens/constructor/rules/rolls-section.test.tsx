// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { RollsSection } from './rolls-section.tsx';
import { within } from '../../../testing/cards.ts';
import type { System } from '@vtt/schema';

const make = (roll: Record<string, unknown>) => ({
  tables: { outcome: { label: 'Исходы', shape: 'rows', columns: [{ key: 'name', label: 'Название' }], rows: [] } }, effects: {},
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

  it('у обычного броска строки видны и подсказывают, кто считает успех', () => {
    const { view } = run({});
    for (const label of ['Успех, если', 'Степени числом', 'Ступени']) expect(row(view.container, label)).toBeTruthy();
    expect(view.container.textContent).not.toContain('успеха и степеней правило не считает');
    expect(view.container.innerHTML).toContain('пусто — успех считает «Проверка» в эффекте');
    expect(view.container.textContent).toContain('бросок');
  });

  it('ступени пишутся списком и снимаются вместе с ключом', () => {
    const { system, view } = run({});
    fireEvent.click([...row(view.container, 'Ступени').querySelectorAll('button')].find(b => b.textContent === '+ ступень')!);
    expect(system.rolls!.r!.degrees).toHaveLength(1);
    cleanup();
    const again = run({ degrees: [{ label: 'Успех', if: { expr: 'да' } }] });
    fireEvent.click(again.view.container.querySelector('[aria-label="убрать ступень"]')!);
    expect(again.system.rolls!.r).not.toHaveProperty('degrees');
  });
});

describe('«Правила → Броски»: ступени таблицей', () => {
  afterEach(cleanup);

  it('таблица выбирается, «по степеням» пишет of, «списком» снимает ключ', () => {
    const system = make({});
    const view = render(<RollsSection system={system} editSystem={change => again(change)} />);
    const again: Parameters<typeof RollsSection>[0]['editSystem'] = change => { change(system as never); view.rerender(<RollsSection system={system} editSystem={again} />); };
    const box = () => row(view.container, 'Ступени');
    within(view.container).select(box(), 'outcome');
    expect(system.rolls!.r!.degrees).toEqual({ table: 'outcome' });
    within(view.container).select(box().querySelectorAll('select')[1] as HTMLElement, 'margin');
    expect(system.rolls!.r!.degrees).toEqual({ table: 'outcome', of: 'margin' });
    within(view.container).select(box().querySelectorAll('select')[1] as HTMLElement, 'total');
    expect(system.rolls!.r!.degrees).toEqual({ table: 'outcome' });
    within(view.container).select(box(), '');
    expect(system.rolls!.r).not.toHaveProperty('degrees');
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

describe('«Правила → Броски»: ступени и встроенные имена', () => {
  afterEach(cleanup);

  it('последняя ступень «да» показана словом «иначе», новая ступень встаёт перед ней', () => {
    const { system, view } = run({ number: 'under', degrees: [{ label: 'Успех', if: { expr: '@успех' } }, { label: 'Провал', if: { expr: 'да' } }] });
    expect(row(view.container, 'Ступени').textContent).toContain('иначе');
    expect(view.container.textContent).toContain('Берётся первая подходящая сверху.');
    fireEvent.click([...view.container.querySelectorAll('button')].find(b => b.textContent === '+ ступень')!);
    expect(system.rolls!.r!.degrees!.map(one => one.label)).toEqual(['Успех', 'Новая ступень', 'Провал']);
  });

  it('«Что приходит» называет имена броска со смыслом', () => {
    const { view } = run({ number: 'under' });
    const names = [...row(view.container, 'Что приходит').querySelectorAll<HTMLElement>('.roll-arrived__name')];
    expect(names.map(one => one.textContent)).toEqual(['бросок', 'выпало', 'число поля', 'порог', 'успех', 'степени']);
    expect(names[0]!.title).toContain('как у шага «Бросок»');
    expect(names[5]!.title).toContain('«Степени числом»');
  });
});
