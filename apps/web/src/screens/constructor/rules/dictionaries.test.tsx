// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderOpen } from '../../../testing/render-open.tsx';
import { RulesTab } from './rules-tab.tsx';
import { FormulaBar } from '../../../ui/formula-bar.tsx';
import { useFormulaBar } from '../../../store/formula-bar.ts';
import { useWorld, emptySystem } from '../../../store/world.ts';

const открыть = (раздел: string) => fireEvent.click(screen.getAllByText(раздел)[0]!);

describe('Словари: кости, правки броска, таблицы', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: emptySystem(),
      activeEffectId: null,
    }));
  });

  it('«+ из справочника» кладёт в словарь готовую пару: преимущество и помеха гасят друг друга', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('Переброс кости и выбор лучшего/худшего броска'));

    const edits = useWorld.getState().system.roll_edits ?? {};
    expect(edits.advantage?.canceledBy).toBe('disadvantage');
    expect(edits.disadvantage?.canceledBy).toBe('advantage');
    expect(edits.advantage?.ops).toEqual([{ op: 'addDie' }, { op: 'keepBest', n: 1 }]);
    expect(screen.getByText('Кинуть на кость больше, оставить лучшую.')).toBeTruthy();
    expect(screen.getByText(/«Преимущество» ⟷ «Помеха»/)).toBeTruthy();
  });

  it('справочник не затирает запись, которую автор уже завёл под тем же ключом', () => {
    useWorld.setState(state => ({
      ...state,
      system: { ...emptySystem(), roll_edits: { advantage: { label: 'Своё преимущество', ops: [{ op: 'addDie' }] } } },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('Переброс кости и выбор лучшего/худшего броска'));

    const edits = useWorld.getState().system.roll_edits ?? {};
    expect(edits.advantage?.label).toBe('Своё преимущество');
    expect(edits.disadvantage?.label).toBe('Помеха');
  });

  it('кость заводится и попадает в словарь системы', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('+ кость'));
    const dies = Object.values(useWorld.getState().system.constants ?? {});
    expect(dies.some(c => c.kind === 'die')).toBe(true);
  });

  it('«+ ещё часть» превращает бросок в составной и просит имена частей', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('+ кость'));
    fireEvent.click(screen.getByText('+ ещё часть'));

    const die = Object.values(useWorld.getState().system.constants ?? {})[0];
    expect(die?.dice).toHaveLength(2);

    expect(screen.getAllByPlaceholderText('как зовётся эта часть')).toHaveLength(2);

    const [first] = screen.getAllByPlaceholderText('как зовётся эта часть');
    fireEvent.change(first!, { target: { value: 'Надежда' } });
    expect(Object.values(useWorld.getState().system.constants ?? {})[0]?.dice?.[0])
      .toEqual({ sides: 20, name: 'надежда', label: 'Надежда' });
  });

  it('поле «сколько»: единица и пустое поле снимают ключ — умолчание в данные не пишется', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('+ кость'));
    const dice = () => Object.values(useWorld.getState().system.constants ?? {})[0]!.dice!;
    expect(dice()).toEqual([{ sides: 20 }]);

    fireEvent.click(screen.getByText('+ ещё часть'));
    expect(dice()[1]).toEqual({ sides: 20 });

    const [count] = screen.getAllByPlaceholderText('сколько');
    fireEvent.change(count!, { target: { value: '3' } });
    expect(dice()[0]!.count).toBe(3);
    fireEvent.change(count!, { target: { value: '1' } });
    expect('count' in dice()[0]!).toBe(false);

    fireEvent.change(count!, { target: { value: '2' } });
    expect(dice()[0]!.count).toBe(2);
    fireEvent.change(count!, { target: { value: '' } });
    expect('count' in dice()[0]!).toBe(false);
  });

  it('счёт костей — число или формула в одном поле: @пул берёт число из листа', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [{ key: 'пул', label: 'Пул', kind: 'number', default: 6 }] } },
        constants: { d: { label: 'Пул', kind: 'die', dice: [{ count: 1, sides: 6 }] } },
      },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.change(screen.getByPlaceholderText('сколько'), { target: { value: '@пул' } });

    expect(Object.values(useWorld.getState().system.constants ?? {})[0]?.dice?.[0])
      .toEqual({ count: { expr: '@пул' }, sides: 6 });
    expect(screen.getByText(/по числу «Пул»/)).toBeTruthy();
  });

  it('чтение кости выбирается селектом; сумма в данных не оседает', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('+ кость'));
    const [key] = Object.keys(useWorld.getState().system.constants ?? {});

    fireEvent.click(screen.getByText('+ ещё часть'));

    const select = screen.getByDisplayValue('сумма') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'best' } });
    expect(useWorld.getState().system.constants?.[key!]?.read).toBe('best');

    fireEvent.change(select, { target: { value: 'count' } });
    expect(useWorld.getState().system.constants?.[key!]?.read)
      .toEqual({ kind: 'count', atLeast: 19 }, 'порог предлагается «почти максимум» по граням кости');

    fireEvent.change(select, { target: { value: 'sum' } });
    expect('read' in (useWorld.getState().system.constants?.[key!] ?? {})).toBe(false);
  });

  it('у одной кости чтение спрятано под свёрнутым «ещё», у составной — на виду', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('+ кость'));
    expect((screen.getByDisplayValue('сумма').closest('details') as HTMLDetailsElement | null)?.open).toBe(false);

    fireEvent.click(screen.getByText('+ ещё часть'));
    expect(screen.getByDisplayValue('сумма')).toBeTruthy();
  });

  it('правка броска заводится со своим именем и набором примитивов', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('+ правка'));

    const name = screen.getByPlaceholderText('как это зовётся в вашем мире');
    fireEvent.change(name, { target: { value: 'Фора' } });

    const [add] = screen.getAllByDisplayValue('+ добавить…') as HTMLSelectElement[];
    fireEvent.change(add!, { target: { value: 'addDie' } });
    fireEvent.change(screen.getAllByDisplayValue('+ добавить…')[0]!, { target: { value: 'keepBest' } });

    const edits = useWorld.getState().system.roll_edits!;
    const [key] = Object.keys(edits);
    expect(edits[key!]).toEqual({
      label: 'Фора', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }],
    });
  });

  it('название из нескольких слов набирается целиком, ключ не меняется', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('+ кость'));
    const [ключ] = Object.keys(useWorld.getState().system.constants ?? {});
    const name = screen.getByPlaceholderText('название кости');

    for (const шаг of ['Ведущая', 'Ведущая ', 'Ведущая кость', 'Ведущая кость ', 'Ведущая кость проверки']) {
      fireEvent.change(name, { target: { value: шаг } });
    }

    const constants = useWorld.getState().system.constants!;
    expect(Object.keys(constants)).toEqual([ключ]);
    expect(constants[ключ!]!.label).toBe('Ведущая кость проверки');
  });

  it('грани кости: стёр «20», набрал «100» — кость стала к100', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('+ кость'));
    const term = document.querySelector('.dice-term')!;
    const [, sides] = [...term.querySelectorAll('input')] as HTMLInputElement[];

    fireEvent.change(sides!, { target: { value: '' } });
    expect(sides!.value).toBe('', 'пустота живёт, пока набирают');
    fireEvent.change(sides!, { target: { value: '100' } });
    fireEvent.blur(sides!);

    const [key] = Object.keys(useWorld.getState().system.constants ?? {});
    expect(useWorld.getState().system.constants![key!]!.dice![0]!.sides).toBe(100);
  });

  it('«прибавить к итогу» — формула с костью: слово кладёт прибавку, а не кость в набор', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('+ правка'));
    fireEvent.change(screen.getAllByDisplayValue('+ добавить…')[0]!, { target: { value: 'plus' } });

    const edits = useWorld.getState().system.roll_edits!;
    const [key] = Object.keys(edits);
    expect(edits[key!]!.ops).toEqual([{ op: 'plus', value: { expr: 'кинуть(к6)' } }]);
    expect(screen.getByText('Прибавить к6.')).toBeTruthy();
  });

  it('палитра правок — готовые фразы, включая оба направления взрыва', () => {
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByText('+ правка'));
    const [add] = screen.getAllByDisplayValue('+ добавить…') as HTMLSelectElement[];
    const options = [...add!.options].map(o => o.textContent);
    expect(options).toContain('взрывать на максимуме');
    expect(options).toContain('взрывать на единице');
    expect(options).toContain('сдвинуть степень успеха');
  });

  it('в мире с одной костью про части не спрашивают вовсе', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        constants: { lead: { label: 'к20', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
        roll_edits: { фора: { label: 'Фора', ops: [{ op: 'addDie' }] } },
      },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Броски');
    expect(document.querySelectorAll('.chip__part').length).toBe(0);
  });

  it('в мире с составной костью часть выбирается прямо на фишке', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        constants: {
          duality: {
            label: 'Кости дуальности', kind: 'die',
            dice: [
              { count: 1, sides: 12, name: 'hope', label: 'Надежда' },
              { count: 1, sides: 12, name: 'fear', label: 'Страх' },
            ],
          },
        },
        roll_edits: { вдох: { label: 'Вдохновение', ops: [{ op: 'addDie' }] } },
      },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Броски');

    const part = document.querySelector('.chip__part') as HTMLSelectElement;
    expect(part, 'части есть — селектор появился').toBeTruthy();
    expect([...part.options].map(o => o.textContent))
      .toEqual(['всему броску', 'Надежда', 'Страх']);

    fireEvent.change(part, { target: { value: 'hope' } });
    expect(useWorld.getState().system.roll_edits!.вдох!.ops[0]).toEqual({ op: 'addDie', part: 'hope' });

    const phrase = part.closest('.dict-block')!.querySelector('.roll-word__said')!.textContent;
    expect(phrase).toBe('Кинуть на кость больше (Надежда).');
  });

  it('«гасится» ссылается на другую правку — закон гашения это данные', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        roll_edits: {
          up: { label: 'Фора', ops: [{ op: 'addDie' }] },
          down: { label: 'Подножка', ops: [{ op: 'addDie' }] },
        },
      },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Броски');

    fireEvent.change(screen.getByDisplayValue('+ пара…'), { target: { value: 'up\u0000down' } });

    const edits = useWorld.getState().system.roll_edits!;
    expect(edits.up!.canceledBy).toBe('down');
    expect(edits.down!.canceledBy).toBe('up');
  });

  it('пару «гасят друг друга» снимают с обеих сторон, даже если ссылка была односторонней', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        roll_edits: {
          a: { label: 'Фора', ops: [{ op: 'addDie' }] },
          z: { label: 'Подножка', ops: [{ op: 'addDie' }], canceledBy: 'a' },
        },
      },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Броски');
    fireEvent.click(screen.getByTitle('больше не гасят друг друга'));
    expect('canceledBy' in useWorld.getState().system.roll_edits!.z!).toBe(false);
  });

  it('удалённая правка забирает за собой встречную ссылку', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        roll_edits: {
          up: { label: 'Фора', ops: [{ op: 'addDie' }], canceledBy: 'down' },
          down: { label: 'Подножка', ops: [{ op: 'addDie' }], canceledBy: 'up' },
        },
      },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Броски');

    const [remove] = screen.getAllByText('Убрать') as HTMLButtonElement[];
    fireEvent.click(remove!);

    const edits = useWorld.getState().system.roll_edits!;
    expect(edits.up).toBeUndefined();
    expect('canceledBy' in edits.down!, 'ссылки в пустоту не остаётся').toBe(false);
  });

  it('правку, на которую ссылается эффект, удалить нельзя', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        roll_edits: { up: { label: 'Фора', ops: [{ op: 'addDie' }] } },
        effects: {
          lucky: {
            label: 'Везучий', activation: 'passive',
            modifiers: [{ kind: 'edit', call: 'roll', param: 'edits', edit: 'up' }],
          },
        },
      },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Броски');
    const guarded = screen.getByTitle('правка используется эффектом') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });

  it('таблица с ключом «число»: новая строка получает свободное число, а не 0', () => {
    useWorld.setState(state => ({ ...state, system: { ...emptySystem(), tables: { владение: { label: 'Владение', key: 'number', rows: [{ value: 0 }] } } } as never }));
    renderOpen(<RulesTab />);
    открыть('Таблицы');
    fireEvent.click(screen.getByText('Владение'));
    fireEvent.click(screen.getByText('+ строка'));
    fireEvent.click(screen.getByText('+ строка'));
    expect(useWorld.getState().system.tables!.владение!.rows!.map(r => r.value)).toEqual([0, 1, 2]);
  });

  it('таблица по диапазонам заводится в словарь системы', () => {
    renderOpen(<RulesTab />);
    открыть('Таблицы');
    fireEvent.click(screen.getByText('+ таблица'));
    const tables = Object.values(useWorld.getState().system.tables ?? {});
    expect(tables.length).toBe(1);
    expect(screen.getByPlaceholderText('как зовётся таблица')).toBeTruthy();
  });

  it('переименование первой кости не трогает вторую и не меняет порядок', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        constants: {
          dieA: { label: 'Кость А', kind: 'die', dice: [{ count: 1, sides: 20 }] },
          dieB: { label: 'Кость Б', kind: 'die', dice: [{ count: 1, sides: 6 }] },
        },
      },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Броски');

    const first = screen.getByDisplayValue('Кость А');
    fireEvent.change(first, { target: { value: 'Секира' } });

    const constants = useWorld.getState().system.constants!;
    expect(Object.keys(constants)).toEqual(['dieA', 'dieB']);
    expect(constants.dieB).toEqual({ label: 'Кость Б', kind: 'die', dice: [{ count: 1, sides: 6 }] });
    expect(constants.dieA).toEqual({ label: 'Секира', kind: 'die', dice: [{ count: 1, sides: 20 }] });
  });

  it('кость, на которую ссылается бросок в эффекте, удалить нельзя', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
        effects: {
          hit: {
            label: 'Удар', activation: 'manual', params: [],
            steps: [{ id: 'удар_бросок', type: 'roll', die: 'lead', by: { expr: '@действующий' } }],
          },
        },
      },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Броски');
    const guarded = screen.getByTitle('кость используется') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });

  it('таблицу, на которую ссылается поле, удалить нельзя', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [{ key: 'pb', label: 'Бонус мастерства', expr: { expr: 'таблица("proficiency", #level)' } }] }, proficiency: { label: 'Бонус мастерства', key: 'range',
          columns: [{ key: 'value', label: 'значение', kind: 'number' }], rows: [{ from: 1, to: 4, cells: { value: 2 } }] } },
      },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Таблицы');
    const guarded = screen.getByTitle('таблица используется') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });

  it('смена ключа на диапазоны не стирает строки молча — сначала вопрос', () => {
    useWorld.setState(state => ({
      ...state,
      system: { ...emptySystem(), tables: { типы: { label: 'Типы', key: 'word', rows: [{ value: 'огонь' }, { value: 'холод' }] } } },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Таблицы');
    fireEvent.click(screen.getAllByText('Типы').at(-1)!);
    const key = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'range'))!;
    fireEvent.change(key, { target: { value: 'range' } });
    expect(useWorld.getState().system.tables!.типы!.rows).toHaveLength(2);
    fireEvent.click(screen.getByText('сменить и стереть строки'));
    expect(useWorld.getState().system.tables!.типы!.key).toBe('range');
  });

  it('таблица как лист: у строки есть подпись, формула правится в строке формул, колонку можно растянуть', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [{ key: 'сила', label: 'Сила', kind: 'number' }] }, wield: {
          label: 'Способ атаки', key: 'word',
          columns: [{ key: 'attack', label: 'Бонус атаки', kind: 'number' }],
          rows: [{ value: 'ближний бой', cells: { attack: { expr: '@сила + 2' } } }],
        } },
      },
      activeEffectId: null,
    }));
    useFormulaBar.getState().dismiss();
    renderOpen(<><FormulaBar /><RulesTab /></>);
    открыть('Таблицы');
    fireEvent.click(screen.getAllByText('Способ атаки').at(-1)!);
    expect(screen.getByDisplayValue('ближний бой')).toBeTruthy();
    expect(document.querySelector('.formula-bar')).toBeNull();

    fireEvent.click(screen.getByTitle('@сила + 2'));
    const bar = document.querySelector('.formula-bar')!;
    expect(bar.textContent).toContain('Способ атаки · «ближний бой» · Бонус атаки');
    expect(document.querySelector('.formula-field--spot')).not.toBeNull();
    const tail = [...bar.querySelectorAll('input.chips__text')].at(-1) as HTMLInputElement;
    fireEvent.change(tail, { target: { value: ' + 3' } });
    expect(useWorld.getState().system.tables!.wield!.rows![0]!.cells!.attack).toEqual({ expr: '@сила + 3' });

    const grid = screen.getByLabelText('ширина колонки «Бонус атаки»').closest('.sheet-grid') as HTMLElement;
    const before = grid.style.gridTemplateColumns;
    act(() => {
      screen.getByLabelText('ширина колонки «Бонус атаки»').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 180 }));
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    expect(grid.style.gridTemplateColumns).not.toBe(before);
  });

});

describe('Быстрые настройки: крит и броня пишутся данными', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { лист: { shape: 'single', columns: [
          { key: 'хиты', label: 'Хиты', kind: 'number', default: 20 },
          { key: 'броня', label: 'Броня', kind: 'number', default: 5 },
        ] } },
        effects: { урон: { label: 'Урон', params: [{ key: 'сколько', label: 'Сколько', kind: 'number', role: 'amount' }], steps: [] } },
      },
      activeEffectId: null,
    }));
  });

  it('«взрывная кость» заводит правку и правило комнаты, «нет» убирает', () => {
    renderOpen(<RulesTab />);
    открыть('Быстрые настройки');
    fireEvent.click(screen.getByText('взрывная кость'));
    expect(useWorld.getState().system.grants).toContain('crit_explode_rule');
    expect(useWorld.getState().system.roll_edits?.crit_explode).toBeTruthy();
    fireEvent.click(screen.getByText('нет'));
    expect(useWorld.getState().system.grants ?? []).not.toContain('crit_explode_rule');
  });

  it('броня без входа-листа у эффекта урона ничего не пишет и говорит почему', () => {
    renderOpen(<RulesTab />);
    открыть('Быстрые настройки');
    fireEvent.click(screen.getByText('порог'));
    expect(screen.getByText(/нет входа-листа/)).toBeTruthy();
    expect(screen.queryByText('Записать')).toBeNull();
  });

  it('броня «порог» ложится в вызываемый эффект урона после подтверждения', () => {
    useWorld.getState().editSystem(draft => { draft.effects.урон!.params = [...(draft.effects.урон!.params ?? []), { key: 'лист', kind: 'sheet' } as never]; });
    renderOpen(<RulesTab />);
    открыть('Быстрые настройки');
    const armor = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'броня'))!;
    fireEvent.change(armor, { target: { value: 'броня' } });
    const hp = [...document.querySelectorAll('select')].filter(el => [...el.options].some(o => o.value === 'хиты')).at(-1)!;
    fireEvent.change(hp, { target: { value: 'хиты' } });
    fireEvent.click(screen.getByText('порог'));
    fireEvent.click(screen.getByText('Записать'));
    const tail = useWorld.getState().system.effects?.урон?.steps ?? [];
    expect(tail.map(s => s.type)).toEqual(['check', 'branch', 'stop', 'end', 'apply']);
    expect((tail[0] as { successWhen?: string }).successWhen).toBe('over');
    expect((tail[0] as { versus?: { expr?: string } }).versus?.expr).toBe('@лист.броня');
    expect(tail[1]).toEqual({ type: 'branch', if: { expr: `не @${String(tail[0]!.id)}.success` } });
    expect(tail[2]).toEqual({ type: 'stop', note: { expr: '"броня выдержала"' } });
  });
});
