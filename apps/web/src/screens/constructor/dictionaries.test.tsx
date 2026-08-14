// apps/web/src/screens/constructor/dictionaries.test.tsx
// @vitest-environment jsdom
//
// Словари переехали из фолда на вкладке «Эффекты» в свою вкладку
// (задача 8, дом словарей) — тесты теперь рендерят DictionariesTab
// напрямую, без клика по фолду, которого больше нет.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictionariesTab } from './dictionaries.tsx';
import { useWorld, emptySystem } from '../../store/world.ts';

describe('Словари: кости, виды бросков, таблицы, цена действий', () => {
  beforeEach(() => {
    useWorld.setState(state => ({
      ...state,
      system: emptySystem(),
      activeEffectId: null,
    }));
  });

  it('кость заводится и попадает в словарь системы', () => {
    render(<DictionariesTab />);
    fireEvent.click(screen.getByText('+ кость'));
    const dies = Object.values(useWorld.getState().system.constants ?? {});
    expect(dies.some(c => c.kind === 'die')).toBe(true);
  });

  // Чтение — вторая ось кости (спека «Что такое бросок»): сумма — умолчание
  // и в данных не пишется; счёт успехов приносит порог на кость.
  it('чтение кости выбирается селектом; сумма в данных не оседает', () => {
    render(<DictionariesTab />);
    fireEvent.click(screen.getByText('+ кость'));
    const [key] = Object.keys(useWorld.getState().system.constants ?? {});

    // Сперва состав из нескольких костей: у одной кости выбирать нечего.
    const notation = screen.getByPlaceholderText('1d20') as HTMLInputElement;
    fireEvent.change(notation, { target: { value: '4d6' } });
    fireEvent.keyDown(notation, { key: 'Enter' });

    const select = screen.getByDisplayValue('сумма') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'best' } });
    expect(useWorld.getState().system.constants?.[key!]?.read).toBe('best');

    fireEvent.change(select, { target: { value: 'count' } });
    expect(useWorld.getState().system.constants?.[key!]?.read)
      .toEqual({ kind: 'count', atLeast: 5 });

    fireEvent.change(select, { target: { value: 'sum' } });
    expect('read' in (useWorld.getState().system.constants?.[key!] ?? {})).toBe(false);
  });

  // «Кинуть 1d20 и взять лучшую» — бессмыслица, которую экран показывал.
  // Выбор из одной кости не выбор, поэтому селектора нет вовсе: контрол
  // с единственным пунктом обещает выбор, которого не существует.
  it('у одной кости чтение не спрашивают — селектора нет', () => {
    render(<DictionariesTab />);
    fireEvent.click(screen.getByText('+ кость'));
    expect(screen.queryByDisplayValue('сумма')).toBe(null);

    // Стало костей больше — вопрос появился.
    const notation = screen.getByPlaceholderText('1d20') as HTMLInputElement;
    fireEvent.change(notation, { target: { value: '4d6' } });
    fireEvent.keyDown(notation, { key: 'Enter' });
    expect(screen.getByDisplayValue('сумма')).toBeTruthy();
  });

  // Поле было управляемым и откатывало onChange на любой промежуточной строке
  // («1», «1d» — ни одна не разбирается как NdM), поэтому с клавиатуры набрать
  // «1d8» было нельзя, только вставить целиком. Печатаем посимвольно и
  // проверяем, что каждая промежуточная строка остаётся в поле.
  it('нотация кости набирается посимвольно — промежуточный ввод не откатывается', () => {
    render(<DictionariesTab />);
    fireEvent.click(screen.getByText('+ кость'));
    const input = screen.getByPlaceholderText('1d20') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '1' } });
    expect(input.value).toBe('1');
    fireEvent.change(input, { target: { value: '1d' } });
    expect(input.value).toBe('1d');
    fireEvent.change(input, { target: { value: '1d8' } });
    expect(input.value).toBe('1d8');

    fireEvent.keyDown(input, { key: 'Enter' });
    const dies = Object.values(useWorld.getState().system.constants ?? {});
    expect(dies[0]?.dice).toEqual([{ count: 1, sides: 8 }]);
  });

  it('неразобранная запись остаётся в поле и показывается как ошибка, а не отбрасывается молча', () => {
    render(<DictionariesTab />);
    fireEvent.click(screen.getByText('+ кость'));
    const input = screen.getByPlaceholderText('1d20') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);

    expect(input.value).toBe('abc');
    expect(screen.getByText(/не разобрать/)).toBeTruthy();
    const dies = Object.values(useWorld.getState().system.constants ?? {});
    expect(dies[0]?.dice).toEqual([{ count: 1, sides: 20 }]);
  });

  // Тег рождается заготовкой («бросок»), но пока запись не встретилась
  // нигде в мире — следует за лейблом при наборе (тот же приём, что и у
  // тега поля в sheet-tab.tsx). Реальный ввод в Input, не прямая правка стора.
  it('вид броска заводится с тегом из названия', () => {
    render(<DictionariesTab />);
    fireEvent.click(screen.getByText('+ вид'));
    const input = screen.getByPlaceholderText('название броска');
    fireEvent.change(input, { target: { value: 'Бросок защиты' } });
    const rolls = useWorld.getState().system.rolls ?? [];
    expect(rolls[0]).toEqual({ tag: 'бросок_защиты', label: 'Бросок защиты' });
  });

  // Правки броска: механику именует АВТОР. Ни «преимущества», ни «помехи»
  // в коде нет — есть пустая запись, которую автор называет и собирает.
  it('правка броска заводится со своим именем и набором примитивов', () => {
    render(<DictionariesTab />);
    fireEvent.click(screen.getByText('+ правка'));

    const name = screen.getByPlaceholderText('как это зовётся в вашем мире');
    fireEvent.change(name, { target: { value: 'Фора' } });

    const [add] = screen.getAllByDisplayValue('+ добавить…') as HTMLSelectElement[];
    fireEvent.change(add!, { target: { value: 'addDie' } });
    fireEvent.change(screen.getAllByDisplayValue('+ добавить…')[0]!, { target: { value: 'keepBest' } });

    const edits = useWorld.getState().system.roll_edits!;
    expect(Object.keys(edits)).toEqual(['фора']);
    expect(edits['фора']).toEqual({
      label: 'Фора', ops: [{ op: 'addDie' }, { op: 'keepBest', n: 1 }],
    });
  });

  // Правило подачи: примитив — готовая фраза в списке, а не объект
  // с настройками внутри. Взрыв вверх и вниз — два пункта, ноль выпадашек.
  it('палитра правок — готовые фразы, включая оба направления взрыва', () => {
    render(<DictionariesTab />);
    fireEvent.click(screen.getByText('+ правка'));
    const [add] = screen.getAllByDisplayValue('+ добавить…') as HTMLSelectElement[];
    const options = [...add!.options].map(o => o.textContent);
    expect(options).toContain('взрывать на максимуме');
    expect(options).toContain('взрывать на единице');
    expect(options).toContain('сдвинуть степень успеха');
  });

  // Часть составного броска спрашивается ТОЛЬКО там, где части есть.
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
    render(<DictionariesTab />);
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
    render(<DictionariesTab />);

    const part = document.querySelector('.chip__part') as HTMLSelectElement;
    expect(part, 'части есть — селектор появился').toBeTruthy();
    expect([...part.options].map(o => o.textContent))
      .toEqual(['всему броску', 'Надежда', 'Страх']);

    fireEvent.change(part, { target: { value: 'hope' } });
    expect(useWorld.getState().system.roll_edits!.вдох!.ops[0]).toEqual({ op: 'addDie', part: 'hope' });
    // И пересказ немедленно говорит, чему именно достанется кость.
    // Пересказ именно этой записи, а не кости выше по экрану.
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
    render(<DictionariesTab />);

    const [cancel] = screen.getAllByDisplayValue('— ничем, складывается —') as HTMLSelectElement[];
    fireEvent.change(cancel!, { target: { value: 'down' } });

    // Гашение взаимно, и говорится об этом ОДИН раз: вторая запись
    // получает встречную ссылку сама. Два поля про одно и то же — это
    // ровно та стена настроек «что с чем», от которой ушли.
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
    render(<DictionariesTab />);

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
            modifiers: [{ kind: 'roll', target: 'attack_roll', edit: 'up', condition: null }],
          },
        },
      },
      activeEffectId: null,
    }));
    render(<DictionariesTab />);
    const guarded = screen.getByTitle('правка используется эффектом') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });

  it('таблица по диапазонам заводится в словарь системы', () => {
    render(<DictionariesTab />);
    fireEvent.click(screen.getByText('+ таблица'));
    const tables = Object.values(useWorld.getState().system.tables ?? {});
    expect(tables.length).toBe(1);
  });

  // Смена ключа была delete+insert — запись уезжала в конец объекта,
  // а строки рисовались по index. При двух и более костях после
  // переименования первой фокус-строка визуально становилась второй,
  // и дальнейший набор правил уже не ту кость. Проверяем на данных стора:
  // порядок и содержимое второй записи не тронуты переименованием первой.
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
    render(<DictionariesTab />);

    const first = screen.getByDisplayValue('Кость А');
    fireEvent.change(first, { target: { value: 'Секира' } });

    const constants = useWorld.getState().system.constants!;
    expect(Object.keys(constants)).toEqual(['секира', 'dieB']);
    expect(constants.dieB).toEqual({ label: 'Кость Б', kind: 'die', dice: [{ count: 1, sides: 6 }] });
    expect(constants['секира']).toEqual({ label: 'Секира', kind: 'die', dice: [{ count: 1, sides: 20 }] });
  });

  // Гарды удаления были покрыты только для таблицы и типа действия —
  // кость и мишень бросков сторожатся тем же usedIn, но своего теста
  // не имели.
  it('кость, на которую ссылается бросок в эффекте, удалить нельзя', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        constants: { lead: { label: 'Ведущая кость', kind: 'die', dice: [{ count: 1, sides: 20 }] } },
        effects: {
          hit: {
            label: 'Удар', activation: 'manual', params: [],
            steps: [{ type: 'threshold', roll: { die: { constant: 'lead' }, check: null } }],
          },
        },
      },
      activeEffectId: null,
    }));
    render(<DictionariesTab />);
    const guarded = screen.getByTitle('кость используется') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });

  it('вид броска, на который ссылается эффект, удалить нельзя', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        rolls: [{ tag: 'attack_roll', label: 'Бросок атаки' }],
        effects: {
          hit: {
            label: 'Удар', activation: 'manual', params: [],
            steps: [{ type: 'threshold', roll: { die: undefined, check: 'attack_roll' } }],
          },
        },
      },
      activeEffectId: null,
    }));
    render(<DictionariesTab />);
    const guarded = screen.getByTitle('этот вид броска используется') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });

  // usedIn сканировал только {system}, но roll-модификатор (kind: 'roll')
  // бывает и у предмета компендиума — сторож должен видеть его тоже,
  // иначе мишень, на которую смотрит вещь, можно было убрать у неё
  // из-под ног.
  it('вид броска, на который смотрит модификатор предмета, удалить нельзя', () => {
    useWorld.setState(state => ({
      ...state,
      system: { ...emptySystem(), rolls: [{ tag: 'attack_roll', label: 'Бросок атаки' }] },
      compendium: {
        items: [{
          id: 'lucky-charm', label: 'Талисман удачи',
          modifiers: [{ kind: 'roll', target: 'attack_roll', edit: 'advantage' }],
        }],
        actions: [],
      },
      activeEffectId: null,
    }));
    render(<DictionariesTab />);
    const guarded = screen.getByTitle('этот вид броска используется') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });

  it('таблицу, на которую ссылается поле, удалить нельзя', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        tables: { proficiency: { label: 'Бонус мастерства', ranges: [{ from: 1, to: 4, value: 2 }] } },
        fields: [{ tag: 'pb', label: 'Бонус мастерства', value: { kind: 'table', table: 'proficiency', arg: '#level' } }],
      },
      activeEffectId: null,
    }));
    render(<DictionariesTab />);
    const guarded = screen.getByTitle('таблица используется') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });

  it('тип действия заводится в словарь системы', () => {
    render(<DictionariesTab />);
    fireEvent.click(screen.getByText('+ тип'));
    const types = Object.values(useWorld.getState().system.action_types ?? {});
    expect(types.length).toBe(1);
  });

  it('тип действия, которым платит эффект, удалить нельзя', () => {
    useWorld.setState(state => ({
      ...state,
      system: {
        ...emptySystem(),
        action_types: { action: { label: 'Действие' } },
        effects: { strike: { label: 'Атака', activation: 'manual', cost: 'action', params: [], steps: [] } },
      },
      activeEffectId: null,
    }));
    render(<DictionariesTab />);
    const guarded = screen.getByTitle('тип используется') as HTMLButtonElement;
    expect(guarded.disabled).toBe(true);
  });
});
