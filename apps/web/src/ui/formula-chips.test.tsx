// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormulaChips, partsOf, joinParts } from './formula-chips.tsx';
import { withPicks } from './formula-words.ts';
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

  it('имена «в этом эффекте» стоят выше полей листа, а совпавшие с начала — выше вложенных', () => {
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
    expect(предложено).toEqual(['в этом эффектеКость урона', 'поле листаКость хитов', 'поле листаЛовкость']);
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
    expect(groups).toEqual(['у «цель»Сила', 'у «Кто действует»Сила']);
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

  it('кнопки «из таблицы» больше нет — строку берут ссылкой', () => {
    render(<FormulaChips value="" system={withLevels} calculator onChange={() => {}} />);
    fireEvent.focus(screen.getByRole('textbox'));
    expect(screen.queryByText('из таблицы')).toBeNull();
  });
});


describe('ссылка числом и колонка по значению', () => {
  const linked = {
    tables: {
      лист: { shape: 'single', columns: [
        { key: 'уровень', label: 'Уровень', kind: 'number', from: 'уровни' },
        { key: 'заклинатель', label: 'Уровень заклинателя', kind: 'number', from: 'ячейки' },
      ] },
      уровни: { label: 'Уровень персонажа', key: 'number', columns: [{ key: 'prof', label: 'Бонус мастерства', kind: 'number' }], rows: [{ value: 1, cells: { prof: 2 } }] },
      ячейки: { label: 'Ячейки заклинаний', key: 'number', columns: [{ key: 'круг_1', label: '1-й круг', kind: 'number' }], rows: [{ value: 1, cells: { круг_1: 2 } }] },
      круги: { label: 'Ячейки по кругам', key: 'word', owner: 'sheet', columns: [{ key: 'circle', label: 'Колонка ячеек', kind: 'column', from: 'ячейки' }], rows: [] },
    },
    constants: {}, effects: {},
  } as unknown as System;

  it('колонка по значению — одна часть, собирается обратно без потерь', () => {
    const value = '@заклинатель.[@строка.circle] + 1';
    const parts = partsOf(value);
    expect(parts).toEqual([{ text: '' }, { tag: 'заклинатель', by: '@строка.circle' }, { text: ' + 1' }]);
    expect(joinParts(parts)).toBe(value);
    expect(joinParts(partsOf('@a.["x"].b'))).toBe('@a.["x"].b');
  });

  it('ссылка числом — фишка «Уровень → Бонус мастерства»', () => {
    render(<FormulaChips value="@уровень.prof" system={linked} onChange={() => {}} />);
    expect(screen.getByText('Уровень → Бонус мастерства')).toBeTruthy();
  });

  it('колонка по значению — фишка «[Уровень заклинателя · колонка по [Колонка ячеек]]»', () => {
    render(<FormulaChips value="@заклинатель.[@строка.circle]" system={linked} table="круги" onChange={() => {}} />);
    expect(screen.getByText('Уровень заклинателя · колонка по [Колонка ячеек]')).toBeTruthy();
  });

  it('в таблице с колонкой-ссылкой на колонки меню @ предлагает колонку по значению', () => {
    let value = '@колон';
    render(<FormulaChips value={value} system={linked} table="круги" onChange={next => { value = next; }} />);
    const input = screen.getByDisplayValue('@колон') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByText('Уровень заклинателя · колонка по [Колонка ячеек]'));
    expect(value).toBe('@заклинатель.[@строка.circle]');
  });
});

describe('точка после фишки', () => {
  const options = [
    { group: 'Свойства записи', label: 'Способ атаки', name: 'способ', onPick: () => {} },
    { group: 'По таблице', label: 'Способ атаки · Бонус атаки', name: 'способ.бонус', onPick: () => {} },
    { group: 'По таблице', label: 'Способ атаки · Прибавка к урону', name: 'способ.урон', onPick: () => {} },
  ];
  const names = new Map(options.map(option => [option.name, option.label]));

  it('«.» сразу после фишки — её колонки; выбор заменяет фишку на путь', () => {
    let value = '@способ';
    render(<FormulaChips value={value} system={system} extraNames={names} extraOptions={options} onChange={next => { value = next; }} />);
    const input = document.querySelectorAll('input.chips__text')[1] as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '.', selectionStart: 1 } });
    const shown = [...document.querySelectorAll('.slot__option')].map(o => o.textContent ?? '');
    expect(shown.some(t => t.includes('Бонус атаки')), shown.join(' | ')).toBe(true);
    expect(shown.some(t => t.endsWith('Способ атаки'))).toBe(false);
    fireEvent.mouseDown([...document.querySelectorAll('.slot__option')].find(o => o.textContent?.includes('Бонус атаки'))!);
    expect(value).toBe('@способ.бонус');
  });

  it('после точки набираешь — колонки отбираются по своему названию', () => {
    render(<FormulaChips value="@способ" system={system} extraNames={names} extraOptions={options} onChange={() => {}} />);
    const input = document.querySelectorAll('input.chips__text')[1] as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '.при', selectionStart: 4 } });
    const shown = [...document.querySelectorAll('.slot__option')].map(o => o.textContent ?? '');
    expect(shown.some(t => t.includes('Прибавка к урону')), shown.join(' | ')).toBe(true);
    expect(shown.some(t => t.includes('Бонус атаки'))).toBe(false);
  });
});

describe('итоги шага после набора имени', () => {
  const names = new Map([
    ['бросок', 'бросок'],
    ['бросок.total', 'бросок — сколько вышло всего, с прибавками'],
    ['бросок.natural', 'бросок — что выпало на костях, без прибавок'],
    ['бросок.rolled', 'бросок — сколько костей бросили'],
  ]);
  function Host({ seen }: { seen: (value: string) => void }) {
    const [value, setValue] = useState('');
    seen(value);
    return <FormulaChips value={value} system={system} extraNames={names} onChange={setValue} />;
  }
  const type = (text: string) => {
    for (let i = 1; i <= text.length; i++) {
      const input = document.activeElement?.matches('input.chips__text') ? document.activeElement as HTMLInputElement : document.querySelector('input.chips__text') as HTMLInputElement;
      input.focus();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: text.slice(0, i), selectionStart: i } });
    }
  };
  const menu = () => [...document.querySelectorAll('.slot__option')].map(o => o.textContent ?? '');

  it('дописал имя броска — открыт список: бросок целиком и его итоги', () => {
    let value = '';
    render(<Host seen={next => { value = next; }} />);
    type('@бросок');
    expect(value).toBe('@бросок');
    expect(menu().map(text => text.replace('в этом эффекте', ''))).toEqual([
      'бросок целиком', 'сколько вышло всего, с прибавками', 'что выпало на костях, без прибавок', 'сколько костей бросили',
    ]);
  });

  it('фишка имени шага — просто имя, как у вызова; итог виден у фишки с точкой', () => {
    render(<FormulaChips value="@бросок + @бросок.natural" system={system} extraNames={names} onChange={() => {}} />);
    const chips = [...document.querySelectorAll('.chips__chip')].map(chip => chip.textContent?.replace('×', ''));
    expect(chips).toEqual(['бросок', 'бросок — что выпало на костях']);
  });

  it('выбор итога из списка заменяет фишку', () => {
    let value = '';
    render(<Host seen={next => { value = next; }} />);
    type('@бросок');
    fireEvent.mouseDown([...document.querySelectorAll('.slot__option')].find(o => o.textContent?.includes('на костях'))!);
    expect(value).toBe('@бросок.natural');
    expect(menu()).toEqual([]);
  });

  it('там, где бросок стоит целиком, Enter после имени оставляет его и не перехватывается списком', () => {
    let value = '';
    let entered = 0;
    function Outer() {
      const [text, setText] = useState('');
      value = text;
      return <FormulaChips whole value={text} system={system} extraNames={withPicks(new Map(names), new Map([['бросок', 'бросок.total']]))} onChange={setText} onKeyDown={e => { if (e.key === 'Enter') entered += 1; }} />;
    }
    const view = render(<Outer />);
    type('@бросок');
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(value).toBe('@бросок');
    expect(menu()).toEqual([]);
    view.unmount();
    expect(entered).toBe(1);
  });

  it('щелчок по готовой фишке открывает итоги того же шага, выбор заменяет фишку', () => {
    let value = '';
    function Ready() {
      const [text, setText] = useState('@бросок.natural + 2');
      value = text;
      return <FormulaChips value={text} system={system} extraNames={names} onChange={setText} />;
    }
    render(<Ready />);
    fireEvent.mouseDown(screen.getByText(/что выпало на костях/));
    expect(menu().length).toBe(4);
    expect(document.querySelector('.slot__option--lit')?.textContent).toContain('что выпало на костях');
    fireEvent.mouseDown([...document.querySelectorAll('.slot__option')].find(o => o.textContent?.includes('сколько костей бросили'))!);
    expect(value).toBe('@бросок.rolled + 2');
  });

  it('там, где нужно число, после имени броска костей подсвечено «всего», Enter ставит его', () => {
    let value = '';
    function Numeric() {
      const [text, setText] = useState('');
      value = text;
      return <FormulaChips value={text} system={system} extraNames={withPicks(new Map(names), new Map([['бросок', 'бросок.total']]))} onChange={setText} />;
    }
    render(<Numeric />);
    type('@бросок');
    expect(document.querySelector('.slot__option--lit')?.textContent).toContain('сколько вышло всего');
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(value).toBe('@бросок.total');
  });

  it('буква после имени закрывает список и не клеится к фишке', () => {
    let value = '';
    render(<Host seen={next => { value = next; }} />);
    type('@бросок');
    const input = document.activeElement as HTMLInputElement;
    fireEvent.change(input, { target: { value: '+', selectionStart: 1 } });
    expect(value).toBe('@бросок+');
  });
});

describe('курсор после подсказки', () => {
  it('выбрал подсказку — курсор после вставленной фишки, а не перед ней', () => {
    const names = new Map([['способ', 'Способ атаки']]);
    function Host() {
      const [value, setValue] = useState('');
      const options = [{ group: 'Свойства записи', label: 'Способ атаки', name: 'способ', onPick: (insert: (piece: string) => string) => setValue(insert('@способ')) }];
      return <FormulaChips value={value} system={system} extraNames={names} extraOptions={options} onChange={setValue} />;
    }
    render(<Host />);
    const input = document.querySelector('input.chips__text') as HTMLInputElement;
    input.focus();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '@спос', selectionStart: 5 } });
    fireEvent.mouseDown([...document.querySelectorAll('.slot__option')].find(o => o.textContent?.includes('Способ атаки'))!);
    const inputs = [...document.querySelectorAll('input.chips__text')];
    expect(inputs.length).toBe(2);
    expect(document.activeElement).toBe(inputs[1]);
  });
});
