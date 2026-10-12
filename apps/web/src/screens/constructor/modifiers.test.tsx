import { renderOpen } from '../../testing/render-open.tsx';
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModifiersEditor } from './modifiers.tsx';
import { modifierSentence } from './modifier-words.ts';
import type { System, Modifier } from '@vtt/schema';

const system = {
  tables: { лист: { shape: 'single', columns: [{ key: 'ac', label: 'Класс брони', kind: 'number', default: 10 }] }, rolls: { label: 'Броски', key: 'word', rows: [{ value: 'атака' }, { value: 'спасбросок' }] } },
  roll_edits: { фора: { label: 'Фора', ops: [{ op: 'addDie' }] } },
  effects: {},
} as unknown as System;

const rollMod = [{ kind: 'edit', call: 'roll', param: 'edits', tags: ['атака'], edit: 'фора' }] as Modifier[];

const optionsOf = (select: HTMLSelectElement) => [...select.options].map(o => o.textContent);

describe('редактор модификаторов', () => {
  it('кого касается — бросает носитель или бросают против него, а какой именно бросок — метки из строк таблиц', () => {
    renderOpen(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
    expect((screen.getByDisplayValue('Бросок') as HTMLSelectElement).value).toBe('roll');
    const whose = screen.getByDisplayValue('всех — без условия') as HTMLSelectElement;
    expect(optionsOf(whose)).toEqual(['всех — без условия', 'бросает носитель', 'бросают против носителя']);
    expect(screen.getByText('атака')).toBeTruthy();
    const more = screen.getByDisplayValue('+ ещё…') as HTMLSelectElement;
    expect(optionsOf(more)).toContain('спасбросок');
    expect(more.querySelector('optgroup')?.getAttribute('label')).toBe('метки бросков · Броски');
  });

  it('«Кого касается» пишет условие про носителя в if, а записанное условие показывает выбранным', () => {
    const mods = structuredClone(rollMod) as Modifier[];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    const { unmount } = renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={onEdit} />);
    fireEvent.change(screen.getByDisplayValue('всех — без условия'), { target: { value: '@против == @носитель' } });
    expect((mods[0] as { if?: unknown }).if).toEqual({ expr: '@против == @носитель' });
    unmount();

    renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={vi.fn()} />);
    expect((screen.getByDisplayValue('бросают против носителя') as HTMLSelectElement).value).toBe('@против == @носитель');
  });

  it('условие поверх «Кого касается» хранится как все(…) и очищается вместе с выбором', () => {
    const mods = [{ ...rollMod[0], if: { expr: 'все(@бросающий == @носитель, @носитель.ac > 1)' } }] as unknown as Modifier[];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={onEdit} />);
    const whose = screen.getByDisplayValue('бросает носитель') as HTMLSelectElement;
    fireEvent.change(whose, { target: { value: '' } });
    expect((mods[0] as { if?: { expr: string } }).if).toEqual({ expr: '@носитель.ac > 1' });
  });

  it('правки предлагаются из словаря автора, а не из зашитого списка', () => {
    renderOpen(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
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
    renderOpen(<ModifiersEditor system={withDamage} modifiers={mods} onEdit={vi.fn()} />);
    expect(screen.getByDisplayValue('Урон')).toBeTruthy();
    expect(screen.getByText('Сколько')).toBeTruthy();
    expect(screen.getAllByText('огонь').length).toBeGreaterThan(0);
    expect(screen.queryByText('Чей бросок')).toBeNull();
  });
});

describe('заглушка говорит словами владельца', () => {
  it('род — про род, а не про эффект', () => {
    renderOpen(<ModifiersEditor
      system={system} modifiers={[]} onEdit={() => {}}
      empty={{ title: 'Род пока ничего не правит', hint: 'проверочная' }}
    />);
    expect(screen.getByText('Род пока ничего не правит')).toBeTruthy();
    expect(screen.queryByText('Эффект пока ничего не делает')).toBeNull();
  });

  it('без своих слов — прежние, эффектные', () => {
    renderOpen(<ModifiersEditor system={system} modifiers={[]} onEdit={() => {}} />);
    expect(screen.getByText('Эффект пока ничего не делает')).toBeTruthy();
  });
});

describe('один редактор — шесть механизмов', () => {
  it('с правом писать в систему список правок предлагает готовые механизмы, выбор заводит их в словарь', () => {
    const draft = structuredClone({ ...system, roll_edits: {} }) as unknown as System;
    const editSystem = vi.fn((change: (d: System) => void) => change(draft));
    const mods = [{ kind: 'edit', call: 'roll', param: 'edits', edit: '' }] as Modifier[];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    renderOpen(<ModifiersEditor system={draft} modifiers={mods} onEdit={onEdit} editSystem={editSystem} />);

    const edit = [...document.querySelectorAll('select')]
      .find(el => [...el.options].some(o => o.value.startsWith('recipe:'))) as HTMLSelectElement;
    expect(optionsOf(edit)).toContain('+ Преимущество · Переброс кости и выбор лучшего/худшего броска');
    fireEvent.change(edit, { target: { value: 'recipe:rerollBest:advantage' } });

    expect(draft.roll_edits?.advantage?.canceledBy).toBe('disadvantage');
    expect(draft.roll_edits?.disadvantage).toBeTruthy();
    expect(mods[0]!.edit).toBe('advantage');
  });

  it('без права писать в систему готовых механизмов в списке нет', () => {
    renderOpen(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
    const edit = screen.getByDisplayValue('Фора') as HTMLSelectElement;
    expect([...edit.options].some(o => o.value.startsWith('recipe:'))).toBe(false);
  });

  it('у значения есть пол и потолок', () => {
    const valueMod = [{ kind: 'value', target: 'ac', op: 'add', value: { expr: '1' } }] as Modifier[];
    renderOpen(<ModifiersEditor system={system} modifiers={valueMod} onEdit={vi.fn()} />);
    const how = screen.getByDisplayValue('прибавить') as HTMLSelectElement;
    expect(optionsOf(how)).toEqual(['прибавить', 'умножить', 'задать', 'не меньше', 'не больше']);
  });
});

describe('правка по умолчанию касается носителя, а без условия это видно', () => {
  const withDamage = {
    ...system,
    effects: { урон: { label: 'Урон', activation: 'manual', params: [
      { key: 'кто', label: 'Кто', kind: 'sheet', role: 'actor' },
      { key: 'лист', label: 'Лист', kind: 'sheet', role: 'target' },
      { key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' },
    ], steps: [] } },
  } as unknown as System;

  it('«+ правка вызова» сразу ставит «бросает носитель»', () => {
    const mods: Modifier[] = [];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    renderOpen(<ModifiersEditor system={system} modifiers={mods} onEdit={onEdit} />);
    fireEvent.click(screen.getByText('+ правка вызова'));
    expect((mods[0] as { if?: unknown }).if).toEqual({ expr: '@бросающий == @носитель' });
  });

  it('смена вызова ставит условие про носителя этого вызова — вход-цель, а не первый лист', () => {
    const mods = [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'фора', if: { expr: '@бросающий == @носитель' } }] as unknown as Modifier[];
    const onEdit = vi.fn((change: (d: Modifier[]) => void) => change(mods));
    renderOpen(<ModifiersEditor system={withDamage} modifiers={mods} onEdit={onEdit} />);
    fireEvent.change(screen.getByDisplayValue('Бросок'), { target: { value: 'урон' } });
    expect(mods[0]).toMatchObject({ call: 'урон', param: 'сколько', if: { expr: '@лист == @носитель' } });
  });

  it('строка без условия — «бросает кто угодно» и «на всех листах»; условие не про носителя — тоже', () => {
    expect(modifierSentence(system, rollMod[0]!)).toBe('Бросок с метками «атака», бросает кто угодно: Фора');
    expect(modifierSentence(system, { ...rollMod[0]!, if: { expr: '@бросающий == @носитель' } } as Modifier)).toBe('Бросок с метками «атака», бросает носитель: Фора');
    expect(modifierSentence(system, { ...rollMod[0]!, if: { expr: '@носитель.ac > 1' } } as Modifier)).toContain('бросает кто угодно, если');
    expect(modifierSentence(system, { ...rollMod[0]!, if: { expr: 'все(@бросающий == @носитель, @носитель.ac > 1)' } } as Modifier)).not.toContain('кто угодно');
    expect(modifierSentence(system, { ...rollMod[0]!, if: { expr: '1 > 0' } } as Modifier)).toContain('бросает кто угодно, если');
    const damage = { kind: 'edit', call: 'урон', param: 'сколько', op: 'mul', value: { expr: '0.5' } } as unknown as Modifier;
    expect(modifierSentence(withDamage, damage)).toContain('«Урон» · Сколько, на всех листах:');
    expect(modifierSentence(withDamage, { ...damage, if: { expr: '@лист == @носитель' } } as Modifier)).toContain('«Урон» · Сколько, «Лист» — носитель:');
  });
});
