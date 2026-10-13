// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NumberBody } from './number-body.tsx';
import { within } from '../../../../testing/cards.ts';
import type { System, Effect, Step } from '@vtt/schema';

const system = {
  tables: {}, constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } },
  rolls: [], effects: {},
} as unknown as System;

const effect = {
  params: [
    { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
    { key: 'damage_with', label: 'Прибавка к урону', kind: 'number' },
  ],
} as unknown as Effect;

const context = { system, effect, earlier: [] };

const body = (step: unknown, onAddParam?: (label: string, kind: never, want?: string) => string) =>
  render(<NumberBody step={step as Step} context={context} edit={() => {}} {...(onAddParam ? { onAddParam } : {})} />);

describe('шаг «Число»: под полем нет второй копии формулы', () => {
  afterEach(cleanup);

  it('формула показана фишками один раз — серой строкой словами она не повторяется', () => {
    const view = body({ id: 'урон', type: 'roll', fixed: { expr: 'кинуть(@damage_dice, 2) + @damage_with' } });
    const chips = [...view.container.querySelectorAll('.chips__chip')].map(el => el.textContent);
    expect(chips).toEqual(expect.arrayContaining([expect.stringContaining('Кость урона'), expect.stringContaining('Прибавка к урону')]));
    expect(view.container.querySelector('.faint')).toBeNull();
    expect(view.container.textContent!.split('Прибавка к урону')).toHaveLength(2);
  });

  it('неизвестное имя по-прежнему предлагает «взять из записи»', () => {
    const taken: string[] = [];
    body({ id: 'урон', type: 'roll', fixed: { expr: '@нет_такого + 1' } }, (_label, _kind, want) => { taken.push(want ?? ''); return want ?? ''; });
    fireEvent.click(screen.getByText('взять «нет_такого» из записи'));
    expect(taken).toEqual(['нет_такого']);
  });

  it('ошибка разбора бросающего шага остаётся под полем', () => {
    const view = body({ id: 'бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } });
    expect(view.container.querySelector('.field__error')).toBeNull();
    within(view.container).formula('Формула', 'кинуть(@нет)');
    expect(view.container.querySelector('.field__error')).not.toBeNull();
  });

  it('имя правится в поле: ссылки переименовываются, пустое и занятое не принимаются с причиной', () => {
    const renames: Array<[string, string]> = [];
    const view = render(<NumberBody step={{ id: 'урон', type: 'roll', fixed: { expr: '1' } } as unknown as Step} context={{ ...context, earlier: [{ id: 'удар', type: 'roll' }] }}
      edit={() => {}} onRename={(from, to) => renames.push([from, to])} />);
    const name = view.container.querySelector('input.input') as HTMLInputElement;
    expect(name.value).toBe('урон');
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.blur(name);
    expect(view.container.querySelector('.field__error')!.textContent).toContain('пустым');
    fireEvent.change(name, { target: { value: 'удар' } });
    fireEvent.blur(name);
    expect(view.container.querySelector('.field__error')!.textContent).toContain('занято');
    expect(renames).toEqual([]);
    fireEvent.change(name, { target: { value: 'ущерб' } });
    fireEvent.blur(name);
    expect(renames).toEqual([['урон', 'ущерб']]);
  });

  it('«кости бросает» видно только у формулы с кинуть(', () => {
    const plain = body({ id: 'а', type: 'roll', fixed: { expr: '1 + 2' } });
    expect(plain.container.textContent).not.toContain('кости бросает');
    cleanup();
    const dice = body({ id: 'а', type: 'roll', fixed: { expr: 'кинуть(2к6)' } });
    expect(dice.container.textContent).toContain('кости бросает');
    expect(dice.container.innerHTML).toContain('никто — просто кости, без правок броска');
  });
});
