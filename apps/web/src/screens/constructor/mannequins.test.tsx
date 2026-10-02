// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { Mannequins } from './mannequins.tsx';
import { useWorld, emptySystem } from '../../store/world.ts';
import type { System } from '@vtt/schema';

function View() {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);
  return <Mannequins system={system} editSystem={editSystem} />;
}

describe('манекены пробы', () => {
  afterEach(cleanup);

  it('значение манекена пишется в систему, «по умолчанию» его убирает', () => {
    useWorld.setState(state => ({ ...state, system: { ...emptySystem(), tables: { лист: { shape: 'single', columns: [{ key: 'хп', label: 'Хиты', kind: 'number', default: 10 }] } } } as unknown as System }));
    render(<View />);
    fireEvent.change(screen.getByPlaceholderText('10'), { target: { value: '25' } });
    expect(useWorld.getState().system.mannequins?.[0]?.values.хп).toBe(25);
    fireEvent.click(screen.getByText('вернуть по умолчанию'));
    expect(useWorld.getState().system.mannequins).toBeUndefined();
  });
});
