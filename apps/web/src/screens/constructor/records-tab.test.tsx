// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { RecordsTab } from './records-tab.tsx';
import { useWorld } from '../../store/world.ts';
import { optionsFor } from './value-field.tsx';

const строкаВхода = (подпись: string) => [...document.querySelectorAll('.args-row')].find(el => el.querySelector('.args-row__name')?.textContent === подпись)!;

const набрать = (подпись: string, текст: string) => {
  const поле = [...строкаВхода(подпись).querySelectorAll('input.chips__text')].at(-1) as HTMLInputElement;
  fireEvent.focus(поле);
  fireEvent.change(поле, { target: { value: `@${текст}`, selectionStart: текст.length + 1 } });
  return [...document.querySelectorAll('.slot__option')].map(o => o.textContent?.trim() ?? '');
};

const завести = () => fireEvent.mouseDown([...document.querySelectorAll('.slot__option')].find(o => o.textContent?.includes('новое свойство'))!);

describe('RecordsTab: тип видит входы эффекта', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          hit: { label: 'Удар', activation: 'manual', params: [{ key: 'кость', label: 'Кость урона', kind: 'dice' }], steps: [] },
        },
        tables: {
          weapon: {
            shape: 'book', use: 'item', label: 'Оружие', block: 'Снаряжение',
            columns: [],
            bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
          },
        },
      },
      activeRecordKind: 'weapon',
    }));
  });

  it('незаполненный вход заводит свойство из подсказки и берёт его сам', () => {
    render(<RecordsTab />);
    expect(строкаВхода('Кость урона').className).toContain('args-row--need');

    набрать('Кость урона', '');
    завести();

    const kind = useWorld.getState().system.tables!.weapon!;
    expect(kind.columns!.some(p => p.label === 'Кость урона' && p.kind === 'dice')).toBe(true);
    expect(kind.columns![0]!.key).toBe('кость');
    expect((kind.bindings![0] as any).args?.['кость']).toBeUndefined();
    expect(строкаВхода('Кость урона').className).not.toContain('args-row--need');
    expect(строкаВхода('Кость урона').querySelector('.chips__chip')?.textContent).toContain('Кость урона');
  });

  it('каждый вход эффекта — строка у типа, даже новый', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          hit: { label: 'Удар', activation: 'manual', steps: [], params: [
            { key: 'кость', label: 'Кость урона', kind: 'dice' },
            { key: 'новый', label: 'Новый вход', kind: 'number' },
            { key: 'сколько', label: 'Сколько костей', kind: 'number', default: 1 },
          ] },
        },
      },
    }));
    render(<RecordsTab />);
    expect([...document.querySelectorAll('.args-row__name')].map(el => el.textContent)).toEqual(['Кость урона', 'Новый вход', 'Сколько костей']);
    expect(строкаВхода('Новый вход').className).toContain('args-row--need');
    fireEvent.click(within(строкаВхода('Новый вход') as HTMLElement).getByRole('button', { name: '+ свойство' }));
    expect(useWorld.getState().system.tables!.weapon!.columns!.some(p => p.key === 'новый' && p.label === 'Новый вход')).toBe(true);
    expect(строкаВхода('Новый вход').className).not.toContain('args-row--need');
    expect((строкаВхода('Сколько костей').querySelector('input.chips__text') as HTMLInputElement).placeholder).toBe('как у эффекта: 1');
    expect(строкаВхода('Сколько костей').className).not.toContain('args-row--need');
  });

  it('новая кнопка: выбрал эффект — имя кнопки берётся от эффекта, входы встают строками', () => {
    useWorld.setState(state => ({
      ...state,
      system: { ...state.system, tables: { ...state.system.tables, weapon: { ...state.system.tables!.weapon!, bindings: [{ effect: '' }] } } },
    }));
    render(<RecordsTab />);
    expect(document.querySelector('.args-row')).toBeNull();
    fireEvent.change(screen.getByDisplayValue('— какой эффект —'), { target: { value: 'hit' } });
    const kind = useWorld.getState().system.tables!.weapon!;
    expect(kind.bindings![0]!.label).toBe('Удар');
    expect(kind.columns!.map(p => [p.key, p.kind])).toEqual([['кость', 'dice']]);
    expect(kind.bindings![0]!.args).toBeUndefined();
    expect(строкаВхода('Кость урона').className).not.toContain('args-row--need');
  });

  it('входы-листы, которые кнопка заполняет сама, подписаны, а не горят «не заполнено»', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...state.system,
        effects: {
          hit: { label: 'Удар', activation: 'manual', params: [
            { key: 'действующий', label: 'Кто действует', kind: 'sheet' },
            { key: 'цели', label: 'Цели', kind: 'sheet', many: true, item: { key: 'цель', label: 'Цель' } },
          ], steps: [] },
        },
      },
    }));
    render(<RecordsTab />);
    expect(screen.getByDisplayValue('кто нажал кнопку')).toBeTruthy();
    expect(screen.getByDisplayValue('цели, выбранные за столом')).toBeTruthy();
    expect(screen.queryByText('не заполнено')).toBeNull();
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
        tables: {
          weapon: {
            shape: 'book', use: 'item', label: 'Оружие', block: 'Снаряжение',
            columns: [{ key: 'кость', label: 'Кость урона' }],
            bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
          },
          armor: {
            shape: 'book', use: 'item', label: 'Доспех', block: 'Снаряжение',
            columns: [{ key: 'защита', label: 'Класс защиты' }],
            bindings: [],
          },
        },
      },
      activeRecordKind: 'weapon',
    }));

    render(<RecordsTab />);
    const видно = набрать('Кость урона', '');
    expect(видно.some(v => v.includes('Кость урона')), видно.join(' | ')).toBe(true);
    expect(видно.some(v => v.includes('Класс защиты'))).toBe(false);

    const system = useWorld.getState().system;
    const предложат = optionsFor({
      system,
      effect: system.effects.hit!,
      earlier: [],
      recordKind: system.tables!.weapon!,
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
        tables: { лист: { shape: 'single', columns: [{ key: 'скрытность', label: 'Скрытность', kind: 'number', roll: { label: 'Проверка: Скрытность' } }] } , тяжёлый: { shape: 'book', use: 'item', label: 'Тяжёлый доспех', columns: [], bindings: [] } },
        roll_edits: { помеха: { label: 'Помеха', ops: [{ op: 'addDie' }] } },
        
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
    fireEvent.click(screen.getByText('+ правка вызова'));

    const kind = useWorld.getState().system.tables!['тяжёлый']!;
    expect(kind.modifiers).toHaveLength(1);
    expect(kind.modifiers![0]).toMatchObject({ kind: 'edit', call: 'roll', param: 'edits', edit: 'помеха' });
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
        tables: {
          weapon: {
            shape: 'book', use: 'item', label: 'Оружие', block: 'Снаряжение',
            columns: [
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
    fireEvent.click(screen.getByRole('button', { name: 'Кость урона' }));
    expect(screen.getByText('уходит в кнопку «Удар»')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Вес' }));
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
        tables: {
          weapon: { shape: 'book', use: 'item', label: 'Оружие', columns: [{ key: 'вес', label: 'Вес', kind: 'number' }], bindings: [] },
        },
      },
      activeRecordKind: 'weapon',
    }));
  });

  it('по умолчанию свойство на листе; «служебное» пишет onSheet: false, обратно — убирает ключ', () => {
    render(<RecordsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Вес' }));
    fireEvent.click(screen.getByText('ещё'));
    const where = screen.getByDisplayValue('на лист — игрок видит') as HTMLSelectElement;
    fireEvent.change(where, { target: { value: 'service' } });
    expect(useWorld.getState().system.tables!.weapon!.columns![0]!.onSheet).toBe(false);
    fireEvent.change(where, { target: { value: 'sheet' } });
    expect('onSheet' in useWorld.getState().system.tables!.weapon!.columns![0]!).toBe(false);
  });

  it('среди видов свойства есть «запись»', () => {
    render(<RecordsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Вес' }));
    const kind = screen.getByDisplayValue('число') as HTMLSelectElement;
    expect([...kind.options].map(o => o.textContent)).toContain('запись');
  });
});

describe('слот привязки подсказывает то, чем его закрывают', () => {
  const система = () => ({
    constants: {},
    tables: { лист: { shape: 'single', columns: [
      { key: 'atl', label: 'Атлетика', kind: 'number' },
      { key: 'atl_prof', label: 'Владение: Атлетика', kind: 'number' },
    ] },
      damage_types: {
        label: 'Типы урона', key: 'word',
        rows: [{ value: 'рубящий', label: 'рубящий' }, { value: 'некротический', label: 'некротический' }],
      },
      wield_attack: {
        label: 'Бонус атаки по тому, чем бьют', key: 'word',
        columns: [{ key: 'value', label: 'формула', kind: 'expr' }], rows: [],
      },
     weapon: {
        shape: 'book', use: 'item', label: 'Оружие',
        columns: [{ key: 'wield', label: 'Чем бьют', kind: 'text' }],
        bindings: [{ label: 'Удар', effect: 'hit', args: {} }],
      } },
    effects: {
      hit: {
        label: 'Удар', activation: 'manual', steps: [],
        params: [
          { key: 'damage_type', label: 'Тип урона', kind: 'choice', from: 'damage_types' },
          { key: 'attack_with', label: 'Бонус атаки', kind: 'number' },
        ],
      },
    },
    
  });

  beforeEach(() => {
    useWorld.setState(state => ({ ...state, system: { ...state.system, ...система() }, activeRecordKind: 'weapon' }));
  });

  it('свойства записи и таблицы предлагаются, а не только поля', () => {
    render(<RecordsTab />);
    const видно = набрать('Бонус атаки', 'чем');
    expect(видно.some(t => t.includes('Чем бьют')), видно.join(' | ')).toBe(true);
    expect(видно.some(t => t.includes('Бонус атаки по тому, чем бьют'))).toBe(true);
  });

  it('совпавшее с начала стоит выше спрятанного в середине слова', () => {
    render(<RecordsTab />);
    const видно = набрать('Бонус атаки', 'Чем');
    const начало = видно.findIndex(t => t.includes('Чем бьют'));
    const середина = видно.findIndex(t => t.includes('по тому, чем бьют'));
    expect(начало, видно.join(' | ')).toBeGreaterThanOrEqual(0);
    expect(начало).toBeLessThan(середина === -1 ? Number.MAX_SAFE_INTEGER : середина);
  });

  it('вход «строка таблицы» — список: свойство, «+ свойство», строки таблицы', () => {
    render(<RecordsTab />);
    const список = screen.getByLabelText('«Тип урона» — чем заполняет тип') as HTMLSelectElement;
    const варианты = [...список.options].map(o => o.textContent);
    expect(варианты).toContain('+ свойство «Тип урона»');
    expect(варианты).toContain('рубящий');

    fireEvent.change(список, { target: { value: '"рубящий"' } });
    expect((useWorld.getState().system.tables!.weapon!.bindings![0] as any).args?.damage_type).toEqual({ expr: '"рубящий"' });

    fireEvent.change(список, { target: { value: '+' } });
    const kind = useWorld.getState().system.tables!.weapon!;
    const свойство = kind.columns!.find(p => p.label === 'Тип урона')!;
    expect(свойство.kind).toBe('choice');
    expect(свойство.from).toBe('damage_types');
    expect(свойство.key).toBe('damage_type');
  });

  it('формула: «Способ · колонка» + 1 пишется как есть', () => {
    render(<RecordsTab />);
    const поле = строкаВхода('Бонус атаки').querySelector('input.chips__text') as HTMLInputElement;
    fireEvent.focus(поле);
    fireEvent.change(поле, { target: { value: '@wield + 1' } });
    fireEvent.keyDown(поле, { key: 'Enter' });
    expect((useWorld.getState().system.tables!.weapon!.bindings![0] as any).args?.attack_with).toEqual({ expr: '@wield + 1' });
  });
});
