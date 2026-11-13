// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { pickCombo } from '../../testing/cards.ts';
import { renderOpen } from '../../testing/render-open.tsx';
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
        tables: {
          weapon: {
            shape: 'book', use: 'item', label: 'Оружие', block: 'Снаряжение',
            columns: [],
            bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
          },
          trinket: {
            shape: 'book', use: 'item', label: 'Безделушка', block: 'Прочее',
            columns: [],
          },
        },
      },
      compendium: {
        records: [{ id: 'sword', table: 'weapon', label: 'Меч', cells: {} }, { id: 'bauble', table: 'trinket', label: 'Побрякушка', cells: {} }],
      },
      activeRecordId: 'sword',
    }));
  });

  it('показывает «владелец получит: Удар» для рода с привязкой', () => {
    renderOpen(<CompendiumScreen />);
    expect(screen.getByText('владелец получит: Удар')).toBeTruthy();
  });

  it('свою кнопку записи можно завести и назвать тем же редактором, что у типа', () => {
    renderOpen(<CompendiumScreen />);
    fireEvent.click(screen.getByText('+ кнопка'));
    const record = useWorld.getState().compendium.records!.find(r => r.id === 'sword')!;
    expect(record.bindings).toHaveLength(1);
    expect(screen.getByText('Свои кнопки')).toBeTruthy();
    expect(screen.getAllByPlaceholderText('как назвать кнопку').length).toBeGreaterThan(0);
  });

  it('ничего не показывает у рода без привязок', () => {
    useWorld.setState({ activeRecordId: 'bauble' });
    renderOpen(<CompendiumScreen />);
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
        tables: {
          weapon: {
            shape: 'book', use: 'item', label: 'Оружие', block: 'Снаряжение',
            columns: [{ key: 'damage_dice', label: 'Кость урона', kind: 'dice' }],
            bindings: [{ label: 'Удар', effect: 'hit', args: { кость: { expr: '@damage_dice' } } }],
          },
        },
      },
      compendium: {
        records: [{ id: 'sword', table: 'weapon', label: 'Меч', cells: { damage_dice: '1d8' } }],
      },
      activeRecordId: 'sword',
    }));
  });

  it('хранимое «1d8» разложено на счёт и грани', () => {
    const { container } = renderOpen(<CompendiumScreen />);
    const term = container.querySelector('.dice-term')!;
    const [count, sides] = [...term.querySelectorAll('input')] as HTMLInputElement[];
    expect(count!.value).toBe('1');
    expect(sides!.value).toBe('8');
  });

  it('правка граней пишет обратно нотацию для движка', () => {
    const { container } = renderOpen(<CompendiumScreen />);
    const term = container.querySelector('.dice-term')!;
    const [, sides] = [...term.querySelectorAll('input')] as HTMLInputElement[];
    fireEvent.change(sides!, { target: { value: '12' } });

    const sword = useWorld.getState().compendium.records!.find(i => i.id === 'sword')!;
    expect(sword.cells!.damage_dice).toBe('1d12', 'у этого меча — своя кость');
  });

  it('недописанные грани не портят сохранённое', () => {
    const { container } = renderOpen(<CompendiumScreen />);
    const term = container.querySelector('.dice-term')!;
    const [, sides] = [...term.querySelectorAll('input')] as HTMLInputElement[];
    fireEvent.change(sides!, { target: { value: '' } });

    const sword = useWorld.getState().compendium.records!.find(i => i.id === 'sword')!;
    expect(sword.cells!.damage_dice).toBe('1d8');
  });

  it('стёр грани, набрал «12» — кость стала 1d12', () => {
    const { container } = renderOpen(<CompendiumScreen />);
    const term = container.querySelector('.dice-term')!;
    const [, sides] = [...term.querySelectorAll('input')] as HTMLInputElement[];

    fireEvent.change(sides!, { target: { value: '' } });
    expect(sides!.value).toBe('', 'пустота живёт, пока набирают');

    fireEvent.change(sides!, { target: { value: '1' } });
    fireEvent.change(sides!, { target: { value: '12' } });
    fireEvent.blur(sides!);

    const sword = useWorld.getState().compendium.records!.find(i => i.id === 'sword')!;
    expect(sword.cells!.damage_dice).toBe('1d12');
    expect(sides!.value).toBe('12', 'после ухода фокуса — из данных');
  });
});

describe('CompendiumScreen: id новой записи не завязан только на род', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        tables: {
          weapon: { shape: 'book', use: 'item', label: 'Оружие', block: 'Снаряжение', columns: [] },
        },
      },
      compendium: { records: [] },
      activeRecordId: null,
    }));
  });

  it('первая запись рода в двух разных компендиумах получает разные id', () => {
    const { container } = renderOpen(<CompendiumScreen />);
    const pick = () => fireEvent.click(container.querySelector('.card--pick')!);

    pick();
    const first = useWorld.getState().compendium.records![0]!.id;

    useWorld.setState({ compendium: { records: [] }, activeRecordId: null });
    pick();
    const second = useWorld.getState().compendium.records![0]!.id;

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
        tables: {
          weapon: {
            shape: 'book', use: 'item', label: 'Оружие', block: 'Снаряжение',
            columns: [
              { key: 'dmg', label: 'Кость урона', kind: 'dice' },
              { key: 'cost', label: 'Цена', kind: 'number', onSheet: false },
              { key: 'ammo', label: 'Патроны', kind: 'record' },
            ],
            bindings: [{ label: 'Выстрел', effect: 'hit', args: {} }],
          },
          ammo: { shape: 'book', use: 'item', label: 'Боеприпасы', columns: [] },
        },
      },
      compendium: {
        records: [{ id: 'gun', table: 'weapon', label: 'Пистолет', description: 'Тяжёлый.', cells: { dmg: '3d6', cost: 500, ammo: 'nine' } }, { id: 'nine', table: 'ammo', label: 'Патроны 9 мм', cells: {} }],
      },
      activeRecordId: 'gun',
    }));
  });

  it('показывает подпись, описание, циферки «на лист» и кнопки; служебное скрыто, ссылка на запись подписана', () => {
    renderOpen(<CompendiumScreen />);
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
    renderOpen(<CompendiumScreen />);
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
         weapon: {
            shape: 'book', use: 'item', label: 'Оружие',
            columns: [
              { key: 'damage_type', label: 'Тип урона', kind: 'choice', from: 'damage_types' },
              { key: 'ничей', label: 'Без словаря', kind: 'choice' },
            ],
            bindings: [],
          } },
        effects: {},
        
      },
      compendium: {
        records: [{ id: 'sword', table: 'weapon', label: 'Меч', cells: { damage_type: 'рубящий' } }],
      },
      activeRecordId: 'sword',
    }));
  });

  const полеУ = (подпись: string) =>
    [...document.querySelectorAll('label')].find(l => l.textContent?.includes(подпись))!;

  it('вместо строки ввода — список значений словаря', () => {
    renderOpen(<CompendiumScreen />);
    const select = полеУ('Тип урона').querySelector('select') as HTMLSelectElement;

    expect(select, 'это список, а не ввод').toBeTruthy();
    expect(select.value).toBe('рубящий');
    expect([...select.options].map(o => o.value)).toEqual(['', 'рубящий', 'огонь']);
  });

  it('выбранное уходит в запись', () => {
    renderOpen(<CompendiumScreen />);
    fireEvent.change(полеУ('Тип урона').querySelector('select')!, { target: { value: 'огонь' } });
    expect(useWorld.getState().compendium.records[0]!.cells!.damage_type).toBe('огонь');
  });

  it('словарь не выбран — так и сказано, а не пустой список', () => {
    renderOpen(<CompendiumScreen />);
    const select = полеУ('Без словаря').querySelector('select') as HTMLSelectElement;
    expect(select.options[0]!.textContent).toBe('— таблица не выбрана —');
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
         weapon: {
            shape: 'book', use: 'item', label: 'Оружие',
            columns: [{ key: 'properties', label: 'Свойства', kind: 'choice', from: 'props', many: true }],
            bindings: [],
          } },
        effects: {},
        
      },
      compendium: { records: [{ id: 'sword', table: 'weapon', label: 'Меч', cells: { properties: ['лёгкое'] } }] },
      activeRecordId: 'sword',
    }));
  });

  it('выбранное стоит фишкой, добавление дописывает в список', () => {
    renderOpen(<CompendiumScreen />);
    const поле = [...document.querySelectorAll('label')].find(l => l.textContent?.includes('Свойства'))!;
    expect(поле.textContent).toContain('лёгкое');
    pickCombo(поле.querySelector<HTMLElement>('[role="combobox"]')!, 'тяжёлое');
    expect(useWorld.getState().compendium.records[0]!.cells!.properties).toEqual(['лёгкое', 'тяжёлое']);
  });
});

describe('свойство основы — у записи-наследника', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        tables: {
          gear: { shape: 'book', use: 'item', label: 'Снаряжение', columns: [{ key: 'weight', label: 'Вес, фунтов', kind: 'number' }] },
          weapon: {
            shape: 'book', use: 'item', label: 'Оружие', extends: 'gear',
            columns: [{ key: 'damage_dice', label: 'Кость урона', kind: 'dice' }],
          },
        },
        effects: {},
      },
      compendium: { records: [{ id: 'sword', table: 'weapon', label: 'Меч', cells: { damage_dice: '1d8', weight: 3 } }] },
      activeRecordId: 'sword',
    }));
  });

  it('вес из «Снаряжения» виден и правится у меча, а тип «Оружие» не меняется', () => {
    renderOpen(<CompendiumScreen />);
    const поле = [...document.querySelectorAll('label')].find(l => l.textContent?.includes('Вес, фунтов'))!;
    expect(поле, 'колонка основы стоит среди циферок записи').toBeTruthy();
    expect(document.querySelector('.record-view')!.textContent).toContain('Вес, фунтов');
    expect(useWorld.getState().system.tables!.weapon!.columns!.map(c => c.key)).toEqual(['damage_dice']);
  });
});
