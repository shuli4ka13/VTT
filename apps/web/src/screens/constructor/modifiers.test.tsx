// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModifiersEditor } from './modifiers.tsx';
import type { System, Modifier } from '@vtt/schema';

const system = {
  tables: { лист: { shape: 'single', columns: [{ key: 'ac', label: 'Класс брони', kind: 'number', default: 10 }] }, rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'спасбросок' }] } },
  roll_edits: { фора: { label: 'Фора', ops: [{ op: 'addDie' }] } },
  effects: {},
} as unknown as System;

const rollMod = [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['атака'], edit: 'фора' }] as Modifier[];

const optionsOf = (select: HTMLSelectElement) => [...select.options].map(o => o.textContent);

describe('редактор модификаторов', () => {
  it('чей бросок — мой или по мне, а какой именно — метки из строк таблиц', () => {
    render(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
    expect((screen.getByDisplayValue('Бросок') as HTMLSelectElement).value).toBe('roll');
    const whose = screen.getByDisplayValue('мой') as HTMLSelectElement;
    expect(optionsOf(whose)).toEqual(['мой', 'бросок по мне']);
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

  it('правка входа эффекта: что правим — его величина, метки — «любая из»', () => {
    const withDamage = {
      ...system,
      tables: { ...system.tables, типы: { label: 'Типы', key: 'word', rows: [{ value: 'огонь' }, { value: 'холод' }] } },
      effects: { урон: { label: 'Урон', activation: 'manual', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }, { key: 'тип', label: 'Тип', kind: 'choice', from: 'типы' }], steps: [] } },
    } as unknown as System;
    const mods = [{ kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' }, anyTags: ['огонь'] }] as Modifier[];
    render(<ModifiersEditor system={withDamage} modifiers={mods} onEdit={vi.fn()} />);
    expect(screen.getByDisplayValue('Урон')).toBeTruthy();
    expect(screen.getByText('Сколько')).toBeTruthy();
    expect(screen.getAllByText('огонь').length).toBeGreaterThan(0);
    expect(screen.queryByText('Чей бросок')).toBeNull();
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
    const mods = [{ kind: 'edit', call: 'roll', param: 'edits', edit: '' }] as Modifier[];
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
    const valueMod = [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '1' }, stacking: 'sum' }] as Modifier[];
    render(<ModifiersEditor system={system} modifiers={valueMod} onEdit={vi.fn()} />);
    const how = screen.getByDisplayValue('прибавить') as HTMLSelectElement;
    expect(optionsOf(how)).toEqual(['прибавить', 'умножить', 'задать', 'не меньше', 'не больше']);
  });
});
