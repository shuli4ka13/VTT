// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { CallEditor } from './call-editor.tsx';
import type { System, Effect } from '@vtt/schema';

const system = {
  tables: {
    навыки: { label: 'Навыки', key: 'word', columns: [], rows: [{ value: 'бег', label: 'Бег' }, { value: 'рефлексы', label: 'Рефлексы' }] },
    черты: { label: 'Черты', key: 'word', columns: [], rows: [{ value: 'сила', label: 'Сила' }] },
  },
  constants: {},
  effects: {
    встречная: { label: 'Встречная', params: [{ key: 'навык', label: 'Навык противника', kind: 'choice', from: 'навыки' }], steps: [] },
  },
} as unknown as System;

const caller = {
  label: 'Атака',
  params: [
    { key: 'защита', label: 'Чем защищается цель', kind: 'choice', from: 'навыки' },
    { key: 'черта', label: 'Черта', kind: 'choice', from: 'черты' },
  ],
  steps: [],
} as unknown as Effect;

const shown = (value?: string) => {
  const args: Record<string, unknown> = value ? { навык: { expr: value } } : {};
  const view = render(<CallEditor system={system} effect="встречная" args={args} where="вызов"
    onArg={(key, next) => { if (next) args[key] = next; else delete args[key]; }}
    context={{ system, effect: caller, earlier: [] }} />);
  const select = view.container.querySelector<HTMLSelectElement>('select[aria-label], select')!;
  const groups = [...select.children].map(node => (node instanceof HTMLOptGroupElement
    ? `${node.label}: ${[...node.children].map(option => option.textContent).join(', ')}` : node.textContent));
  return { view, select, groups, args };
};

describe('вызов: вход-строка заполняется по своей таблице', () => {
  afterEach(cleanup);

  it('в списке — строки таблицы, входы этого эффекта из той же таблицы и формула; вход из чужой таблицы не предлагается', () => {
    expect(shown().groups).toEqual([
      '— выберите —',
      'Строка «Навыки»: Бег, Рефлексы',
      'Из этого эффекта: вход «Чем защищается цель»',
      'Другое: формулой…',
    ]);
  });

  it('выбранный вход пишется ссылкой и показывается пунктом, а не формулой', () => {
    const { select, args } = shown();
    fireEvent.change(select, { target: { value: '@защита' } });
    expect(args.навык).toEqual({ expr: '@защита' });
    cleanup();
    const again = shown('@защита');
    expect(again.select.value).toBe('@защита');
    expect(again.view.container.textContent).not.toContain('строка таблицы «Черты»');
  });

  it('вход из другой таблицы, уже стоящий в данных, — красная строка с причиной', () => {
    const { view, select } = shown('@черта');
    expect(select.value).toBe('@черта');
    expect(view.container.querySelector('.field__error')!.textContent)
      .toBe('вход «Черта» — строка таблицы «Черты», а сюда нужна строка «Навыки»');
  });
});
