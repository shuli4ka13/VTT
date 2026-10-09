import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import type { System } from '@vtt/schema';
import { callMap, bookEntriesOf } from './call-map.ts';
import { CallMapRow, UsageRow } from './call-map.tsx';
import { useWorld } from '../../../store/world.ts';

const dnd = SAMPLE_SYSTEMS[0] as System;
const idByLabel = (label: string): string => Object.entries(dnd.effects).find(([, e]) => e.label === label)![0];

describe('видимая иерархия вызовов', () => {
  it('«Атака» вызывает бросок атаки и урон', () => {
    const strike = idByLabel('Атака');
    const names = callMap(dnd, strike).calls.map(id => dnd.effects[id]!.label);
    expect(names).toContain('Бросок атаки');
    expect(names.length).toBeGreaterThanOrEqual(2);
  });

  it('бросок атаки используется в «Атаке»', () => {
    const roll = idByLabel('Бросок атаки');
    const users = callMap(dnd, roll).usedBy.map(one => dnd.effects[one.id]!.label);
    expect(users).toContain('Атака');
  });

  it('у каждого вызываемого ровно те же вызывающие, что видны с обратной стороны', () => {
    for (const id of Object.keys(dnd.effects)) {
      for (const called of callMap(dnd, id).calls) {
        expect(callMap(dnd, called).usedBy.map(one => one.id)).toContain(id);
      }
    }
  });

  it('щит слушает «Атаку» по метке', () => {
    const heard = callMap(dnd, idByLabel('Атака')).heardBy.map(id => dnd.effects[id]!.label);
    expect(heard).toContain('Щит');
  });

  it('записи книги находятся по привязке', () => {
    const bound = Object.values(dnd.tables ?? {}).flatMap(t => (t.bindings ?? []).map(b => b.effect));
    if (bound.length) expect(bookEntriesOf(dnd, bound[0]!).length).toBeGreaterThan(0);
  });
});

describe('рендер строки', () => {
  beforeEach(() => { useWorld.getState().pick({ activeEffectId: null }); });

  it('ссылка открывает эффект', () => {
    const strike = idByLabel('Атака');
    render(<CallMapRow id={strike} effect={dnd.effects[strike]!} system={dnd} />);
    expect(screen.getByText('Вызывает:')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '«Бросок атаки»' }));
    expect(useWorld.getState().activeEffectId).toBe(idByLabel('Бросок атаки'));
  });

  it('пусто — ничего', () => {
    const system = { ...dnd, effects: { a: { label: 'A', activation: 'manual', steps: [] } } } as unknown as System;
    const { container } = render(<CallMapRow id="a" effect={system.effects.a!} system={system} />);
    expect(container.innerHTML).toBe('');
  });

  it('длинный список — первые три и раскрытие', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map(key => ({ key, text: key }));
    render(<UsageRow title="Где:" items={items} />);
    expect(screen.queryByText('d')).toBeNull();
    fireEvent.click(screen.getByText('и ещё 2'));
    expect(screen.getByText('e')).toBeTruthy();
  });
});
