// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { within } from '../../../../testing/cards.ts';
import { NumberBody } from './number-body.tsx';
import type { System, Effect, Step } from '@vtt/schema';

const system = {
  tables: {}, constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ sides: 20 }] } }, effects: {},
} as unknown as System;

const effect = {
  params: [
    { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
    { key: 'damage_with', label: 'Прибавка к урону', kind: 'number' },
  ],
} as unknown as Effect;

const sheets = new Map([['действующий', 'Кто действует'], ['цель', 'цель']]);

const context = { system, effect, earlier: [], sheets };

const body = (step: unknown, onAddParam?: (label: string, kind: never, want?: string) => string) =>
  render(<NumberBody step={step as Step} context={context} edit={() => {}} {...(onAddParam ? { onAddParam } : {})} />);

const edited = (step: Record<string, unknown>) => {
  const draft = structuredClone(step);
  const view = render(<NumberBody step={step as unknown as Step} context={context} edit={(_, change) => change(draft as never)} />);
  return { draft, view };
};

describe('шаг «Число»', () => {
  afterEach(cleanup);

  it('формула показана фишками один раз — серой строкой словами она не повторяется', () => {
    const view = body({ id: 'урон', type: 'roll', fixed: { expr: '@damage_dice * @damage_with' } });
    const chips = [...view.container.querySelectorAll('.chips__chip')].map(el => el.textContent);
    expect(chips).toEqual(expect.arrayContaining([expect.stringContaining('Кость урона'), expect.stringContaining('Прибавка к урону')]));
    expect(view.container.textContent!.split('Прибавка к урону')).toHaveLength(2);
  });

  it('неизвестное имя по-прежнему предлагает «взять из записи»', () => {
    const taken: string[] = [];
    body({ id: 'урон', type: 'roll', fixed: { expr: '@нет_такого + 1' } }, (_label, _kind, want) => { taken.push(want ?? ''); return want ?? ''; });
    fireEvent.click(screen.getByText('взять «нет_такого» из записи'));
    expect(taken).toEqual(['нет_такого']);
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

  it('у числа нет ни выбора бросающего, ни меток', () => {
    const view = body({ id: 'а', type: 'roll', fixed: { expr: '@damage_with + 2' } });
    expect(view.container.querySelector('[role="combobox"]')).toBeNull();
    expect(view.container.textContent).not.toContain('Метки');
  });

  it('холостое открытие числа данных не меняет, правка формулы пишет fixed', () => {
    const step = { id: 'урон', type: 'roll', fixed: { expr: '@damage_with' } };
    const { draft, view } = edited(step);
    expect(draft).toEqual(step);
    within(view.container).formula('Формула', '2 + @damage_with');
    expect(draft).toEqual({ id: 'урон', type: 'roll', fixed: { expr: '2 + @damage_with' } });
  });
});
