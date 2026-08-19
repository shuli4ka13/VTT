// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModifiersEditor } from './modifiers.tsx';
import type { System, Modifier } from '@vtt/schema';

const system = {
  fields: [{ tag: 'ac', label: 'Класс брони', value: { kind: 'stored', type: 'number', default: 10 } }],
  rolls: [{ tag: 'attack_roll', label: 'Бросок атаки' }],
  roll_edits: { фора: { label: 'Фора', ops: [{ op: 'addDie' }] } },
  effects: {},
} as unknown as System;

const rollMod = [{ kind: 'roll', target: 'attack_roll', edit: 'фора', condition: null }] as Modifier[];

const optionsOf = (select: HTMLSelectElement) => [...select.options].map(o => o.textContent);

describe('редактор модификаторов', () => {
  it('«Любой бросок» предлагается наравне с объявленными мишенями', () => {
    render(<ModifiersEditor system={system} modifiers={rollMod} onEdit={vi.fn()} />);
    const target = screen.getByDisplayValue('Бросок атаки') as HTMLSelectElement;
    expect(optionsOf(target)).toContain('Любой бросок');
    expect(optionsOf(target)).toContain('Бросок атаки');
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
