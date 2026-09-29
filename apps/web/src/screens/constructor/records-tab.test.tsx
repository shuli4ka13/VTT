// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecordsTab } from './records-tab.tsx';
import { useWorld } from '../../store/world.ts';
import { optionsFor } from './slot-input.tsx';

describe('RecordsTab: тип видит потребности эффекта', () => {
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

    fireEvent.click(screen.getByText('+ новое свойство «Кость урона»'));

    const kind = useWorld.getState().system.records!.weapon!;
    expect(kind.props!.some(p => p.label === 'Кость урона' && p.kind === 'dice')).toBe(true);
    expect(kind.props![0]!.key).toBe('кость');
    expect((kind.bindings![0] as any).args?.['кость']).toBeUndefined();
    expect(screen.queryByText(/не закрыто/)).toBeNull();
  });

  it('на экране нет слов «дырка», «параметр», «привязка»', () => {
    render(<RecordsTab />);
    expect(screen.queryByText(/дырк/i)).toBeNull();
    expect(screen.queryByText(/параметр/i)).toBeNull();
    expect(screen.queryByText(/привязк/i)).toBeNull();
  });

  it('в привязке типа «Оружие» не предлагается свойство типа «Доспех»', () => {
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
    expect(container.querySelector('.need-fill'), 'незакрытая потребность нарисована').toBeTruthy();

    const system = useWorld.getState().system;
    const предложат = optionsFor({
      system,
      effect: system.effects.hit!,
      earlier: [],
      recordKind: system.records!.weapon!,
    }, undefined, ['prop']).map(option => option.label);

    expect(предложат.some(label => label.includes('Кость урона')), предложат.join(' | ')).toBe(true);
    expect(предложат.some(label => label.includes('Класс защиты'))).toBe(false);
  });
});

describe('модификаторы типа', () => {
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

  it('у типа-вещи есть своя секция «Что правит каждая вещь этого типа»', () => {
    render(<RecordsTab />);
    expect(screen.getByText('Что правит каждая вещь этого типа')).toBeTruthy();
  });

  it('правка броска пишется в тип, а не в запись компендиума', () => {
    render(<RecordsTab />);
    fireEvent.click(screen.getByText('+ правит бросок'));

    const kind = useWorld.getState().system.records!['тяжёлый']!;
    expect(kind.modifiers).toHaveLength(1);
    expect(kind.modifiers![0]).toMatchObject({ kind: 'roll', edit: 'помеха' });
    expect(useWorld.getState().compendium.records).toEqual([]);
  });
});

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
            bindings: [{ label: 'Удар', effect: 'hit', args: { кость: { expr: '@damage_dice' } } }],
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

describe('RecordsTab: свойство на лист или служебное', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {},
        records: {
          weapon: { kind: 'item', label: 'Оружие', props: [{ key: 'вес', label: 'Вес', kind: 'number' }], bindings: [] },
        },
      },
      activeRecordKind: 'weapon',
    }));
  });

  it('по умолчанию свойство на листе; «служебное» пишет onSheet: false, обратно — убирает ключ', () => {
    render(<RecordsTab />);
    const where = screen.getByDisplayValue('на лист — игрок видит') as HTMLSelectElement;
    fireEvent.change(where, { target: { value: 'service' } });
    expect(useWorld.getState().system.records!.weapon!.props![0]!.onSheet).toBe(false);
    fireEvent.change(where, { target: { value: 'sheet' } });
    expect('onSheet' in useWorld.getState().system.records!.weapon!.props![0]!).toBe(false);
  });

  it('среди видов свойства есть «запись»', () => {
    render(<RecordsTab />);
    const kind = screen.getByDisplayValue('число') as HTMLSelectElement;
    expect([...kind.options].map(o => o.textContent)).toContain('запись');
  });
});

describe('слот привязки подсказывает то, чем его закрывают', () => {
  const система = () => ({
    fields: [
      { tag: 'atl', label: 'Атлетика', value: { kind: 'stored', type: 'number', default: 0 } },
      { tag: 'atl_prof', label: 'Владение: Атлетика', value: { kind: 'stored', type: 'number', default: 0 } },
    ],
    constants: {},
    tables: {
      damage_types: {
        label: 'Типы урона', key: 'word',
        rows: [{ value: 'рубящий', label: 'рубящий' }, { value: 'некротический', label: 'некротический' }],
      },
      wield_attack: {
        label: 'Бонус атаки по тому, чем бьют', key: 'word',
        columns: [{ key: 'value', label: 'формула', kind: 'expr' }], rows: [],
      },
    },
    effects: {
      hit: {
        label: 'Удар', activation: 'manual', steps: [],
        params: [
          { key: 'damage_type', label: 'Тип урона', kind: 'choice', from: 'damage_types' },
          { key: 'attack_with', label: 'Бонус атаки', kind: 'number' },
        ],
      },
    },
    records: {
      weapon: {
        kind: 'item', label: 'Оружие',
        props: [{ key: 'wield', label: 'Чем бьют', kind: 'text' }],
        bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
      },
    },
  });

  beforeEach(() => {
    useWorld.setState(state => ({ ...state, system: { ...state.system, ...система() }, activeRecordKind: 'weapon' }));
  });

  const набрать = (подпись: string, текст: string) => {
    const строка = [...document.querySelectorAll('.need-fill')]
      .find(el => el.textContent?.includes(подпись))!;
    const поле = [...строка.querySelectorAll('input.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.focus(поле);
    fireEvent.change(поле, { target: { value: `@${текст}`, selectionStart: текст.length + 1 } });
    return [...document.querySelectorAll('.slot__option')].map(o => o.textContent?.trim() ?? '');
  };

  it('свойства записи и таблицы предлагаются, а не только поля', () => {
    render(<RecordsTab />);
    const видно = набрать('Бонус атаки', 'чем');
    expect(видно.some(t => t.includes('Чем бьют')), видно.join(' | ')).toBe(true);
    expect(видно.some(t => t.includes('Бонус атаки по тому, чем бьют'))).toBe(true);
  });

  it('совпавшее с начала стоит выше спрятанного в середине слова', () => {
    render(<RecordsTab />);
    const видно = набрать('Тип урона', 'Ти');
    expect(видно[0], видно.join(' | ')).toContain('Тип урона');
    const свой = видно.findIndex(t => t.includes('Тип урона'));
    const чужой = видно.findIndex(t => t.includes('Атлетика'));
    expect(свой).toBeLessThan(чужой === -1 ? Number.MAX_SAFE_INTEGER : чужой);
  });

  it('пустая потребность первым делом предлагает завести свойство — с видом и словарём', () => {
    render(<RecordsTab />);
    const видно = набрать('Тип урона', '');
    expect(видно.some(t => t.includes('новое свойство «Тип урона»')), видно.join(' | ')).toBe(true);

    const кнопка = [...document.querySelectorAll('.slot__option')]
      .find(o => o.textContent?.includes('новое свойство'))!;
    fireEvent.mouseDown(кнопка);

    const kind = useWorld.getState().system.records!.weapon!;
    const свойство = kind.props!.find(p => p.label === 'Тип урона')!;
    expect(свойство.kind).toBe('choice');
    expect(свойство.from).toBe('damage_types');
    expect(свойство.key).toBe('damage_type');
    expect((kind.bindings![0] as any).args?.damage_type).toBeUndefined();
  });
});
