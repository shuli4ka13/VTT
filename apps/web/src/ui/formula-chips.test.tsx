// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormulaChips, partsOf, joinParts } from './formula-chips.tsx';
import type { System } from '@vtt/schema';
import { withColumn } from '@vtt/engine/model/sheet-columns';

const system = {
  tables: { лист: { shape: 'single', columns: [
    { key: 'бонус_атаки', label: 'Бонус атаки', expr: { expr: '1' } },
    { key: 'сила', label: 'Сила', kind: 'number', default: 10 },
  ] } },
  constants: {}, effects: {},
} as unknown as System;

describe('partsOf / joinParts', () => {
  it('раскладывает текст и теги и собирает обратно без потерь', () => {
    const value = '1d20 + @бонус_атаки + 2';
    const parts = partsOf(value);
    expect(parts).toEqual([{ text: '1d20 + ' }, { tag: 'бонус_атаки' }, { text: ' + 2' }]);
    expect(joinParts(parts)).toBe(value);
  });

  it('пустая строка — один пустой текст', () => {
    expect(partsOf('')).toEqual([{ text: '' }]);
  });
});

describe('FormulaChips', () => {
  it('тег рисуется фишкой с человеческим названием, латиница не видна', () => {
    render(<FormulaChips value="1d20 + @бонус_атаки" system={system} onChange={() => {}} />);
    expect(screen.getByText('Бонус атаки')).toBeTruthy();
    expect(screen.queryByDisplayValue(/бонус_атаки/)).toBeNull();
  });

  it('набрал @бон — подсказка по названию, клик вставляет тег в данные', () => {
    let value = '1d20 + @бон';
    render(<FormulaChips value={value} system={system} onChange={next => { value = next; }} />);
    const input = screen.getByDisplayValue('1d20 + @бон') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(value.length, value.length);
    fireEvent.click(input);
    fireEvent.mouseDown(screen.getByText('Бонус атаки'));
    expect(value).toBe('1d20 + @бонус_атаки');
  });

  it('незнакомое имя остаётся текстом — подсказка успевает открыться', () => {
    render(<FormulaChips value="@сил" system={system} onChange={() => {}} />);
    expect(screen.queryByText('Сила'), 'фишки ещё нет').toBeNull();
    expect(screen.getByDisplayValue('@сил')).toBeTruthy();
  });

  it('имена «здесь же» стоят выше полей листа, а совпавшие с начала — выше вложенных', () => {
    const рядом = new Map([['damage_dice', 'Кость урона']]);
    const большая = withColumn(
      withColumn(system, { key: 'ловкость', label: 'Ловкость', kind: 'number', default: 10 }),
      { key: 'hit_die', label: 'Кость хитов', kind: 'number', default: 8 });

    render(<FormulaChips value="@кость" system={большая} extraNames={рядом} onChange={() => {}} />);
    const input = screen.getByDisplayValue('@кость') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(6, 6);
    fireEvent.click(input);

    const предложено = [...document.querySelectorAll('.slot__option')].map(o => o.textContent?.trim());
    expect(предложено).toEqual(['здесь жеКость урона', 'полеКость хитов', 'полеЛовкость']);
  });

  it('фишка с длинной подписью укорачивается, полное имя — в подсказке', () => {
    const рядом = new Map([['бросок', 'шаг 1 · Проверка — что выпало, без прибавок']]);
    render(<FormulaChips value="@бросок" system={system} extraNames={рядом} onChange={() => {}} />);
    const фишка = screen.getByText('шаг 1 · Проверка — что выпало');
    expect(фишка.getAttribute('title')).toBe('шаг 1 · Проверка — что выпало, без прибавок');
  });

  it('крестик на фишке убирает тег целиком', () => {
    let value = '1d20 + @бонус_атаки + 2';
    render(<FormulaChips value={value} system={system} onChange={next => { value = next; }} />);
    fireEvent.mouseDown(screen.getByLabelText('убрать поле'));
    expect(value).toBe('1d20 +  + 2');
  });

  it('калькулятор виден в фокусе и вставляет операцию в позицию курсора', () => {
    let value = '2 + 2';
    render(<FormulaChips value={value} system={system} calculator onChange={next => { value = next; }} />);
    expect(screen.queryByText('округлить вниз')).toBeNull();
    const input = screen.getByDisplayValue('2 + 2') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, 0);
    fireEvent.click(input);
    fireEvent.mouseDown(screen.getByText('округлить вниз'));
    expect(value).toBe('округлить вниз()2 + 2');
  });

  it('без флага calculator ряда операций нет и в фокусе', () => {
    render(<FormulaChips value="2 + 2" system={system} onChange={() => {}} />);
    const input = screen.getByDisplayValue('2 + 2') as HTMLInputElement;
    input.focus();
    fireEvent.click(input);
    expect(screen.queryByText('модуль')).toBeNull();
  });

  it('backspace в начале куска съедает фишку слева', () => {
    let value = '@сила + 2';
    render(<FormulaChips value={value} system={system} onChange={next => { value = next; }} />);
    const tail = screen.getAllByRole('textbox')[1] as HTMLInputElement;
    expect(tail.value).toBe(' + 2');
    tail.focus();
    tail.setSelectionRange(0, 0);
    fireEvent.keyDown(tail, { key: 'Backspace' });
    expect(value).toBe(' + 2');
  });
});

describe('ссылка на таблицу видна в формуле через точку', () => {
  const сКлассом = {
    tables: { лист: { shape: 'single', columns: [
      { key: 'класс', label: 'Класс', kind: 'choice', from: 'классы', default: 'воин' },
      { key: 'сила', label: 'Сила', kind: 'number', default: 10 },
    ] },
      классы: { label: 'Классы', key: 'word', columns: [{ key: 'кость', label: 'Кость хитов', kind: 'number' }], rows: [] },
    },
    constants: {}, effects: {},
  } as unknown as System;

  it('колонка таблицы стоит фишкой «Класс → Кость хитов»', () => {
    render(<FormulaChips value="@класс.кость + 1" system={сКлассом} onChange={() => {}} />);
    expect(screen.getByText('Класс → Кость хитов')).toBeTruthy();
  });

  it('набрал «@кость» — предлагается и колонка по ссылке', () => {
    let value = '@кость';
    render(<FormulaChips value={value} system={сКлассом} onChange={next => { value = next; }} />);
    const input = screen.getByDisplayValue('@кость') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(value.length, value.length);
    fireEvent.click(input);
    fireEvent.mouseDown(screen.getByText('Класс → Кость хитов'));
    expect(value).toBe('@класс.кость');
  });
});

describe('ссылка через две таблицы', () => {
  const мир = {
    tables: { лист: { shape: 'single', columns: [{ key: 'раса', label: 'Раса', kind: 'choice', from: 'расы', default: 'огр' }] },
      расы: { label: 'Расы', key: 'word', columns: [{ key: 'размер', label: 'Размер', kind: 'choice', from: 'размеры' }], rows: [] },
      размеры: { label: 'Размеры', key: 'word', columns: [{ key: 'кость', label: 'Кость хитов', kind: 'dice' }], rows: [] },
    },
    constants: {}, effects: {},
  } as unknown as System;

  it('путь раса → размер → кость читается словами', () => {
    render(<FormulaChips value="@раса.размер.кость" system={мир} onChange={() => {}} />);
    expect(screen.getByText('Раса → Размер → Кость хитов')).toBeTruthy();
  });
});

describe('лист поля — часть имени', () => {
  const sheets = new Map([['цель', 'цель'], ['действующий', 'Кто действует']]);

  it('у поля подписан лист, у пришедшего числа — нет', () => {
    render(<FormulaChips
      value="@действующий.бонус_атаки - @event.amount" system={system} sheets={sheets}
      extraNames={new Map([['event.amount', 'пришедшее число']])} onChange={() => {}}
    />);
    expect(screen.getByText('Бонус атаки')).toBeTruthy();
    expect(screen.getAllByText('Кто действует').length).toBe(1);
    expect(screen.getByText('пришедшее число')).toBeTruthy();
  });

  it('подсказка предлагает поле каждого листа по его названию', () => {
    let value = '@сил';
    render(<FormulaChips value={value} system={system} sheets={sheets} onChange={next => { value = next; }} />);
    const input = screen.getByDisplayValue('@сил') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(value.length, value.length);
    fireEvent.click(input);
    const groups = [...document.querySelectorAll('.slot__option')].map(o => o.textContent?.trim());
    expect(groups).toEqual(['поле: цельСила', 'поле: Кто действуетСила']);
    fireEvent.mouseDown(screen.getAllByText('Сила')[1]!);
    expect(value).toBe('@действующий.сила');
  });
});

describe('набор формулы не рвётся посреди имени', () => {
  it('недописанное имя остаётся в том же куске текста — нового пустого поля ввода не появляется', () => {
    const known = (tag: string) => tag === 'сила';
    expect(partsOf('1к20 + @б', known)).toEqual([{ text: '1к20 + @б' }]);
    expect(partsOf('@сила + @б', known)).toEqual([{ text: '' }, { tag: 'сила' }, { text: ' + @б' }]);
  });

  it('стрелка влево в начале куска переходит через фишку в конец предыдущего', () => {
    render(<FormulaChips value="1 + @сила + 2" system={system} onChange={() => {}} />);
    const [first, last] = [...document.querySelectorAll('input.chips__text')] as HTMLInputElement[];
    last!.focus();
    last!.setSelectionRange(0, 0);
    fireEvent.keyDown(last!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(first);
    expect(first!.selectionStart).toBe(first!.value.length);
  });

  it('у входа эффекта — метка «вход», а не лист', () => {
    render(<FormulaChips value="1к20 + @бонус" system={system} onChange={() => {}}
      extraNames={new Map([['бонус', 'Бонус атаки']])} badges={new Map([['бонус', 'вход']])} />);
    expect(screen.getByText('вход')).toBeTruthy();
  });

  it('буква сразу после фишки не приклеивается к её имени', () => {
    let value = '@сила';
    render(<FormulaChips value={value} system={system} onChange={next => { value = next; }} />);
    fireEvent.change([...document.querySelectorAll('input.chips__text')].at(-1)!, { target: { value: 'x' } });
    expect(value).toBe('@сила x');
  });
});

describe('«из таблицы» — кликами и фишками с названиями', () => {
  const withLevels = {
    tables: {
      лист: { shape: 'single', columns: [{ key: 'уровень', label: 'Уровень', kind: 'number' }] },
      уровни: { label: 'Уровень персонажа', key: 'number', columns: [{ key: 'колонка', label: 'Бонус мастерства', kind: 'number' }], rows: [{ value: 1, cells: { колонка: 2 } }] },
    },
    constants: {}, effects: {},
  } as unknown as System;

  it('таблица и колонка внутри «таблица(…)» — фишки с названиями, данные не меняются', () => {
    const value = 'таблица("уровни", @уровень, "колонка")';
    render(<FormulaChips value={value} system={withLevels} onChange={() => {}} />);
    expect(screen.getByText('Уровень персонажа')).toBeTruthy();
    expect(screen.getByText('Бонус мастерства')).toBeTruthy();
    expect(screen.queryByDisplayValue(/уровни/)).toBeNull();
  });

  it('кнопка «из таблицы»: выбрал таблицу и колонку — вставилась формула, строку ищут по тому, что впишут', () => {
    let value = '';
    const { rerender } = render(<FormulaChips value={value} system={withLevels} calculator onChange={next => { value = next; }} />);
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.mouseDown(screen.getByText('из таблицы'));
    fireEvent.change(screen.getByLabelText('какую колонку'), { target: { value: 'колонка' } });
    fireEvent.mouseDown(screen.getByText('Вставить'));
    expect(value).toBe('таблица("уровни", , "колонка")');
    rerender(<FormulaChips value={value} system={withLevels} calculator onChange={next => { value = next; }} />);
    expect(screen.getByText('Уровень персонажа')).toBeTruthy();
  });

  it('колонка, на которую ссылается строка: «из таблицы» берёт её по ссылке, без совпадения имён', () => {
    const linked = { ...withLevels, tables: { ...withLevels.tables, круги: { label: 'Ячейки по кругам', key: 'word', columns: [{ key: 'circle', label: 'Колонка ячеек', kind: 'column', from: 'уровни' }], rows: [] } } } as unknown as System;
    let value = '';
    render(<FormulaChips value={value} system={linked} table="круги" calculator onChange={next => { value = next; }} />);
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.mouseDown(screen.getByText('из таблицы'));
    fireEvent.change(screen.getByLabelText('какую колонку'), { target: { value: 'строка.circle' } });
    fireEvent.mouseDown(screen.getByText('Вставить'));
    expect(value).toBe('таблица("уровни", , @строка.circle)');
  });
});

