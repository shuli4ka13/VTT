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

  // Свойство закрывает потребность конкретного рода (весь смысл «протягивания» —
  // у меча спрашивают кость, у доспеха защиту), поэтому выпадашка «свойство
  // записи» обязана предлагать props ТОЛЬКО того рода, чью привязку правят —
  // иначе привязку «Оружия» можно было закрыть свойством «Доспеха», которого
  // у мечей нет и не будет.
  it('в привязке рода «Оружие» не предлагается свойство рода «Доспех»', () => {
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
            props: [{ key: 'кость', label: 'Кость урона' }],
            bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
          },
          armor: {
            kind: 'item', label: 'Доспех', group: 'Снаряжение',
            props: [{ key: 'защита', label: 'Класс защиты' }],
            bindings: [],
          },
        },
      },
      activeRecordKind: 'weapon',
    }));

    const { container } = render(<RecordsTab />);
    const need = container.querySelector('.need-fill') as HTMLElement;

    // Выбор ОДИН: свойства своего рода — пункты списка, чужого — нет вовсе.
    const select = need.querySelector('select') as HTMLSelectElement;
    const options = Array.from(select.options).map(o => o.textContent);

    expect(options).toContain('Кость урона — свойство записи');
    expect(options.some(o => o?.includes('Класс защиты'))).toBe(false);
  });
});

// Пассивная половина рода: «все тяжёлые доспехи мешают красться» пишется
// один раз здесь, а не строчкой на каждой кольчуге.
describe('модификаторы рода', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        fields: [{
          tag: 'скрытность', label: 'Скрытность',
          value: { kind: 'stored', type: 'number', default: 0 },
          roll: { label: 'Проверка: Скрытность' },
        }],
        roll_edits: { помеха: { label: 'Помеха', ops: [{ op: 'addDie' }] } },
        records: { тяжёлый: { kind: 'item', label: 'Тяжёлый доспех', props: [], bindings: [] } },
      },
      activeRecordKind: 'тяжёлый',
    }));
  });

  it('у рода-вещи есть своя секция «Что правит каждая вещь этого рода»', () => {
    render(<RecordsTab />);
    expect(screen.getByText('Что правит каждая вещь этого рода')).toBeTruthy();
  });

  it('правка броска пишется в род, а не в запись компендиума', () => {
    render(<RecordsTab />);
    fireEvent.click(screen.getByText('+ правит бросок'));

    const kind = useWorld.getState().system.records!['тяжёлый']!;
    expect(kind.modifiers).toHaveLength(1);
    expect(kind.modifiers![0]).toMatchObject({ kind: 'roll', edit: 'помеха' });
    expect(useWorld.getState().compendium.items).toEqual([]);
  });
});

// «Кость урона» в свойствах и «Кость урона» в подключении эффекта — не
// дубль, а два конца одной нити, и нить теперь видна: свойство говорит,
// в какую кнопку уходит. Машинного ключа на экране больше нет — он выдан
// при создании и автору не нужен (тот же принцип, что у словарей).
describe('RecordsTab: свойство знает свою судьбу', () => {
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
            props: [
              { key: 'damage_dice', label: 'Кость урона', kind: 'dice' },
              { key: 'вес', label: 'Вес', kind: 'number' },
            ],
            bindings: [{ label: 'Удар', effect: 'hit', args: { кость: { prop: 'damage_dice' } } }],
          },
        },
      },
      activeRecordKind: 'weapon',
    }));
  });

  it('протянутое свойство называет кнопку, справочное — говорит «никуда»', () => {
    render(<RecordsTab />);
    expect(screen.getByText('уходит в кнопку «Удар»')).toBeTruthy();
    expect(screen.getByText(/никуда не уходит/)).toBeTruthy();
  });

  it('поля «Ключ» на экране нет', () => {
    render(<RecordsTab />);
    expect(screen.queryByText('Ключ')).toBeNull();
    expect(screen.queryByDisplayValue('damage_dice')).toBeNull();
  });
});
