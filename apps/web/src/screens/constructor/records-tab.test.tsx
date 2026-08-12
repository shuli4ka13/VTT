// apps/web/src/screens/constructor/records-tab.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecordsTab } from './records-tab.tsx';
import { useWorld } from '../../store/world.ts';

describe('RecordsTab: род видит потребности эффекта', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          hit: { label: 'Удар', activation: 'manual', params: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }], steps: [] },
        },
        records: {
          weapon: {
            kind: 'item', label: 'Оружие', group: 'Снаряжение',
            props: [],
            bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
          },
        },
      },
      activeRecordKind: 'weapon',
    }));
  });

  it('незакрытая потребность заводит свойство кнопкой и закрывается', () => {
    render(<RecordsTab />);
    expect(screen.getByText(/не закрыто/).textContent).toContain('Кость урона');

    fireEvent.click(screen.getByText('+ завести свойство «Кость урона»'));

    const kind = useWorld.getState().system.records!.weapon!;
    expect(kind.props!.some(p => p.label === 'Кость урона' && p.kind === 'dice')).toBe(true);
    expect((kind.bindings![0] as any).args['кость']).toEqual({ prop: kind.props![0]!.key });
    expect(screen.queryByText(/не закрыто/)).toBeNull();
  });

  it('на экране нет слов «дырка», «параметр», «привязка»', () => {
    render(<RecordsTab />);
    expect(screen.queryByText(/дырк/i)).toBeNull();
    expect(screen.queryByText(/параметр/i)).toBeNull();
    expect(screen.queryByText(/привязк/i)).toBeNull();
  });
});
