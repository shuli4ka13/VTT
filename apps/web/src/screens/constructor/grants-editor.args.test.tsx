// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ItemGrant, System } from '@vtt/schema';
import { GrantsEditor } from './grants-editor.tsx';
import { emptySystem } from '../../store/world.ts';

const build = (): System => {
  const system = emptySystem();
  system.tables = { gun: { shape: 'book', use: 'item', label: 'Пушка', columns: [{ key: 'note', label: 'Заметка', kind: 'text' }, { key: 'ammo', label: 'Патроны', kind: 'number' }] } } as never;
  system.effects = {
    mark: { label: 'Метка', activation: 'passive', params: [
      { key: 'who', label: 'Носитель', kind: 'sheet' },
      { key: 'note', label: 'Заметка', kind: 'text' },
      { key: 'ammo', label: 'Патроны', kind: 'field' },
    ], steps: [] },
  } as never;
  return system;
};

const rowOf = (name: string) => [...document.querySelectorAll('.args-row__name')].find(node => node.textContent === name);

let seen: ItemGrant[] | undefined;

function Host({ system, withArgs, start }: { system: System; withArgs: boolean; start: ItemGrant[] }) {
  const [value, setValue] = useState<ItemGrant[] | undefined>(start);
  seen = value;
  return withArgs
    ? <GrantsEditor system={system} value={value} withArgs kindId="gun" onChange={setValue} />
    : <GrantsEditor system={system} value={value as string[] | undefined} onChange={next => setValue(next)} />;
}

describe('GrantsEditor: входы выдачи', () => {
  afterEach(() => { cleanup(); });

  it('с withArgs у выбранного эффекта видны строки входов, выданное с аргументами лежит объектом', () => {
    render(<Host system={build()} withArgs start={[{ effect: 'mark', args: { note: { expr: '@note' } } }]} />);
    expect(rowOf('Заметка')).toBeTruthy();
    expect(rowOf('Патроны')).toBeTruthy();
    expect(seen).toEqual([{ effect: 'mark', args: { note: { expr: '@note' } } }]);
  });

  it('значение входа пишет объект, очистка возвращает строку', () => {
    render(<Host system={build()} withArgs start={['mark']} />);
    const input = rowOf('Заметка')!.parentElement!.querySelector<HTMLInputElement>('.chips__text')!;
    fireEvent.change(input, { target: { value: '@note' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(seen).toEqual([{ effect: 'mark', args: { note: { expr: '@note' } } }]);
    act(() => { fireEvent.mouseDown(rowOf('Заметка')!.parentElement!.querySelector('.chips__x')!); });
    const empty = rowOf('Заметка')!.parentElement!.querySelector('.chips__text')!;
    fireEvent.keyDown(empty, { key: 'Enter' });
    fireEvent.blur(empty);
    expect(seen).toEqual(['mark']);
  });

  it('без withArgs строк входов нет', () => {
    render(<Host system={build()} withArgs={false} start={['mark']} />);
    expect(rowOf('Заметка')).toBeUndefined();
    expect(rowOf('Патроны')).toBeUndefined();
  });
});
