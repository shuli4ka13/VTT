// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderOpen } from '../../../testing/render-open.tsx';
import { RulesTab } from './rules-tab.tsx';
import { FormulaBar } from '../../../ui/formula-bar.tsx';
import { useFormulaBar } from '../../../store/formula-bar.ts';
import { useWorld, emptySystem } from '../../../store/world.ts';

const открыть = (раздел: string) => fireEvent.click(screen.getByText(раздел));

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
    открыть('Кости');
    fireEvent.click(screen.getByText('Переброс кости и выбор лучшего/худшего броска'));

    const edits = useWorld.getState().system.roll_edits ?? {};
    expect(edits.advantage?.canceledBy).toBe('disadvantage');
    expect(edits.disadvantage?.canceledBy).toBe('advantage');
    expect(edits.advantage?.ops).toEqual([{ op: 'addDie' }, { op: 'keepBest', n: 1 }]);
    expect(screen.getByText('Кинуть на кость больше, оставить лучшую.')).toBeTruthy();
    expect(screen.getByText(/Гасится: Помеха\./)).toBeTruthy();
  });

  it('справочник не затирает запись, которую автор уже завёл под тем же ключом', () => {
    useWorld.setState(state => ({
      ...state,
      system: { ...emptySystem(), roll_edits: { advantage: { label: 'Своё преимущество', ops: [{ op: 'addDie' }] } } },
      activeEffectId: null,
    }));
    renderOpen(<RulesTab />);
    открыть('Кости');
    fireEvent.click(screen.getByText('Переброс кости и выбор лучшего/худшего броска'));

    const edits = useWorld.getState().system.roll_edits ?? {};
    expect(edits.advantage?.label).toBe('Своё преимущество');
    expect(edits.disadvantage?.label).toBe('Помеха');
  });

  it('кость заводится и попадает в словарь системы', () => {
    renderOpen(<RulesTab />);
    открыть('Кости');
    fireEvent.click(screen.getByText('+ кость'));
    const dies = Object.values(useWorld.getState().system.constants ?? {});
    expect(dies.some(c => c.kind === 'die')).toBe(true);
  });

  it('«+ ещё часть» превращает бросок в составной и просит имена частей', () => {
    renderOpen(<RulesTab />);
    открыть('Кости');
    fireEvent.click(screen.getByText('+ кость'));
    fireEvent.click(screen.getByText('+ ещё часть'));

    const die = Object.values(useWorld.getState().system.constants ?? {})[0];
    expect(die?.dice).toHaveLength(2);

    expect(screen.getAllByPlaceholderText('как зовётся эта часть')).toHaveLength(2);

    const [first] = screen.getAllByPlaceholderText('как зовётся эта часть');
    fireEvent.change(first!, { target: { value: 'Надежда' } });
    expect(Object.values(useWorld.getState().system.constants ?? {})[0]?.dice?.[0])
      .toEqual({ count: 1, sides: 20, name: 'надежда', label: 'Надежда' });
  });

  it('счёт костей берётся из поля листа кнопкой, а не решёткой в тексте', () => {
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
    открыть('Кости');
    fireEvent.click(screen.getByText('из поля'));

    expect(Object.values(useWorld.getState().system.constants ?? {})[0]?.dice?.[0])
      .toEqual({ count: { expr: '@пул' }, sides: 6 });
    expect(screen.getByText(/по числу «Пул»/)).toBeTruthy();
  });

  it('без числовых полей кнопка «из поля» заблокирована', () => {
    renderOpen(<RulesTab />);
    открыть('Кости');
    fireEvent.click(screen.getByText('+ кость'));
    const button = screen.getByText('из поля').closest('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('чтение кости выбирается селектом; сумма в данных не оседает', () => {
    renderOpen(<RulesTab />);
    открыть('Кости');
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

  it('у одной кости чтение не спрашивают — селектора нет', () => {
    renderOpen(<RulesTab />);
    открыть('Кости');
    fireEvent.click(screen.getByText('+ кость'));
    expect(screen.queryByDisplayValue('сумма')).toBe(null);

    fireEvent.click(screen.getByText('+ ещё часть'));
    expect(screen.getByDisplayValue('сумма')).toBeTruthy();
  });

  it('правка броска заводится со своим именем и набором примитивов', () => {
    renderOpen(<RulesTab />);
    открыть('Правки броска');
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
    открыть('Кости');
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
    открыть('Кости');
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

  it('палитра правок — готовые фразы, включая оба направления взрыва', () => {
    renderOpen(<RulesTab />);
    открыть('Правки броска');
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
    открыть('Правки броска');
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
    открыть('Правки броска');

    const part = document.querySelector('.chip__part') as HTMLSelectElement;
    expect(part, 'части есть — селектор появился').toBeTruthy();
    expect([...part.options].map(o => o.textContent))
      .toEqual(['всему броску', 'Надежда', 'Страх']);

    fireEvent.change(part, { target: { value: 'hope' } });
    expect(useWorld.getState().system.roll_edits!.вдох!.ops[0]).toEqual({ op: 'addDie', part: 'hope' });

    const phrase = part.closest('.dict-block')!.querySelector('.readback')!.textContent;
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
    открыть('Правки броска');

    const [cancel] = screen.getAllByDisplayValue('— ничем, складывается —') as HTMLSelectElement[];
    fireEvent.change(cancel!, { target: { value: 'down' } });

    const edits = useWorld.getState().system.roll_edits!;
    expect(edits.up!.canceledBy).toBe('down');
    expect(edits.down!.canceledBy).toBe('up');
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
    открыть('Правки броска');

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
        rolls: [{ tag: 'attack_roll', label: 'Бросок атаки' }],
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
    открыть('Правки броска');
    const guarded = screen.getByTitle('правка используется эффектом') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });

  it('таблица по диапазонам заводится в словарь системы', () => {
    renderOpen(<RulesTab />);
    открыть('Таблицы');
    fireEvent.click(screen.getByText('+ таблица'));
    const tables = Object.values(useWorld.getState().system.tables ?? {});
    expect(tables.length).toBe(1);
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
    открыть('Кости');

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
    открыть('Кости');
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

  it('таблица как лист: ключ без подписи, формула правится в строке формул, колонку можно растянуть', () => {
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
    expect(screen.queryByText(/подпись/i)).toBeNull();
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

  it('броня «порог» ложится в вызываемый эффект урона после подтверждения', () => {
    renderOpen(<RulesTab />);
    открыть('Быстрые настройки');
    const armor = [...document.querySelectorAll('select')].find(el => [...el.options].some(o => o.value === 'броня'))!;
    fireEvent.change(armor, { target: { value: 'броня' } });
    const hp = [...document.querySelectorAll('select')].filter(el => [...el.options].some(o => o.value === 'хиты')).at(-1)!;
    fireEvent.change(hp, { target: { value: 'хиты' } });
    fireEvent.click(screen.getByText('порог'));
    fireEvent.click(screen.getByText('Записать'));
    const tail = useWorld.getState().system.effects?.урон?.steps ?? [];
    expect(tail.map(s => s.type)).toEqual(['check', 'apply']);
    expect((tail[0] as { successWhen?: string }).successWhen).toBe('over');
    expect((tail[0] as { versus?: { expr?: string } }).versus?.expr).toBe('@лист.броня');
  });
});
