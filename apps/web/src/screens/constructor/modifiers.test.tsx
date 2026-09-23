// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModifiersEditor } from './modifiers.tsx';
import type { System, Modifier } from '@vtt/schema';

const system = {
  fields: [{ tag: 'ac', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } }],
  tables: { rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'спасбросок' }] } },
  roll_edits: { фора: { label: 'Фора', ops: [{ op: 'addDie' }] } },
  effects: {},
} as unknown as System;

const rollMod = [{ kind: 'roll', target: 'roll:any', tags: ['атака'], edit: 'фора', condition: null }] as Modifier[];

const optionsOf = (select: HTMLSelectElement) => [...select.options].map(o => o.textContent);

describe('редактор модификаторов', () => {
  it('чей бросок — мой или по мне, а какой именно — метки из строк таблиц', () => {
    render(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
    const target = screen.getByDisplayValue('Мой бросок') as HTMLSelectElement;
    expect(optionsOf(target)).toEqual(['— выберите бросок —', 'Мой бросок', 'Бросок по мне']);
    expect(screen.getByText('атака')).toBeTruthy();
    const more = screen.getByDisplayValue('+ ещё…') as HTMLSelectElement;
    expect(optionsOf(more)).toContain('спасбросок');
    expect(more.querySelector('optgroup')?.getAttribute('label')).toBe('Броски');
  });

  it('правки предлагаются из словаря автора, а не из зашитого списка', () => {
    render(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
    const edit = screen.getByDisplayValue('Фора') as HTMLSelectElement;
    expect(optionsOf(edit)).toEqual(['— выберите правку —', 'Фора']);
    expect(optionsOf(edit)).not.toContain('Преимущество');
  });

  it('без единой правки в словаре кнопку блокирует и объясняет почему', () => {
    const bare = { ...system, roll_edits: {} } as unknown as System;
    render(<ModifiersEditor system={bare} modifiers={[]} onEdit={vi.fn()} />);
    const button = screen.getByText('+ правит бросок').closest('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/словаре/);
  });
});

describe('заглушка говорит словами владельца', () => {
  it('род — про род, а не про эффект', () => {
    render(<ModifiersEditor
      system={system} modifiers={[]} onEdit={() => {}}
      empty={{ title: 'Род пока ничего не правит', hint: 'проверочная' }}
    />);
    expect(screen.getByText('Род пока ничего не правит')).toBeTruthy();
    expect(screen.queryByText('Эффект пока ничего не делает')).toBeNull();
  });

  it('без своих слов — прежние, эффектные', () => {
    render(<ModifiersEditor system={system} modifiers={[]} onEdit={() => {}} />);
    expect(screen.getByText('Эффект пока ничего не делает')).toBeTruthy();
  });
});

describe('один редактор — шесть механизмов', () => {
  it('с правом писать в систему список правок предлагает готовые механизмы, выбор заводит их в словарь', () => {
    const draft = structuredClone({ ...system, roll_edits: {} }) as unknown as System;
    const editSystem = vi.fn((change: (d: System) => void) => change(draft));
    const mods = [{ kind: 'roll', target: 'attack_roll', edit: '', condition: null }] as Modifier[];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    render(<ModifiersEditor system={draft} modifiers={mods} onEdit={onEdit} editSystem={editSystem} />);

    const edit = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value.startsWith('recipe:'))) as HTMLSelectElement;
    expect(optionsOf(edit)).toContain('+ Преимущество · Переброс кости и выбор лучшего/худшего броска');
    fireEvent.change(edit, { target: { value: 'recipe:rerollBest:advantage' } });

    expect(draft.roll_edits?.advantage?.canceledBy).toBe('disadvantage');
    expect(draft.roll_edits?.disadvantage).toBeTruthy();
    expect(mods[0]!.edit).toBe('advantage');
  });

  it('без права писать в систему готовых механизмов в списке нет', () => {
    render(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
    const edit = screen.getByDisplayValue('Фора') as HTMLSelectElement;
    expect([...edit.options].some(o => o.value.startsWith('recipe:'))).toBe(false);
  });

  it('у значения есть пол и потолок', () => {
    const valueMod = [{ kind: 'value', target: 'ac', op: 'add', value: 1, stacking: 'sum', condition: null }] as Modifier[];
    render(<ModifiersEditor system={system} modifiers={valueMod} onEdit={vi.fn()} />);
    const how = screen.getByDisplayValue('прибавить') as HTMLSelectElement;
    expect(optionsOf(how)).toEqual(['прибавить', 'умножить', 'задать', 'не меньше', 'не больше']);
  });
});
