// apps/web/src/screens/compendium/compendium.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompendiumScreen } from './compendium.tsx';
import { useWorld } from '../../store/world.ts';

describe('CompendiumScreen: запись говорит, что даст владельцу', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          hit: { label: 'Удар', activation: 'manual', params: [], steps: [] },
        },
        records: {
          weapon: {
            kind: 'item', label: 'Оружие', group: 'Снаряжение',
            props: [],
            bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
          },
          trinket: {
            kind: 'item', label: 'Безделушка', group: 'Прочее',
            props: [],
          },
        },
      },
      compendium: {
        items: [
          { id: 'sword', rk: 'weapon', label: 'Меч', props: {} },
          { id: 'bauble', rk: 'trinket', label: 'Побрякушка', props: {} },
        ],
        actions: [],
      },
      activeRecordId: 'sword',
    }));
  });

  it('показывает «владелец получит: Удар» для рода с привязкой', () => {
    render(<CompendiumScreen />);
    expect(screen.getByText('владелец получит: Удар')).toBeTruthy();
  });

  it('ничего не показывает у рода без привязок', () => {
    useWorld.setState({ activeRecordId: 'bauble' });
    render(<CompendiumScreen />);
    expect(screen.queryByText(/владелец получит/)).toBeNull();
  });
});

// Кость записи — та же формочка, что у костей системы: счёт, «к», грани.
// Нотацию «2d6» текстом автор угадать не мог; два числа читаются без
// инструкции. Хранится по-прежнему строкой — столько понимает движок.
describe('CompendiumScreen: кость записи — формочкой, а не нотацией', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          hit: {
            label: 'Удар', activation: 'manual',
            params: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }], steps: [],
          },
        },
        records: {
          weapon: {
            kind: 'item', label: 'Оружие', group: 'Снаряжение',
            props: [{ key: 'damage_dice', label: 'Кость урона', kind: 'dice' }],
            bindings: [{ label: 'Удар', effect: 'hit', args: { кость: { prop: 'damage_dice' } } }],
          },
        },
      },
      compendium: {
        items: [{ id: 'sword', rk: 'weapon', label: 'Меч', props: { damage_dice: '1d8' } }],
        actions: [],
      },
      activeRecordId: 'sword',
    }));
  });

  it('хранимое «1d8» разложено на счёт и грани', () => {
    const { container } = render(<CompendiumScreen />);
    const term = container.querySelector('.dice-term')!;
    const [count, sides] = [...term.querySelectorAll('input')] as HTMLInputElement[];
    expect(count!.value).toBe('1');
    expect(sides!.value).toBe('8');
  });

  it('правка граней пишет обратно нотацию для движка', () => {
    const { container } = render(<CompendiumScreen />);
    const term = container.querySelector('.dice-term')!;
    const [, sides] = [...term.querySelectorAll('input')] as HTMLInputElement[];
    fireEvent.change(sides!, { target: { value: '12' } });

    const sword = useWorld.getState().compendium.items!.find(i => i.id === 'sword')!;
    expect(sword.props!.damage_dice).toBe('1d12', 'у этого меча — своя кость');
  });

  it('недописанные грани не портят сохранённое', () => {
    const { container } = render(<CompendiumScreen />);
    const term = container.querySelector('.dice-term')!;
    const [, sides] = [...term.querySelectorAll('input')] as HTMLInputElement[];
    fireEvent.change(sides!, { target: { value: '' } });

    const sword = useWorld.getState().compendium.items!.find(i => i.id === 'sword')!;
    expect(sword.props!.damage_dice).toBe('1d8');
  });
});
