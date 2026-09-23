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

  it('стёр грани, набрал «12» — кость стала 1d12', () => {
    const { container } = render(<CompendiumScreen />);
    const term = container.querySelector('.dice-term')!;
    const [, sides] = [...term.querySelectorAll('input')] as HTMLInputElement[];

    fireEvent.change(sides!, { target: { value: '' } });
    expect(sides!.value).toBe('', 'пустота живёт, пока набирают');

    fireEvent.change(sides!, { target: { value: '1' } });
    fireEvent.change(sides!, { target: { value: '12' } });
    fireEvent.blur(sides!);

    const sword = useWorld.getState().compendium.items!.find(i => i.id === 'sword')!;
    expect(sword.props!.damage_dice).toBe('1d12');
    expect(sides!.value).toBe('12', 'после ухода фокуса — из данных');
  });
});

describe('CompendiumScreen: id новой записи не завязан только на род', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        records: {
          weapon: { kind: 'item', label: 'Оружие', group: 'Снаряжение', props: [] },
        },
      },
      compendium: { items: [], actions: [] },
      activeRecordId: null,
    }));
  });

  it('первая запись рода в двух разных компендиумах получает разные id', () => {
    const { container } = render(<CompendiumScreen />);
    const pick = () => fireEvent.click(container.querySelector('.card--pick')!);

    pick();
    const first = useWorld.getState().compendium.items![0]!.id;

    useWorld.setState({ compendium: { items: [], actions: [] }, activeRecordId: null });
    pick();
    const second = useWorld.getState().compendium.items![0]!.id;

    expect(second).not.toBe(first);
  });
});

describe('CompendiumScreen: превью «как увидит игрок»', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: { hit: { label: 'Удар', activation: 'manual', params: [], steps: [] } },
        records: {
          weapon: {
            kind: 'item', label: 'Оружие', group: 'Снаряжение',
            props: [
              { key: 'dmg', label: 'Кость урона', kind: 'dice' },
              { key: 'cost', label: 'Цена', kind: 'number', onSheet: false },
              { key: 'ammo', label: 'Патроны', kind: 'record' },
            ],
            bindings: [{ label: 'Выстрел', effect: 'hit', args: {} }],
          },
          ammo: { kind: 'item', label: 'Боеприпасы', props: [] },
        },
      },
      compendium: {
        items: [
          { id: 'gun', rk: 'weapon', label: 'Пистолет', description: 'Тяжёлый.', props: { dmg: '3d6', cost: 500, ammo: 'nine' } },
          { id: 'nine', rk: 'ammo', label: 'Патроны 9 мм', props: {} },
        ],
        actions: [],
      },
      activeRecordId: 'gun',
    }));
  });

  it('показывает подпись, описание, циферки «на лист» и кнопки; служебное скрыто, ссылка на запись подписана', () => {
    render(<CompendiumScreen />);
    expect(screen.getByText('Как увидит игрок')).toBeTruthy();
    const view = document.querySelector('.record-view')!;
    expect(view.textContent).toContain('Пистолет');
    expect(view.textContent).toContain('Тяжёлый.');
    expect(view.textContent).toContain('3к6');
    expect(view.textContent).toContain('Патроны 9 мм');
    expect(view.textContent).toContain('Выстрел');
    expect(view.textContent).not.toContain('Цена');
  });

  it('свойство «ссылка на запись» выбирается из записей компендиума, без самой себя', () => {
    render(<CompendiumScreen />);
    const select = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'nine'))!;
    expect([...select.options].map(o => o.value)).toEqual(['', 'nine']);
  });
});

describe('свойство из словаря — выбор, а не ввод', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        tables: {
          damage_types: {
            label: 'Типы урона', key: 'word',
            rows: [{ value: 'рубящий', label: 'рубящий' }, { value: 'огонь', label: 'огонь' }],
          },
        },
        effects: {},
        records: {
          weapon: {
            kind: 'item', label: 'Оружие',
            props: [
              { key: 'damage_type', label: 'Тип урона', kind: 'choice', from: 'damage_types' },
              { key: 'ничей', label: 'Без словаря', kind: 'choice' },
            ],
            bindings: [],
          },
        },
      },
      compendium: {
        items: [{ id: 'sword', rk: 'weapon', label: 'Меч', props: { damage_type: 'рубящий' } }],
        actions: [],
      },
      activeRecordId: 'sword',
    }));
  });

  const полеУ = (подпись: string) =>
    [...document.querySelectorAll('label')].find(l => l.textContent?.includes(подпись))!;

  it('вместо строки ввода — список значений словаря', () => {
    render(<CompendiumScreen />);
    const select = полеУ('Тип урона').querySelector('select') as HTMLSelectElement;

    expect(select, 'это список, а не ввод').toBeTruthy();
    expect(select.value).toBe('рубящий');
    expect([...select.options].map(o => o.value)).toEqual(['', 'рубящий', 'огонь']);
  });

  it('выбранное уходит в запись', () => {
    render(<CompendiumScreen />);
    fireEvent.change(полеУ('Тип урона').querySelector('select')!, { target: { value: 'огонь' } });
    expect(useWorld.getState().compendium.items[0]!.props!.damage_type).toBe('огонь');
  });

  it('словарь не выбран — так и сказано, а не пустой список', () => {
    render(<CompendiumScreen />);
    const select = полеУ('Без словаря').querySelector('select') as HTMLSelectElement;
    expect(select.options[0]!.textContent).toBe('— словарь не выбран —');
  });
});

describe('свойство «несколько значений» — фишки, а не одно поле', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        tables: {
          props: { label: 'Свойства оружия', key: 'word', rows: [{ value: 'лёгкое', label: 'лёгкое' }, { value: 'тяжёлое', label: 'тяжёлое' }] },
        },
        effects: {},
        records: {
          weapon: {
            kind: 'item', label: 'Оружие',
            props: [{ key: 'properties', label: 'Свойства', kind: 'choice', from: 'props', many: true }],
            bindings: [],
          },
        },
      },
      compendium: { items: [{ id: 'sword', rk: 'weapon', label: 'Меч', props: { properties: ['лёгкое'] } }], actions: [] },
      activeRecordId: 'sword',
    }));
  });

  it('выбранное стоит фишкой, добавление дописывает в список', () => {
    render(<CompendiumScreen />);
    const поле = [...document.querySelectorAll('label')].find(l => l.textContent?.includes('Свойства'))!;
    expect(поле.textContent).toContain('лёгкое');
    fireEvent.change(поле.querySelector('select')!, { target: { value: 'тяжёлое' } });
    expect(useWorld.getState().compendium.items[0]!.props!.properties).toEqual(['лёгкое', 'тяжёлое']);
  });
});
